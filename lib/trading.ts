// lib/trading.ts
// Unified entry planning for both live and paper mode

import { PublicKey } from "@solana/web3.js";
import { fetchQuoteResilient } from "./quote_client.js";
import { explainQuoteError } from "./quote_client.js";

export type PriceReliability = "ok" | "unavailable";

export interface PlannedEntry {
  mint: string;
  sizeSol: number;         // how much SOL we want to spend
  tokens: bigint;          // estimated tokens out
  entryPrice: number;      // SOL per token
  reliability: PriceReliability;
  quote: any;              // Jupiter quote response
}

/**
 * Returns a fully planned entry or `null` when Jupiter has no route.
 * This function is shared by both live and paper modes.
 */
export async function planEntryWithQuote(
  mint: string,
  sizeSol: number,
): Promise<PlannedEntry | null> {
  const mintPk = new PublicKey(mint);
  const SOL = 'So11111111111111111111111111111111111111112';
  const lamports = Math.floor(sizeSol * 1e9);

  try {
    const result = await fetchQuoteResilient({
      inputMint: SOL,
      outputMint: mint,
      amount: lamports,
      slippageBps: 300,
    });
    
    if (!result.ok) {
      // Check if it's a "no route" error
      const reason = explainQuoteError(result.error);
      if (reason.includes('no route') || reason.includes('No route') || reason.includes('could not find')) {
        return null;
      }
      // Re-throw other errors
      throw new Error(`Jupiter quote failed: ${reason}`);
    }
    
    const quote = result.quote;
    if (!quote || !quote.outAmount) {
      // No swap path: illiquid / new token / Jupiter unavailable
      return null;
    }

    const outAmount = Number(quote.outAmount);
    if (!outAmount || outAmount <= 0) {
      return null;
    }

    const tokens = BigInt(Math.floor(outAmount));
    const entryPrice = sizeSol / Number(tokens); // SOL per token

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return null;
    }

    return {
      mint,
      sizeSol,
      tokens,
      entryPrice,
      reliability: "ok",
      quote,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    // Check if it's a "no route" error
    if (errMsg.includes('no_route') || 
        errMsg.includes('No route') || 
        errMsg.includes('could not find a swap path') ||
        errMsg.includes('Jupiter quote failed')) {
      return null;
    }
    // Re-throw other errors (network, rate limit, etc.)
    throw err;
  }
}

