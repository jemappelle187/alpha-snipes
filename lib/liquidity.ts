import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

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
  source: 'dexscreener';
  liquidityUsd: number | null;
  volume24h?: number | null;
  pairCreatedAt?: number | null;
  pairAddress?: string;
  tokenName?: string | null; // Token name from DexScreener
  tokenSymbol?: string | null; // Token symbol from DexScreener
  priceSol?: number | null; // Price in SOL from DexScreener
  error?: string;
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

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const pairs = await fetchDexScreener(mint);
      const best = bestPair(pairs);
      if (!best || !Number.isFinite(best.liquidityUsd ?? 0)) {
        lastError = new Error('no-pairs');
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
      if (String(err?.message).includes('dexscreener-429')) {
        console.warn(`[LIQ] DexScreener failed: HTTP 429 (rate limit) for ${shortMint} - retrying...`);
        await sleep(500 * (attempt + 1));
      } else {
        console.warn(`[LIQ] DexScreener failed: ${err?.message || err} for ${shortMint} - retrying...`);
        await sleep(250 * (attempt + 1));
      }
    }
  }

  const shortMint = mint.slice(0, 8) + '...';
  console.warn(`[LIQ] DexScreener failed after retries for ${shortMint}: ${lastError ? String(lastError.message || lastError) : 'unknown'}`);
  return {
    ok: false,
    source: 'dexscreener',
    liquidityUsd: null,
    volume24h: null,
    pairCreatedAt: null,
    tokenName: null,
    tokenSymbol: null,
    priceSol: null,
    error: lastError ? String(lastError.message || lastError) : 'unknown',
  };
}

