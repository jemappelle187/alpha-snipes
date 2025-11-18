import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fetchTokenSnapshot } from './birdeye.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Normalized Pool Model (for triangulation across providers)
// ═══════════════════════════════════════════════════════════════════════════════

export type NormalizedPoolSource = 'dexscreener' | 'birdeye' | 'gmgn';

export type NormalizedPool = {
  source: NormalizedPoolSource;
  pairAddress: string;
  dexLabel?: string; // Meteora, Raydium, etc.
  pairLabel?: string; // "migrating", "main", etc.
  baseMint: string;
  quoteMint: string;
  isBaseToken: boolean; // true if our mint is base
  liquidityUsd: number;
  volume24hUsd?: number;
  price: number; // price vs SOL (or quote)
  isMigrating?: boolean;
  createdAt?: number;
  tokenName?: string;
  tokenSymbol?: string;
};

type LiquidityErrorTag = 'rate_limit' | 'timeout' | 'network' | 'no_pairs' | 'unknown' | 'migrating';

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy Types (for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

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
  pairLabel?: string; // DexScreener pair label (e.g., "migrating", "verified")
  info?: {
    imageUrl?: string;
    websites?: Array<{ label?: string; url?: string }>;
    socials?: Array<{ type?: string; url?: string }>;
  };
};

export type LiquiditySnapshot = {
  ok: boolean;
  source?: NormalizedPoolSource | 'unknown';
  sourceDexLabel?: string;
  liquidityUsd?: number; // undefined = unknown (provider error), 0 = known low liquidity
  volume24h?: number | null;
  pairCreatedAt?: number | null;
  pairAddress?: string;
  tokenName?: string | null; // Token name from DexScreener
  tokenSymbol?: string | null; // Token symbol from DexScreener
  priceSol?: number | null; // Price in SOL from DexScreener
  error?: string;
  errorTag?: LiquidityErrorTag; // Classify error type
  isMigrating?: boolean; // True if liquidity is being migrated (unreliable data)
};

// ═══════════════════════════════════════════════════════════════════════════════
// Cache Management
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Pool Cache (for triangulation)
// ═══════════════════════════════════════════════════════════════════════════════

const POOL_CACHE_TTL_MS = 60_000;

type PoolCacheEntry = {
  mint: string;
  pools: NormalizedPool[];
  fetchedAt: number;
};

const poolCache = new Map<string, PoolCacheEntry>();

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classification
// ═══════════════════════════════════════════════════════════════════════════════

function classifyLiquidityError(err: any): LiquidityErrorTag {
  const errMsg = String(err?.message || err || '');
  if (errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('rate_limit') || errMsg.includes('cooldown')) {
    return 'rate_limit';
  }
  if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')) {
    return 'timeout';
  }
  if (errMsg.includes('network') || errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED') || errMsg.includes('ECONNRESET')) {
    return 'network';
  }
  if (errMsg.includes('no_pairs') || errMsg.includes('no pairs') || errMsg.includes('empty')) {
    return 'no_pairs';
  }
  if (errMsg.includes('migrat')) {
    return 'migrating';
  }
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Provider-Specific Pool Fetchers
// ═══════════════════════════════════════════════════════════════════════════════

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

async function fetchDexscreenerPools(mint: string): Promise<NormalizedPool[]> {
  const pairs = await fetchDexScreener(mint);
  const pools: NormalizedPool[] = [];

  for (const pair of pairs) {
    const liquidityUsd = Number(pair?.liquidity?.usd ?? pair?.liquidityUsd ?? 0);
    if (!Number.isFinite(liquidityUsd) || liquidityUsd <= 0) continue;

    const priceSol = Number(pair?.priceNative ?? pair?.priceUsd ?? 0);
    if (!Number.isFinite(priceSol) || priceSol <= 0) continue;

    const baseMint = pair?.baseToken?.address || '';
    const quoteMint = pair?.quoteToken?.address || '';
    const isBaseToken = baseMint.toLowerCase() === mint.toLowerCase();

    if (!baseMint || !quoteMint) continue;

    const pairLabel = (pair?.pairLabel || '').toLowerCase();
    const isMigrating = pairLabel.includes('migrat') || pairLabel.includes('migrating');

    pools.push({
      source: 'dexscreener',
      pairAddress: pair.pairAddress || '',
      dexLabel: pair.dexId || pair.chainId || undefined,
      pairLabel: pair.pairLabel || undefined,
      baseMint,
      quoteMint,
      isBaseToken,
      liquidityUsd,
      volume24hUsd: Number(pair?.volume24h ?? pair?.volume?.h24 ?? 0) || undefined,
      price: priceSol,
      isMigrating,
      createdAt: pair.pairCreatedAt ? Number(pair.pairCreatedAt) * 1000 : undefined,
      tokenName: isBaseToken ? pair.baseToken?.name : pair.quoteToken?.name,
      tokenSymbol: isBaseToken ? pair.baseToken?.symbol : pair.quoteToken?.symbol,
    });
  }

  return pools;
}

async function fetchBirdeyePoolsInternal(mint: string): Promise<NormalizedPool[]> {
  const snapshot = await fetchTokenSnapshot(mint);
  
  if (!snapshot.liquidityUsd || snapshot.liquidityUsd <= 0) {
    return [];
  }

  if (!snapshot.price || snapshot.price <= 0) {
    return [];
  }

  // Birdeye doesn't provide pair address in overview, so we'll use a placeholder
  // In the future, we could fetch pool-specific endpoints if available
  const pool: NormalizedPool = {
    source: 'birdeye',
    pairAddress: `birdeye-${mint}`, // Placeholder - Birdeye overview doesn't give pair address
    dexLabel: undefined, // Birdeye overview doesn't specify DEX
    pairLabel: undefined,
    baseMint: mint,
    quoteMint: 'So11111111111111111111111111111111111111112', // Assume SOL
    isBaseToken: true,
    liquidityUsd: snapshot.liquidityUsd,
    volume24hUsd: snapshot.volume24hUsd || undefined,
    price: snapshot.price,
    isMigrating: false,
    tokenName: snapshot.name || undefined,
    tokenSymbol: snapshot.symbol || undefined,
  };

  return [pool];
}

async function fetchBirdeyePools(mint: string): Promise<NormalizedPool[]> {
  try {
    return await fetchBirdeyePoolsInternal(mint);
  } catch (err) {
    console.warn(`[BIRDEYE][WARN] TLS / API error – ignoring Birdeye for this mint`, {
      mint: mint.slice(0, 8) + '...',
      msg: (err as any)?.message || String(err),
    });
    return [];
  }
}

export interface GmgnSnapshot {
  holders: number;
  top10SharePct: number;
}

export async function fetchGmgnPools(mint: string): Promise<NormalizedPool[]> {
  const url = `https://gmgn.ai/sol/token/${mint}?format=json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[LIQ][GMGN] HTTP error ${res.status} mint=${mint}`);
      return [];
    }

    const data: any = await res.json();
    const pools = data?.pools || data?.liquidityPools || [];
    if (!Array.isArray(pools) || pools.length === 0) {
      console.warn(`[LIQ][GMGN] no pools for mint=${mint}`);
      return [];
    }

    const tokenName = data?.name ?? data?.token?.name;
    const tokenSymbol = data?.symbol ?? data?.token?.symbol;

    return pools
      .map((p: any): NormalizedPool | null => {
        const liquidityUsd = Number(p?.liquidityUsd ?? p?.liqUsd ?? 0);
        const priceSol = Number(p?.priceSol ?? p?.price ?? 0);
        if (!Number.isFinite(liquidityUsd) || liquidityUsd <= 0) return null;
        if (!Number.isFinite(priceSol) || priceSol <= 0) return null;

        return {
          source: 'gmgn',
          pairAddress: p?.address || p?.poolAddress || '',
          dexLabel: p?.dex || p?.platform || undefined,
          pairLabel: p?.label || undefined,
          baseMint: mint,
          quoteMint: 'So11111111111111111111111111111111111111112',
          isBaseToken: true,
          liquidityUsd,
          volume24hUsd: Number(p?.volume24hUsd ?? p?.volUsd24h ?? 0) || undefined,
          price: priceSol,
          isMigrating: false,
          createdAt: p?.createdAt ? Number(p.createdAt) * 1000 : undefined,
          tokenName: tokenName || p?.tokenName || undefined,
          tokenSymbol: tokenSymbol || p?.tokenSymbol || undefined,
        };
      })
      .filter((p): p is NormalizedPool => Boolean(p));
  } catch (err) {
    console.error(`[LIQ][GMGN] fetch failed mint=${mint}`, err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGmgnSafety(mint: string): Promise<GmgnSnapshot | null> {
  const url = `https://gmgn.ai/sol/token/${mint}?format=json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data: any = await res.json();
    const holders = Number(data?.holders ?? data?.holdersCount ?? 0);
    const top10SharePct = Number(data?.topHolders?.top10Pct ?? data?.ownership?.top10Pct ?? 0);
    if (!holders && !top10SharePct) return null;
    return { holders, top10SharePct };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pool Scoring and Selection
// ═══════════════════════════════════════════════════════════════════════════════

function selectBestPool(pools: NormalizedPool[]): NormalizedPool | null {
  const candidates = pools.filter(p => {
    if (!Number.isFinite(p.price) || p.price <= 0) return false;
    if (p.liquidityUsd <= 0) return false;
    if (p.isMigrating) return false;
    if ((p.pairLabel || '').toLowerCase().includes('migrat')) return false;
    return true;
  });

  if (!candidates.length) return null;

  function score(p: NormalizedPool): number {
    const liqScore = Math.log10(1 + Math.max(p.liquidityUsd, 0));
    const volScore = Math.log10(1 + Math.max(p.volume24hUsd ?? 0, 0));
    return liqScore + volScore;
  }

  return candidates.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
}

function short(mint: string): string {
  return mint.slice(0, 8) + '...';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Triangulation Function
// ═══════════════════════════════════════════════════════════════════════════════

export async function triangulatePools(mint: string): Promise<{
  pools: NormalizedPool[];
  bestPool: NormalizedPool | null;
  providerErrors: {
    dexscreener?: LiquidityErrorTag;
    birdeye?: LiquidityErrorTag;
    gmgn?: LiquidityErrorTag;
  };
}> {
  const cached = poolCache.get(mint);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < POOL_CACHE_TTL_MS) {
    return {
      pools: cached.pools,
      bestPool: selectBestPool(cached.pools),
      providerErrors: {},
    };
  }

  const [dsRes, beRes, gmgnRes] = await Promise.allSettled([
    fetchDexscreenerPools(mint),
    fetchBirdeyePools(mint),
    fetchGmgnPools(mint),
  ]);

  const pools: NormalizedPool[] = [
    ...(dsRes.status === 'fulfilled' ? dsRes.value : []),
    ...(beRes.status === 'fulfilled' ? beRes.value : []),
    ...(gmgnRes.status === 'fulfilled' ? gmgnRes.value : []),
  ];

  const providerErrors: {
    dexscreener?: LiquidityErrorTag;
    birdeye?: LiquidityErrorTag;
    gmgn?: LiquidityErrorTag;
  } = {
    dexscreener: dsRes.status === 'rejected' ? classifyLiquidityError(dsRes.reason) : undefined,
    birdeye: beRes.status === 'rejected' ? classifyLiquidityError(beRes.reason) : undefined,
    gmgn: gmgnRes.status === 'rejected' ? classifyLiquidityError(gmgnRes.reason) : undefined,
  };

  poolCache.set(mint, { mint, pools, fetchedAt: now });

  const bestPool = selectBestPool(pools);

  console.log(
    `[LIQ][TRIANGULATE] mint=${short(mint)} pools=${pools.length} ` +
      `ds=${dsRes.status === 'fulfilled' ? 'ok' : 'fail'} ` +
      `be=${beRes.status === 'fulfilled' ? 'ok' : 'fail'} ` +
      `gmgn=${gmgnRes.status === 'fulfilled' ? 'ok' : 'fail'} ` +
      `best=${bestPool?.source ?? 'none'}:${bestPool?.dexLabel ?? ''} ` +
      `liqUsd=${bestPool?.liquidityUsd ?? 0}`
  );

  return { pools, bestPool, providerErrors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Liquidity Fetching (with Triangulation)
// ═══════════════════════════════════════════════════════════════════════════════

export async function getLiquidityResilient(
  mint: string,
  opts?: { retries?: number; cacheMaxAgeMs?: number }
): Promise<LiquiditySnapshot> {
  const cacheHit = fromCache(mint, opts?.cacheMaxAgeMs ?? 15_000);
  if (cacheHit && Number.isFinite(cacheHit)) {
    return { ok: true, source: 'dexscreener', liquidityUsd: cacheHit };
  }

  // Use triangulation to get pools from multiple providers
  const { pools, bestPool, providerErrors } = await triangulatePools(mint);

  let liquidityUsd: number | undefined;
  let errorTag: LiquidityErrorTag | undefined;
  let isMigrating = false;
  let source: NormalizedPoolSource | 'unknown' = 'unknown';
  let sourceDexLabel: string | undefined;
  let volume24h: number | null = null;
  let pairCreatedAt: number | null = null;
  let pairAddress: string | undefined;
  let tokenName: string | null = null;
  let tokenSymbol: string | null = null;
  let priceSol: number | null = null;

  if (bestPool) {
    liquidityUsd = bestPool.liquidityUsd;
    isMigrating = !!bestPool.isMigrating;
    source = bestPool.source;
    sourceDexLabel = bestPool.dexLabel;
    volume24h = bestPool.volume24hUsd ?? null;
    pairCreatedAt = bestPool.createdAt ?? null;
    pairAddress = bestPool.pairAddress;
    tokenName = bestPool.tokenName ?? null;
    tokenSymbol = bestPool.tokenSymbol ?? null;
    priceSol = bestPool.price;

    // Cache the result
    toCache(mint, liquidityUsd);

    const shortMint = short(mint);
    console.log(
      `[LIQ] Triangulated ${shortMint}: ` +
      `liquidity=$${bestPool.liquidityUsd.toFixed(0)} | ` +
      `source=${bestPool.source} | pair=${short(bestPool.pairAddress)} | dex=${bestPool.dexLabel || 'n/a'}`
    );

    return {
      ok: true,
      source,
      sourceDexLabel,
      liquidityUsd,
      volume24h,
      pairCreatedAt,
      pairAddress,
      tokenName,
      tokenSymbol,
      priceSol,
      isMigrating,
    };
  } else {
    // No best pool found
    const sawAnyPool = pools.length > 0;
    if (sawAnyPool) {
      // We saw pools but all unusable → treat as known low liquidity
      liquidityUsd = 0;
      errorTag = 'no_pairs';
    } else {
      // All providers failed → unknown liquidity (fail-open path)
      liquidityUsd = undefined;
      errorTag = providerErrors.dexscreener || providerErrors.birdeye || providerErrors.gmgn || 'unknown';
    }

    const shortMint = short(mint);
    console.warn(`[LIQ] Triangulation failed for ${shortMint}: ${sawAnyPool ? 'all pools unusable' : 'all providers failed'} | errors=${JSON.stringify(providerErrors)}`);

    return {
      ok: false,
      source: providerErrors.dexscreener
        ? 'dexscreener'
        : providerErrors.birdeye
        ? 'birdeye'
        : providerErrors.gmgn
        ? 'gmgn'
        : undefined,
      liquidityUsd,
      volume24h: null,
      pairCreatedAt: null,
      pairAddress: undefined,
      tokenName: null,
      tokenSymbol: null,
      priceSol: null,
      error: errorTag,
      errorTag,
      isMigrating: false,
    };
  }
}
