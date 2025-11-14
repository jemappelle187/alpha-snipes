// lib/sol_price.ts

import { fetchQuoteResilient } from './quote_client';

let last = { t: 0, solUsd: 0 };

const TTL_MS = 60_000;
const DEBUG = process.env.DEBUG_SOLPRICE === '1';

export async function getSolUsd(): Promise<number> {
  const now = Date.now();
  // Check cache validity
  if (now - last.t < TTL_MS && last.solUsd > 0) {
    if (DEBUG) console.log(`[sol_price] Returning cached SOL/USD price: ${last.solUsd}`);
    return last.solUsd;
  }
  if (DEBUG) console.log('[sol_price] Cache expired or empty, fetching new SOL/USD price');
  try {
    // Fetch new price quote
    const r = await fetchQuoteResilient({
      inputMint: 'So11111111111111111111111111111111111111112', // SOL
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      amount: 1_000_000_000, // 1 SOL in lamports
      slippageBps: 30
    }, { maxAttempts: 2, timeoutMs: 1500 });
    // Parse and validate response
    if (r.ok && typeof r.quote?.outAmount === 'string' && r.quote.outAmount !== '') {
      const usdc = Number(r.quote.outAmount) / 1_000_000;
      if (Number.isFinite(usdc) && usdc > 0) {
        last = { t: now, solUsd: usdc }; // Update cache
        if (DEBUG) console.log(`[sol_price] Updated cached SOL/USD price: ${usdc}`);
      }
    }
  } catch (error) {
    if (DEBUG) console.error('[sol_price] Error fetching SOL/USD price:', error);
  }
  return last.solUsd || 0;
}



