// lib/rug_checks.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import fetch from 'node-fetch';

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
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
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

  // 1) Mint / Freeze authority revoked?
  try {
    const mintInfo = await getMint(connection, mint);
    const mintAuthOk = mintInfo.mintAuthority === null;
    const freezeAuthOk = mintInfo.freezeAuthority === null;
    if (opts.requireAuthorityRevoked && (!mintAuthOk || !freezeAuthOk)) {
      reasons.push('authority_not_revoked');
    }
  } catch (err: any) {
    reasons.push(`mint_read_failed: ${err.message || err}`);
  }

  // 2) Route exists and price impact sane for intended size
  const SOL = 'So11111111111111111111111111111111111111112';
  const lamports = Math.floor(buySol * 1e9);

  let buyQuote: any;
  try {
    buyQuote = await getJupiterQuote(SOL, mint.toBase58(), lamports, opts.maxImpactBps);
  } catch (err: any) {
    reasons.push(`no_route_buy: ${err.message || err}`);
    return { ok: false, reasons };
  }

  if (!buyQuote || !buyQuote.outAmount) {
    reasons.push('bad_buy_quote');
    return { ok: false, reasons };
  }

  const outTokens = Number(buyQuote.outAmount);
  if (outTokens <= 0) {
    reasons.push('bad_out_amount');
    return { ok: false, reasons };
  }

  // 3) Tax / honeypot sanity (rough):
  //   We compare buy and immediate sell quotes on the *quoted* amounts.
  //   If (buy->sell) loses > MAX_TAX_BPS (beyond slippage), flag it.
  let sellQuote: any;
  try {
    sellQuote = await getJupiterQuote(mint.toBase58(), SOL, buyQuote.outAmount, opts.maxImpactBps);
  } catch (err: any) {
    reasons.push(`no_route_sell: ${err.message || err}`);
  }

  if (!sellQuote || !sellQuote.outAmount) {
    reasons.push('bad_sell_quote');
  } else {
    const solBack = Number(sellQuote.outAmount) / 1e9;
    const lossBps = Math.max(0, ((buySol - solBack) / buySol) * 10_000);
    if (lossBps > opts.maxTaxBps) {
      reasons.push(`excessive_tax_${Math.round(lossBps)}bps`);
    }
  }

  const ok = reasons.length === 0;

  // Derive a small-size price for monitoring (avoid huge amounts)
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


