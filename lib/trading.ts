// lib/trading.ts
// Unified entry planning for both live and paper mode

import { PublicKey, Connection } from "@solana/web3.js";
import { fetchQuoteResilient } from "./quote_client.js";
import { explainQuoteError } from "./quote_client.js";

export type PriceReliability = "ok" | "unavailable";

export interface PlannedEntry {
  mint: string;
  sizeSol: number;         // how much SOL we want to spend
  tokens: bigint;          // estimated tokens out (in UI units, not raw)
  entryPrice: number;      // SOL per token (UI units)
  reliability: PriceReliability;
  quote: any;              // Jupiter quote response
}

/**
 * Returns a fully planned entry or `null` when Jupiter has no route.
 * This function is shared by both live and paper modes.
 * 
 * CRITICAL: entryPrice is calculated as sizeSol / tokensUI where tokensUI
 * is the token amount in UI units (after dividing by 10^decimals).
 */
export async function planEntryWithQuote(
  mint: string,
  sizeSol: number,
  connection?: Connection,
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

    const outAmountRaw = Number(quote.outAmount);
    if (!outAmountRaw || outAmountRaw <= 0) {
      return null;
    }

    // CRITICAL: Get token decimals to convert raw amount to UI units
    // Jupiter's outAmount is in smallest token unit (raw), we need UI units
    let tokenDecimals = 9; // Default assumption (most common)
    if (connection) {
      try {
        const mintInfo = await connection.getParsedAccountInfo(mintPk);
        const parsed = mintInfo.value?.data;
        if (parsed && 'parsed' in parsed && parsed.parsed?.info?.decimals !== undefined) {
          tokenDecimals = Number(parsed.parsed.info.decimals);
        }
      } catch {
        // If we can't get decimals, assume 9 (most common)
        // Some tokens (especially pump.fun) have 0 decimals, but we'll handle that in sanity check
      }
    }

    // Convert raw token amount to UI units
    const tokensUI = outAmountRaw / Math.pow(10, tokenDecimals);
    
    // Sanity check: if price is unreasonably small, try 0 decimals (common for pump.fun tokens)
    let finalTokensUI = tokensUI;
    let finalDecimals = tokenDecimals;
    if (tokensUI > 0) {
      const priceWithDecimals = sizeSol / tokensUI;
      if (priceWithDecimals < 1e-6 && tokenDecimals === 9) {
        // Try 0 decimals assumption
        const tokensUI0 = outAmountRaw; // Assume 0 decimals
        const price0 = sizeSol / tokensUI0;
        // Only use 0 decimals if it gives a more reasonable price (between 1e-6 and 1e-2)
        if (price0 >= 1e-6 && price0 <= 1e-2) {
          finalTokensUI = tokensUI0;
          finalDecimals = 0;
        }
      }
    }

    if (finalTokensUI <= 0) {
      return null;
    }

    // Calculate entry price: SOL per token (UI units)
    const entryPrice = sizeSol / finalTokensUI;

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return null;
    }

    // Sanity check: entry price should be in reasonable range (1e-8 to 1e0 SOL/token)
    // If it's outside this range, likely a decimals mismatch
    if (entryPrice < 1e-8 || entryPrice > 1e0) {
      console.warn(
        `[TRADING][WARN] Unusual entry price: ${entryPrice.toExponential(6)} SOL/token ` +
        `for ${mint.slice(0, 8)}... (decimals=${finalDecimals}, tokensUI=${finalTokensUI.toExponential(3)})`
      );
    }

    // Store raw token amount (for swaps) - this is what Jupiter returns
    // entryPrice is already calculated correctly as sizeSol / tokensUI
    const tokensRaw = BigInt(Math.floor(outAmountRaw));

    return {
      mint,
      sizeSol,
      tokens: tokensRaw, // Raw token amount (for swaps) - matches Jupiter's outAmount
      entryPrice, // SOL per token (calculated from UI units: sizeSol / tokensUI)
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

