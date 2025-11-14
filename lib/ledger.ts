// lib/ledger.ts
// Durable trade ledger with safe appends, resilient reads,
// and summary/analytics helpers for Telegram.

import fs from 'fs';
import path from 'path';

export type TradeEntry = {
  t: number;                // ms timestamp
  kind: 'buy' | 'sell';
  mode: 'paper' | 'live';
  mint: string;
  alpha?: string;           // alpha wallet (source of signal)
  sizeSol?: number;         // for buys (SOL amount committed)
  entryPriceSol?: number;   // SOL/token
  entryUsd?: number;        // total USD spent on buy
  exitPriceSol?: number;    // SOL/token
  exitUsd?: number;         // total USD received on sell (paper/live)
  pnlSol?: number;          // realized PnL in SOL (only for sells)
  pnlUsd?: number;          // realized PnL in USD (only for sells)
  pnlPct?: number;          // percent on position (only for sells)
  durationSec?: number;     // seconds held
  tx?: string;              // transaction signature (or [PAPER-*])
};

// ---- File paths / rotation ----
const LEDGER_DIR = path.join(process.cwd(), 'data');
const LEDGER_FILE = path.join(LEDGER_DIR, 'trades.jsonl');
// Soft cap to avoid unbounded growth (10 MB)
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Append one trade entry to JSONL ledger.
 * - Creates ./data directory as needed.
 * - Uses fs.open + fs.write + fs.fsync for extra safety.
 * - Falls back to appendFileSync if needed.
 */
export function recordTrade(row: TradeEntry) {
  try {
    fs.mkdirSync(LEDGER_DIR, { recursive: true });

    // Soft rotation if file is too large (rename with .bak timestamp)
    try {
      const st = fs.statSync(LEDGER_FILE);
      if (st.size > MAX_BYTES) {
        const backup = LEDGER_FILE.replace(/\.jsonl$/, `.${Date.now()}.bak.jsonl`);
        fs.renameSync(LEDGER_FILE, backup);
      }
    } catch {
      // no file yet → ignore
    }

    const line = JSON.stringify(row) + '\n';
    const fd = fs.openSync(LEDGER_FILE, 'a');
    try {
      fs.writeFileSync(fd, line, { encoding: 'utf8' });
      fs.fsyncSync(fd); // ensure durability on sudden crashes
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    // As a last resort, try a simple append
    try { fs.appendFileSync(LEDGER_FILE, JSON.stringify(row) + '\n'); } catch {}
  }
}

/**
 * Read the last `limit` trades from the JSONL file.
 * - Skips malformed lines instead of throwing.
 */
export function readTrades(limit = 2000): TradeEntry[] {
  try {
    const txt = fs.readFileSync(LEDGER_FILE, 'utf8');
    const lines = txt.trim().split('\n');
    const slice = lines.slice(Math.max(0, lines.length - limit));
    const out: TradeEntry[] = [];
    for (const l of slice) {
      try {
        const obj = JSON.parse(l);
        if (obj && typeof obj === 'object' && typeof obj.t === 'number') {
          out.push(obj as TradeEntry);
        }
      } catch {
        // skip bad lines
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ---- Summary helpers ----

export type Summary = {
  count: number;     // total rows in range
  buys: number;
  sells: number;
  pnlUsd: number;
  pnlSol: number;
  winRatePct: number;     // sells with pnlUsd > 0 over sells
  avgWinUsd: number;      // average of positive pnlUsd (0 if none)
  avgLossUsd: number;     // average of negative pnlUsd (0 if none)
};

export function summarize(trades: TradeEntry[], sinceMs?: number): Summary {
  const f = sinceMs ? trades.filter(t => t.t >= sinceMs) : trades;
  let pnlUsd = 0, pnlSol = 0, buys = 0, sells = 0;
  let wins = 0, sumWin = 0, winCount = 0;
  let sumLoss = 0, lossCount = 0;

  for (const t of f) {
    if (t.kind === 'sell') {
      sells++;
      if (typeof t.pnlUsd === 'number') {
        pnlUsd += t.pnlUsd;
        if (t.pnlUsd > 0) { wins++; sumWin += t.pnlUsd; winCount++; }
        else if (t.pnlUsd < 0) { sumLoss += t.pnlUsd; lossCount++; }
      }
      if (typeof t.pnlSol === 'number') pnlSol += t.pnlSol;
    } else if (t.kind === 'buy') {
      buys++;
    }
  }

  const winRatePct = sells > 0 ? (wins / sells) * 100 : 0;
  const avgWinUsd  = winCount  > 0 ? (sumWin  / winCount)  : 0;
  const avgLossUsd = lossCount > 0 ? (sumLoss / lossCount) : 0;

  return { count: f.length, buys, sells, pnlUsd, pnlSol, winRatePct, avgWinUsd, avgLossUsd };
}

/**
 * Convenience helper to compute a since timestamp:
 *  - '24h' → last 24 hours
 *  - 'today' → since local midnight
 *  - '7d' → last 7 days
 *  - default/unknown → undefined (all time)
 */
export function sinceToMs(since?: string): number | undefined {
  if (!since) return undefined;
  const now = Date.now();
  const s = since.toLowerCase();
  if (s === '24h' || s === '1d') return now - 24 * 60 * 60 * 1000;
  if (s === '7d' || s === 'week') return now - 7 * 24 * 60 * 60 * 1000;
  if (s === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return undefined;
}

/**
 * Render a short human-friendly summary string.
 * Example: "Buys: 3 | Sells: 2 | PnL: +$1.23 (+0.0045 SOL) | Win rate: 50.0%"
 */
export function renderSummary(sum: Summary): string {
  const usd = (n: number) => (n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`);
  const sol = (n: number) => (n >= 0 ? `+${n.toFixed(4)} SOL` : `-${Math.abs(n).toFixed(4)} SOL`);
  const wr  = `${sum.winRatePct.toFixed(1)}%`;
  return `Buys: ${sum.buys} | Sells: ${sum.sells} | PnL: ${usd(sum.pnlUsd)} (${sol(sum.pnlSol)}) | Win rate: ${wr}`;
}

// ---- Advanced analytics (top trades, alpha contribution) ----

/**
 * Shorten long addresses for display.
 * Example: EPjFWdd5...Dt1v
 */
export function shortAddr(s: string, left = 8, right = 4): string {
  if (!s) return '';
  if (s.length <= left + right + 3) return s;
  return `${s.slice(0, left)}…${s.slice(-right)}`;
}

/**
 * Return only realized (sell) trades within optional sinceMs window.
 */
function realizedSellsInRange(trades: TradeEntry[], sinceMs?: number): TradeEntry[] {
  const f = trades.filter(t => t.kind === 'sell' && typeof t.pnlUsd === 'number');
  return sinceMs ? f.filter(t => t.t >= sinceMs) : f;
}

/**
 * Pick top N by pnlUsd (descending winners, ascending losers).
 */
export function topTrades(trades: TradeEntry[], sinceMs?: number, n = 3): {
  winners: TradeEntry[];
  losers: TradeEntry[];
} {
  const sells = realizedSellsInRange(trades, sinceMs);
  const winners = [...sells].sort((a, b) => (b.pnlUsd ?? 0) - (a.pnlUsd ?? 0)).slice(0, n);
  const losers  = [...sells].sort((a, b) => (a.pnlUsd ?? 0) - (b.pnlUsd ?? 0)).slice(0, n);
  return { winners, losers };
}

/**
 * Aggregate realized PnL by alpha wallet (source of signal).
 * Returns sorted asc (worst first) so the biggest loss contributors are on top.
 */
export function summarizeByAlpha(trades: TradeEntry[], sinceMs?: number): Array<{ alpha: string; pnlUsd: number; sells: number; }> {
  const sells = realizedSellsInRange(trades, sinceMs);
  const map = new Map<string, { pnlUsd: number; sells: number }>();
  for (const t of sells) {
    const key = t.alpha || '(unknown)';
    const cur = map.get(key) || { pnlUsd: 0, sells: 0 };
    cur.pnlUsd += (t.pnlUsd ?? 0);
    cur.sells += 1;
    map.set(key, cur);
  }
  const out = Array.from(map.entries()).map(([alpha, v]) => ({ alpha, pnlUsd: v.pnlUsd, sells: v.sells }));
  // sort by pnlUsd ascending (most negative first)
  out.sort((a, b) => a.pnlUsd - b.pnlUsd);
  return out;
}

/**
 * Render a compact "Top" section suitable for Telegram.
 * Shows winners, losers, and worst alpha contributors.
 */
export function renderTopSection(trades: TradeEntry[], sinceMs?: number, n = 3): string {
  const { winners, losers } = topTrades(trades, sinceMs, n);
  const byAlpha = summarizeByAlpha(trades, sinceMs);

  const fmtUsd = (x: number) => (x >= 0 ? `+$${x.toFixed(2)}` : `-$${Math.abs(x).toFixed(2)}`);

  const wLines = winners.length
    ? winners.map((t, i) => `#${i + 1} ${fmtUsd(t.pnlUsd ?? 0)}  (${shortAddr(t.mint)})`).join('\n')
    : '—';

  const lLines = losers.length
    ? losers.map((t, i) => `#${i + 1} ${fmtUsd(t.pnlUsd ?? 0)}  (${shortAddr(t.mint)})`).join('\n')
    : '—';

  const worstAlphas = byAlpha.slice(0, n);
  const aLines = worstAlphas.length
    ? worstAlphas.map(a => `${shortAddr(a.alpha)}: ${fmtUsd(a.pnlUsd)} (sells ${a.sells})`).join('\n')
    : '—';

  return [
    '🏆 Top winners:',
    wLines,
    '',
    '📉 Biggest losses:',
    lLines,
    '',
    '🧠 Loss contributors by wallet:',
    aLines
  ].join('\n');
}


