// lib/format.ts
// Provides consistent number, currency, and hyperlink formatting for Telegram messages and logs.

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });
const nfUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Convert lamports (1e9) to SOL safely */
export function lamportsToSol(l: number | string): number {
  const n = typeof l === 'string' ? Number(l) : l;
  if (!Number.isFinite(n)) return 0;
  return n / 1_000_000_000;
}

/** Format a number to SOL with trimmed trailing zeros */
export function formatSol(n: number): string {
  if (!Number.isFinite(n)) return '0 SOL';
  const s = nf.format(n);
  const trimmed = s.includes('.') ? s.replace(/\.0+$/, '').replace(/\.$/, '') : s;
  return `${trimmed} SOL`;
}

/** Format USD with currency symbol and proper rounding */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  return nfUsd.format(n);
}

/** Format token amounts with appropriate precision (e.g., 1.5M, 25.4K, 1,234) */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(2)}B`;
  }
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(2)}K`;
  }
  return nf.format(n);
}

/** Shorten long addresses or hashes (e.g., wallet or mint) */
export function short(str: string, left = 6, right = 4): string {
  if (!str) return '';
  if (str.length <= left + right + 1) return str;
  return `${str.slice(0, left)}…${str.slice(-right)}`;
}

// Normalizes "<1m" to "≤1m" (defensive; ago() now emits ≤1m directly)
export function normAgo(s: string): string {
  return s.replace("<1m", "≤1m");
}

// Escape for Telegram HTML
export function esc(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// Convenience: normalize *and* escape in one shot (safe for all time strings)
export function safeAgo(s: string): string {
  return esc(normAgo(s));
}

/** Telegram-safe Solscan hyperlinks */
export function solscanTx(sig: string) {
  return `<a href="https://solscan.io/tx/${sig}">🔗 TX</a>`;
}
export function solscanMint(mint: string) {
  return `<a href="https://solscan.io/address/${mint}">🪙 Mint</a>`;
}
export function solscanWallet(w: string) {
  return `<a href="https://solscan.io/address/${w}">👤 Alpha</a>`;
}

/**
 * Build combined explorer link row for inline Telegram use.
 * Example output: 🪙 Mint | 👤 Alpha | 🔗 TX
 */
export function combinedLinks(mint?: string, alpha?: string, tx?: string): string {
  const parts = [];
  if (mint) parts.push(solscanMint(mint));
  if (alpha) parts.push(solscanWallet(alpha));
  if (tx) parts.push(solscanTx(tx));
  return parts.join(' | ');
}
