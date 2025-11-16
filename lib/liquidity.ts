import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fetchTokenSnapshot } from './birdeye.js';

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  liquidity?: { usd?: number };
  liquidityUsd?: number;
  volume?: { h24?: number; m5?: number };
  volume24h?: number;
  pairCreatedAt?: number;
  priceUsd?: string | number;
  priceNative?: string | number; // Price in SOL
  baseToken?: { name?: string; symbol?: string; address?: string };
  quoteToken?: { name?: string; symbol?: string; address?: string };
};

export type LiquiditySnapshot = {
  ok: boolean;
  source?: 'dexscreener' | 'birdeye';
  liquidityUsd?: number; // undefined = unknown (provider error), 0 = known low liquidity
  volume24h?: number | null;
  pairCreatedAt?: number | null;
  pairAddress?: string;
  tokenName?: string | null; // Token name from DexScreener
  tokenSymbol?: string | null; // Token symbol from DexScreener
  priceSol?: number | null; // Price in SOL from DexScreener
  error?: string;
  errorTag?: 'rate_limit' | 'timeout' | 'network' | 'no_pairs' | 'unknown'; // Classify error type
};

const CACHE_DIR = path.resolve(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'liquidity-cache.json');

type CacheEntry = { liquidityUsd: number; ts: number };
const cache: Record<string, CacheEntry> = (() => {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
})();

function saveCache() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.warn('[LIQ] Failed to persist cache:', err);
  }
}

function fromCache(mint: string, maxAgeMs: number): number | null {
  const entry = cache[mint];
  if (!entry) return null;
  if (Date.now() - entry.ts > maxAgeMs) return null;
  return entry.liquidityUsd;
}

function toCache(mint: string, liquidityUsd: number) {
  cache[mint] = { liquidityUsd, ts: Date.now() };
  saveCache();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDexScreener(mint: string): Promise<DexPair[]> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
  const res = await fetch(url, {
    headers: {
      'cache-control': 'no-cache',
    },
  });

  if (res.status === 429) {
    throw new Error('dexscreener-429');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const json: any = await res.json();
  return Array.isArray(json?.pairs) ? (json.pairs as DexPair[]) : [];
}

function bestPair(pairs: DexPair[]): DexPair | null {
  let best: DexPair | null = null;
  for (const pair of pairs) {
    const liq = Number(pair?.liquidity?.usd ?? pair?.liquidityUsd ?? 0);
    if (!Number.isFinite(liq)) continue;
    if (!best || liq > Number(best?.liquidity?.usd ?? best?.liquidityUsd ?? 0)) {
      best = { ...pair, liquidityUsd: liq };
    }
  }
  return best;
}

export async function getLiquidityResilient(
  mint: string,
  opts?: { retries?: number; cacheMaxAgeMs?: number }
): Promise<LiquiditySnapshot> {
  const cacheHit = fromCache(mint, opts?.cacheMaxAgeMs ?? 15_000);
  if (cacheHit && Number.isFinite(cacheHit)) {
    return { ok: true, source: 'dexscreener', liquidityUsd: cacheHit };
  }

  const retries = Math.max(1, opts?.retries ?? 3);
  let lastError: any = null;
  let errorTag: 'rate_limit' | 'timeout' | 'network' | 'no_pairs' | 'unknown' = 'unknown';

  // Try DexScreener first
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const pairs = await fetchDexScreener(mint);
      const best = bestPair(pairs);
      if (!best || !Number.isFinite(best.liquidityUsd ?? 0)) {
        lastError = new Error('no-pairs');
        errorTag = 'no_pairs';
        continue;
      }
      const liquidityUsd = Number(best.liquidityUsd ?? best.liquidity?.usd ?? 0) || 0;
      const volume24h = Number(best.volume24h ?? best.volume?.h24 ?? 0) || 0;
      const pairCreatedAt = best.pairCreatedAt ? Number(best.pairCreatedAt) : null;
      
      // Extract price in SOL (priceNative is usually in SOL for Solana)
      let priceSol: number | null = null;
      if (best.priceNative) {
        const price = Number(best.priceNative);
        if (Number.isFinite(price) && price > 0) {
          priceSol = price;
        }
      }
      
      // Extract token name and symbol (baseToken is usually the token we're looking for)
      let tokenName: string | null = null;
      let tokenSymbol: string | null = null;
      if (best.baseToken?.address?.toLowerCase() === mint.toLowerCase()) {
        tokenName = best.baseToken.name || null;
        tokenSymbol = best.baseToken.symbol || null;
      } else if (best.quoteToken?.address?.toLowerCase() === mint.toLowerCase()) {
        tokenName = best.quoteToken.name || null;
        tokenSymbol = best.quoteToken.symbol || null;
      }
      
      toCache(mint, liquidityUsd);
      const shortMint = mint.slice(0, 8) + '...';
      console.log(`[LIQ] DexScreener: $${liquidityUsd.toFixed(0)} liquidity, $${volume24h.toFixed(0)} 24h volume${priceSol ? `, ${priceSol.toExponential(3)} SOL/token` : ''} for ${shortMint}`);
      return {
        ok: true,
        source: 'dexscreener',
        liquidityUsd,
        volume24h,
        pairCreatedAt,
        pairAddress: best.pairAddress,
        tokenName,
        tokenSymbol,
        priceSol,
      };
    } catch (err: any) {
      lastError = err;
      const shortMint = mint.slice(0, 8) + '...';
      const errMsg = String(err?.message || err);
      
      // Classify error type
      if (errMsg.includes('dexscreener-429') || errMsg.includes('429')) {
        errorTag = 'rate_limit';
        console.warn(`[LIQ] DexScreener failed: HTTP 429 (rate limit) for ${shortMint} - retrying...`);
        await sleep(500 * (attempt + 1));
      } else if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')) {
        errorTag = 'timeout';
        console.warn(`[LIQ] DexScreener failed: timeout for ${shortMint} - retrying...`);
        await sleep(250 * (attempt + 1));
      } else if (errMsg.includes('network') || errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED')) {
        errorTag = 'network';
        console.warn(`[LIQ] DexScreener failed: network error for ${shortMint} - retrying...`);
        await sleep(250 * (attempt + 1));
      } else {
        errorTag = 'unknown';
        console.warn(`[LIQ] DexScreener failed: ${errMsg} for ${shortMint} - retrying...`);
        await sleep(250 * (attempt + 1));
      }
    }
  }

  // DexScreener failed - try Birdeye fallback for provider errors (rate_limit, timeout, network)
  const shortMint = mint.slice(0, 8) + '...';
  if (['rate_limit', 'timeout', 'network'].includes(errorTag)) {
    try {
      console.log(`[LIQ] Attempting Birdeye fallback for ${shortMint} (DexScreener ${errorTag})`);
      const birdeyeSnapshot = await fetchTokenSnapshot(mint);
      
      if (birdeyeSnapshot.liquidityUsd !== null && typeof birdeyeSnapshot.liquidityUsd === 'number' && birdeyeSnapshot.liquidityUsd > 0) {
        const liquidityUsd = birdeyeSnapshot.liquidityUsd;
        const priceSol = birdeyeSnapshot.price;
        console.log(`[LIQ] Birdeye fallback: $${liquidityUsd.toFixed(0)} liquidity${priceSol ? `, ${priceSol.toExponential(3)} SOL/token` : ''} for ${shortMint}`);
        
        // Cache the Birdeye result
        toCache(mint, liquidityUsd);
        
        return {
          ok: true,
          source: 'birdeye',
          liquidityUsd,
          volume24h: birdeyeSnapshot.volume24h,
          priceSol,
          tokenName: birdeyeSnapshot.name || null,
          tokenSymbol: birdeyeSnapshot.symbol || null,
        };
      } else {
        console.warn(`[LIQ] Birdeye fallback: no liquidity data for ${shortMint}`);
      }
    } catch (birdeyeErr: any) {
      console.warn(`[LIQ] Birdeye fallback failed for ${shortMint}: ${birdeyeErr?.message || birdeyeErr}`);
    }
  }

  // Both DexScreener and Birdeye failed, or DexScreener returned no_pairs
  console.warn(`[LIQ] DexScreener failed after retries for ${shortMint}: ${lastError ? String(lastError.message || lastError) : 'unknown'} | errorTag=${errorTag}`);
  
  if (errorTag === 'no_pairs') {
    // Known low liquidity (no pairs found) - return 0
    return {
      ok: false,
      source: 'dexscreener',
      liquidityUsd: 0, // Known low liquidity
      volume24h: null,
      pairCreatedAt: null,
      tokenName: null,
      tokenSymbol: null,
      priceSol: null,
      error: 'no_pairs',
      errorTag: 'no_pairs',
    };
  } else {
    // Provider error (rate_limit, timeout, network) - return undefined liquidity (unknown)
    return {
      ok: false,
      source: 'dexscreener',
      liquidityUsd: undefined, // Unknown (provider error)
      volume24h: null,
      pairCreatedAt: null,
      tokenName: null,
      tokenSymbol: null,
      priceSol: null,
      error: lastError ? String(lastError.message || lastError) : 'unknown',
      errorTag,
    };
  }
}

