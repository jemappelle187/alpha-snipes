/**
 * Enhanced Alpha Signal Classification
 * Detects BUY signals even when alpha wallet is not a direct signer
 * (e.g., transactions via DEX aggregators, token transfers, etc.)
 */

import { parseUiAmount } from './format.js';

export interface EnhancedAlphaSignal {
  mint: string;
  solSpent: number;
  tokenDelta: number;
  alphaEntryPrice: number;
  alphaPreBalance: number;
  alphaPostBalance: number;
  blockTimeMs: number;
  signalAgeSec: number;
  source: 'rpc' | 'birdeye';
  txHash?: string;
  detectionMethod: 'account_keys' | 'token_balances' | 'birdeye_only';
}

export function classifyAlphaSignalsEnhanced(
  tx: any,
  alpha: string,
  sig?: string,
  dustSolSpent: number = 0.0001,
  minAlphaTokenBalance: number = 0.0000001,
  minSizeIncreaseRatio: number = 0.1
): EnhancedAlphaSignal[] {
  try {
    const keys: any[] = tx?.transaction?.message?.accountKeys ?? [];
    const normalize = (k: any) =>
      typeof k === 'string' ? k : k?.pubkey ?? (typeof k?.toBase58 === 'function' ? k.toBase58() : '');
    
    const alphaIndex = keys.findIndex((k) => normalize(k) === alpha);
    const alphaInAccountKeys = alphaIndex !== -1;

    // Method 1: Check SOL balance changes (if alpha is in account keys)
    let solSpent = 0;
    let solReceived = 0;
    if (alphaInAccountKeys) {
      const preLamports = Number(tx?.meta?.preBalances?.[alphaIndex] ?? 0);
      const postLamports = Number(tx?.meta?.postBalances?.[alphaIndex] ?? 0);
      solSpent = (preLamports - postLamports) / 1e9;
      solReceived = (postLamports - preLamports) / 1e9;
    }

    // Method 2: Check token balance changes (works even if alpha not in account keys)
    const preBalances = tx?.meta?.preTokenBalances ?? [];
    const postBalances = tx?.meta?.postTokenBalances ?? [];

    const preByMint = new Map<string, any>();
    for (const bal of preBalances) {
      if (bal?.owner !== alpha || !bal?.mint) continue;
      preByMint.set(bal.mint, bal);
    }

    const gains: { mint: string; delta: number; postAmount: number; preAmount: number }[] = [];
    for (const post of postBalances) {
      if (post?.owner !== alpha || !post?.mint) continue;
      const postAmount = parseUiAmount(post.uiTokenAmount);
      const preAmount = preByMint.has(post.mint)
        ? parseUiAmount(preByMint.get(post.mint).uiTokenAmount)
        : 0;
      const delta = postAmount - preAmount;
      if (delta <= 0) continue;
      if (postAmount < minAlphaTokenBalance) continue;
      if (preAmount > 0) {
        const ratio = delta / preAmount;
        if (ratio < minSizeIncreaseRatio) continue;
      }
      gains.push({ mint: post.mint, delta, postAmount, preAmount });
    }

    if (!gains.length) {
      return [];
    }

    // If alpha not in account keys, estimate SOL spent from token gains
    // This is a heuristic - we can't know exact SOL spent without account keys
    // But we can still detect the BUY signal
    let estimatedSolSpent = solSpent;
    if (!alphaInAccountKeys && solSpent === 0) {
      // Estimate: assume reasonable price per token (this is a fallback)
      // In practice, we should use Birdeye to get actual SOL spent
      estimatedSolSpent = gains.reduce((sum, g) => {
        // Very rough estimate: assume 0.000001 SOL per token as minimum
        // This will be refined by Birdeye validation
        return sum + (g.delta * 0.000001);
      }, 0);
    }

    // Filter out if estimated SOL spent is too low (likely a transfer, not a swap)
    if (estimatedSolSpent < dustSolSpent && !alphaInAccountKeys) {
      // If we can't verify SOL spent and it's too low, skip
      // This prevents false positives from token transfers
      return [];
    }

    const totalDelta = gains.reduce((sum, g) => sum + g.delta, 0);
    const alphaEntryPrice = estimatedSolSpent > 0 ? estimatedSolSpent / totalDelta : 0;

    const blockTimeMs = tx?.blockTime ? tx.blockTime * 1000 : Date.now();
    const signalAgeSec = tx?.blockTime ? Math.max(0, (Date.now() - blockTimeMs) / 1000) : 0;

    return gains.map((g) => ({
      mint: g.mint,
      solSpent: estimatedSolSpent,
      tokenDelta: g.delta,
      alphaEntryPrice,
      alphaPreBalance: g.preAmount,
      alphaPostBalance: g.postAmount,
      blockTimeMs,
      signalAgeSec,
      source: 'rpc' as const,
      txHash: sig,
      detectionMethod: alphaInAccountKeys ? 'account_keys' : 'token_balances',
    }));
  } catch (err: any) {
    console.error(`[ENHANCED_CLASSIFY] failed for tx ${sig?.slice(0, 8)}: ${err.message || err}`);
    return [];
  }
}

