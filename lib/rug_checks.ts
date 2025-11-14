// lib/rug_checks.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import fetch from 'node-fetch';
import { JUP_QUOTE_BASE } from './jupiter_endpoints.js';

const DEBUG = process.env.DEBUG_RUG === '1';

export type SafetyReport = {
  ok: boolean;
  reasons: string[];
  entryPrice?: number; // SOL per token (quote)
};

// Jupiter V6 Quote API
async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number
): Promise<any> {
  const url = `${JUP_QUOTE_BASE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  if (DEBUG) console.log(`[RUG CHECK] Fetching Jupiter quote: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.statusText}`);
  return await res.json();
}

export async function basicRugChecks(
  connection: Connection,
  mint: PublicKey,
  buySol: number,
  opts: {
    requireAuthorityRevoked: boolean;
    maxTaxBps: number;
    maxImpactBps: number;
  }
): Promise<SafetyReport> {
  const reasons: string[] = [];

  // 1) Check if mint and freeze authorities are revoked.
  //    This is important because active authorities can potentially freeze or mint tokens, indicating risk.
  if (DEBUG) console.log('[RUG CHECK] Starting authority revocation check');
  try {
    const mintInfo = await getMint(connection, mint);
    const mintAuthOk = mintInfo.mintAuthority === null;
    const freezeAuthOk = mintInfo.freezeAuthority === null;
    if (opts.requireAuthorityRevoked && (!mintAuthOk || !freezeAuthOk)) {
      const reason = 'authority_not_revoked: mint/freeze authority still active';
      reasons.push(reason);
      if (DEBUG) console.log(`[RUG CHECK] Authority check failed: ${reason}`);
    }
  } catch (err: any) {
    const reason = `mint_read_failed: ${err.message || err}`;
    reasons.push(reason);
    if (DEBUG) console.log(`[RUG CHECK] Authority check error: ${reason}`);
  }
  if (DEBUG) console.log('[RUG CHECK] Finished authority revocation check');

  // 2) Verify that a swap route exists and price impact is within sane limits for the intended buy size.
  //    This ensures liquidity and that the token can be swapped without excessive slippage.
  if (DEBUG) console.log('[RUG CHECK] Starting buy quote check');
  const SOL = 'So11111111111111111111111111111111111111112';
  const lamports = Math.floor(buySol * 1e9);

  let buyQuote: any;
  try {
    buyQuote = await getJupiterQuote(SOL, mint.toBase58(), lamports, opts.maxImpactBps);
  } catch (err: any) {
    const reason = 'no_route_buy: Jupiter could not find a swap path (illiquid or new token)';
    reasons.push(reason);
    if (DEBUG) console.log(`[RUG CHECK] Buy quote failed: ${reason} - ${err.message || err}`);
    return { ok: false, reasons };
  }

  if (!buyQuote || !buyQuote.outAmount) {
    const reason = 'bad_buy_quote';
    reasons.push(reason);
    if (DEBUG) console.log(`[RUG CHECK] Buy quote invalid: ${reason}`);
    return { ok: false, reasons };
  }

  const outTokens = Number(buyQuote.outAmount);
  if (outTokens <= 0) {
    const reason = 'bad_out_amount';
    reasons.push(reason);
    if (DEBUG) console.log(`[RUG CHECK] Buy quote out amount invalid: ${reason}`);
    return { ok: false, reasons };
  }
  if (DEBUG) console.log('[RUG CHECK] Finished buy quote check');

  // 3) Tax / honeypot sanity check (rough heuristic):
  //    Compare buy and immediate sell quotes on the quoted amounts.
  //    If selling immediately results in loss beyond max tax, flag it as potential honeypot or excessive tax.
  if (DEBUG) console.log('[RUG CHECK] Starting sell quote (tax) check');
  let sellQuote: any;
  try {
    sellQuote = await getJupiterQuote(mint.toBase58(), SOL, buyQuote.outAmount, opts.maxImpactBps);
  } catch (err: any) {
    const reason = 'no_route_sell: token cannot be swapped back to SOL (potential honeypot)';
    reasons.push(reason);
    if (DEBUG) console.log(`[RUG CHECK] Sell quote failed: ${reason} - ${err.message || err}`);
  }

  if (!sellQuote || !sellQuote.outAmount) {
    const reason = 'bad_sell_quote';
    reasons.push(reason);
    if (DEBUG) console.log(`[RUG CHECK] Sell quote invalid: ${reason}`);
  } else {
    const solBack = Number(sellQuote.outAmount) / 1e9;
    const lossBps = Math.max(0, ((buySol - solBack) / buySol) * 10_000);
    if (lossBps > opts.maxTaxBps) {
      const reason = `excessive_tax_${Math.round(lossBps)}bps`;
      reasons.push(reason);
      if (DEBUG) console.log(`[RUG CHECK] Excessive tax detected: ${reason}`);
    }
  }
  if (DEBUG) console.log('[RUG CHECK] Finished sell quote (tax) check');

  const ok = reasons.length === 0;

  // Derive a small-size price for monitoring (avoid huge amounts)
  // This provides a reference entry price for the token in SOL.
  let entryPrice: number | undefined;
  try {
    const tinyQuote = await getJupiterQuote(SOL, mint.toBase58(), 1_000_000, 1000); // 0.001 SOL
    if (tinyQuote && tinyQuote.outAmount) {
      const out = Number(tinyQuote.outAmount);
      if (out > 0) entryPrice = 0.001 / out;
    }
  } catch {
    /* ignore */
  }

  return { ok, reasons, entryPrice };
}
