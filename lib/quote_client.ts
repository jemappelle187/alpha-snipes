// lib/quote_client.ts
import dns from 'dns';
import fetch from 'node-fetch';
import { JUP_QUOTE_BASE } from './jupiter_endpoints.js';

// Allow overriding DNS from env, else use Cloudflare + Google
const DNS_OVERRIDE = process.env.DNS_OVERRIDE?.split(',').map(s => s.trim()).filter(Boolean)
  ?? ['1.1.1.1','1.0.0.1','8.8.8.8','8.8.4.4'];
try { dns.setServers(DNS_OVERRIDE); } catch {}

// Raw list of potential base URLs
const RAW_BASES = [
  JUP_QUOTE_BASE,                               // from env or default
  'https://lite-api.jup.ag/swap/v1/quote',      // primary public
  'https://quoting.jup.ag/v6/quote',            // alt v6
  'https://quote-api.jup.ag/v6/quote',          // legacy v6
];

function sanitizeBases(bases: string[]): string[] {
  // unique, non-empty, must start with http
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of bases) {
    const s = (b || '').trim();
    if (!s) continue;
    if (!/^https?:\/\//i.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

const DEFAULT_BASES = sanitizeBases(RAW_BASES);

// ═══════════════════════════════════════════════════════════════════════════════
// Soft Rate Limiting
// ═══════════════════════════════════════════════════════════════════════════════

// Map to track last quote timestamp by key (inputMint:outputMint:amount)
// Ensures minimum gap between requests for the same token pair and amount to avoid spamming
const lastQuoteAtByKey = new Map<string, number>();

// Global rate limit window and max calls within that window
const GLOBAL_WINDOW_MS = 1000;      // 1 second window
const GLOBAL_MAX_CALLS = 5;         // max 5 calls per window globally (tightened from 6)

// Minimum gap between calls for the same key (inputMint:outputMint:amount)
const PER_KEY_MIN_GAP_MS = 3000;    // 3 seconds gap (tightened from 2200ms)

const globalTimestamps: number[] = [];

// Failure-specific cooldowns for keys after receiving 429 or 400 responses
// Prevents hammering the API when it signals overload or bad requests
const failureCooldown = new Map<string, number>(); // key -> resumeAtMs
const COOLDOWN_429_MS = 20_000;  // 20 seconds cooldown after 429 (rate limit)
const COOLDOWN_400_MS = 60_000;  // 60 seconds cooldown after 400 (bad request)

function cooldownKey(inputMint: string, outputMint: string, amount: number) {
  return `${inputMint}:${outputMint}:${amount}`;
}

function allowGlobal(): boolean {
  const now = Date.now();
  while (globalTimestamps.length) {
    const oldest = globalTimestamps[0]!;
    if (now - oldest <= GLOBAL_WINDOW_MS) break;
    globalTimestamps.shift();
  }
  if (globalTimestamps.length >= GLOBAL_MAX_CALLS) return false;
  globalTimestamps.push(now);
  return true;
}

function allowKey(key: string): boolean {
  const now = Date.now();
  const last = lastQuoteAtByKey.get(key) ?? 0;
  if (now - last < PER_KEY_MIN_GAP_MS) return false;
  lastQuoteAtByKey.set(key, now);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════

type QuoteParams = {
  inputMint: string;
  outputMint: string;
  amount: string | number;
  slippageBps?: number;
};

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

export async function fetchQuoteResilient(
  params: QuoteParams,
  opts?: { maxAttempts?: number; bases?: string[]; timeoutMs?: number }
) {
  // Failure cooldown check (429/400 responses)
  const ckey = cooldownKey(params.inputMint, params.outputMint, Number(params.amount));
  const now = Date.now();
  const resumeAt = failureCooldown.get(ckey) || 0;
  if (now < resumeAt) {
    if (process.env.DEBUG_QUOTE === '1') {
      console.log('[DBG][QUOTE] skip cooldown', ckey.slice(0, 50), 'until', new Date(resumeAt).toISOString());
    }
    return { 
      ok: false as const, 
      error: new Error('quote-skipped-cooldown') 
    };
  }

  // Rate limit check (per-key and global)
  const key = `${params.inputMint}:${params.outputMint}:${params.amount}`;
  if (!allowKey(key) || !allowGlobal()) {
    if (process.env.DEBUG_QUOTE === '1') {
      const reason = !allowKey(key) ? 'per-key rate limit' : 'global rate limit';
      console.log(`[DBG][QUOTE] quote skipped (${reason})`, { key: key.slice(0, 50) });
    }
    // Return typed error so caller can gracefully skip
    return { 
      ok: false as const, 
      error: new Error('quote-skipped-rate-limit') 
    };
  }
  
  const maxAttempts = opts?.maxAttempts ?? 5;
  const bases = (opts?.bases && opts?.bases.length ? opts.bases : DEFAULT_BASES);
  const timeoutMs = opts?.timeoutMs ?? 2500;

  const search = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
    slippageBps: String(params.slippageBps ?? 3000),
  });

  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const base of bases) {
      // Skip invalid bases
      if (!base || !/^https?:\/\//i.test(base)) {
        if (process.env.DEBUG_QUOTE === '1') {
          console.log('[DBG][QUOTE] skip invalid base:', base);
        }
        continue;
      }
      
      const url = `${base}?${search.toString()}`;
      if (process.env.DEBUG_QUOTE === '1') {
        console.log('[DBG][QUOTE] url =', url);
      }
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeoutMs);
        const resp = await fetch(url, { signal: ctl.signal } as any);
        clearTimeout(t);
        if (!resp.ok) {
          lastErr = new Error(`HTTP ${resp.status} ${resp.statusText} @ ${base}`);
          // Set failure cooldown for 429 (rate limit) and 400 (bad request)
          if (resp.status === 429) {
            failureCooldown.set(ckey, Date.now() + COOLDOWN_429_MS);
            if (process.env.DEBUG_QUOTE === '1') {
              console.log(`[DBG][QUOTE] cooldown applied for 429 on key ${ckey} for ${COOLDOWN_429_MS}ms`);
            }
            await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
          }
          if (resp.status === 400) {
            failureCooldown.set(ckey, Date.now() + COOLDOWN_400_MS);
            if (process.env.DEBUG_QUOTE === '1') {
              console.log(`[DBG][QUOTE] cooldown applied for 400 on key ${ckey} for ${COOLDOWN_400_MS}ms`);
            }
          }
          continue;
        }
        const json: any = await resp.json();
        // Jupiter v6 returns direct object (not data array wrapper)
        if (!json || (!json.outAmount && !json.data)) {
          lastErr = new Error(`empty quote @ ${base}`);
          continue;
        }
        // Return the quote object directly
        if (process.env.DEBUG_QUOTE === '1') {
          console.log(`[DBG][QUOTE] quote success from base: ${base}`);
        }
        return { ok: true as const, base, quote: json };
      } catch (e: any) {
        lastErr = e;
        // ENOTFOUND / DNS / abort / network → try next base or backoff
      }
    }
    // Exponential backoff: 300ms, 600ms, 1.2s, ...
    if (attempt < maxAttempts) {
      await sleep(300 * Math.pow(2, attempt - 1));
    }
  }
  return { ok: false as const, error: lastErr };
}

export function explainQuoteError(err: any): string {
  const msg = String(err?.message || err);
  if (/quote-skipped-cooldown/i.test(msg)) return 'temporary cooldown (429/400 backoff)';
  if (/quote-skipped-rate-limit/i.test(msg)) return 'rate-limited (cooling down). Too many requests to Jupiter API — slowing down temporarily.';
  if (/Invalid URL/i.test(msg)) return 'invalid quote base URL (sanitized)';
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) return 'DNS lookup failed (quote host unreachable). This means Jupiter’s quote server could not be resolved (temporary outage or DNS issue).';
  if (/aborted/i.test(msg)) return 'network timeout contacting quote API';
  if (/HTTP 400/i.test(msg)) return msg + ' Likely invalid quote parameters or insufficient liquidity.';
  if (/HTTP/i.test(msg)) return msg; // include status if we have it
  if (/empty quote/i.test(msg)) return 'quote API returned no routes';
  return msg;
}
