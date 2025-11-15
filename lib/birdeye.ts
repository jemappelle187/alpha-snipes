/**
 * Birdeye API Integration
 * Secondary intelligence layer for alpha wallet detection and validation
 */

import fetch from 'node-fetch';

const BIRDEYE_API_BASE = 'https://public-api.birdeye.so';
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';

export type BirdeyeTrade = {
  txHash: string;
  mint: string;
  side: 'buy' | 'sell';
  amountToken: number;
  amountSol: number;
  amountUsd: number;
  priceUsd: number;
  timestamp: number;
  symbol?: string;
  name?: string;
};

export type BirdeyeTokenSnapshot = {
  price: number | null;
  priceUsd: number | null;
  liquidity: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  volume24hUsd: number | null;
  marketCap: number | null;
  priceChange24h: number | null;
  symbol?: string;
  name?: string;
};

/**
 * Fetch wallet trades since a given timestamp
 * NOTE: This endpoint requires a paid Birdeye plan (Starter $99/mo or higher)
 * Free tier does not include wallet transaction history endpoints
 * @param wallet - Wallet address
 * @param sinceUnixSec - Unix timestamp in seconds
 * @returns Array of trades
 */
export async function fetchWalletTradesSince(
  wallet: string,
  sinceUnixSec: number
): Promise<BirdeyeTrade[]> {
  if (!BIRDEYE_API_KEY) {
    console.warn('[BIRDEYE] API key not configured, skipping wallet trades fetch');
    return [];
  }

  try {
    // Birdeye wallet trades endpoint: /wallet/trades_seek_by_time
    // Docs: https://docs.birdeye.so/reference/get-wallet-trades-seek-by-time
    // Parameters: address, type (all/buy/sell), limit, offset, from_time, to_time
    const url = `${BIRDEYE_API_BASE}/v1/wallet/trades_seek_by_time?address=${wallet}&type=all&from_time=${sinceUnixSec}&limit=100`;
    
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': BIRDEYE_API_KEY,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      if (response.status === 401) {
        const errorText = await response.text().catch(() => '');
        const errorJson = (() => {
          try {
            return JSON.parse(errorText);
          } catch {
            return { message: errorText };
          }
        })();
        
        // Check if it's a plan/permission issue
        if (errorJson.message?.includes('sufficient permissions') || errorJson.message?.includes('upgrade')) {
          console.warn(`[BIRDEYE] ⚠️  Wallet trades endpoint requires a paid Birdeye plan`);
          console.warn(`[BIRDEYE] Free tier does not include wallet transaction history endpoints`);
          console.warn(`[BIRDEYE] Bot will continue using RPC-only detection (primary method)`);
          console.warn(`[BIRDEYE] To enable Birdeye backfill/validation, upgrade to Starter ($99/mo) or higher`);
          console.warn(`[BIRDEYE] See: https://bds.birdeye.so/pricing`);
        } else {
          console.warn(`[BIRDEYE] 401 Unauthorized - API key authentication failed`);
          console.warn(`[BIRDEYE] Possible causes:`);
          console.warn(`[BIRDEYE]   1. API key not active or invalid`);
          console.warn(`[BIRDEYE]   2. IP whitelisting enabled - add VM IP to whitelist`);
          console.warn(`[BIRDEYE]   3. API key permissions insufficient`);
        }
        return [];
      }
      if (response.status === 429) {
        console.warn('[BIRDEYE] Rate limit hit, skipping wallet trades fetch');
        return [];
      }
      throw new Error(`Birdeye API error: ${response.status} ${response.statusText}`);
    }

    const json: any = await response.json();
    
    // Parse response based on Birdeye API structure
    // Expected format: { success: true, data: { items: [...] } } or { data: [...] }
    const trades: BirdeyeTrade[] = [];
    
    // Handle Birdeye response format
    const items = json.data?.items || json.data?.trades || (Array.isArray(json.data) ? json.data : []);
    
    for (const trade of items) {
      try {
        // Birdeye trade structure (Solana):
        // - signature/txHash: transaction signature
        // - tokenAddress/mint: token mint address
        // - type: "buy" or "sell"
        // - amount: token amount
        // - solAmount: SOL amount
        // - usdValue: USD value
        // - price: price per token
        // - timestamp: Unix timestamp
        // - symbol/name: token metadata
        
        const side = (trade.type || trade.side || '').toLowerCase();
        const isSell = side === 'sell';
        
        trades.push({
          txHash: trade.signature || trade.txHash || trade.tx || '',
          mint: trade.tokenAddress || trade.mint || trade.token || '',
          side: isSell ? 'sell' : 'buy',
          amountToken: parseFloat(trade.amount || trade.tokenAmount || '0') || 0,
          amountSol: parseFloat(trade.solAmount || trade.sol || '0') || 0,
          amountUsd: parseFloat(trade.usdValue || trade.usd || '0') || 0,
          priceUsd: parseFloat(trade.price || trade.priceUsd || '0') || 0,
          timestamp: parseInt(trade.timestamp || trade.time || '0', 10) || 0,
          symbol: trade.symbol || trade.tokenSymbol,
          name: trade.name || trade.tokenName,
        });
      } catch (err) {
        console.warn(`[BIRDEYE] Failed to parse trade: ${err}`);
      }
    }

    return trades;
  } catch (err: any) {
    console.warn(`[BIRDEYE] Failed to fetch wallet trades: ${err.message || err}`);
    return [];
  }
}

/**
 * Fetch token snapshot (price, liquidity, volume)
 * @param mint - Token mint address
 * @returns Token snapshot data
 */
export async function fetchTokenSnapshot(mint: string): Promise<BirdeyeTokenSnapshot> {
  if (!BIRDEYE_API_KEY) {
    return {
      price: null,
      priceUsd: null,
      liquidity: null,
      liquidityUsd: null,
      volume24h: null,
      volume24hUsd: null,
      marketCap: null,
      priceChange24h: null,
    };
  }

  try {
    // Birdeye token overview endpoint: /token/overview
    // Docs: https://docs.birdeye.so/reference/get-token-overview
    // Returns: price, liquidity, volume, market cap, etc.
    const url = `${BIRDEYE_API_BASE}/v1/token/overview?address=${mint}`;
    
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': BIRDEYE_API_KEY,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.warn(`[BIRDEYE] 401 Unauthorized for token ${mint.slice(0, 8)} - check API key and IP whitelist`);
        return {
          price: null,
          priceUsd: null,
          liquidity: null,
          liquidityUsd: null,
          volume24h: null,
          volume24hUsd: null,
          marketCap: null,
          priceChange24h: null,
        };
      }
      throw new Error(`Birdeye API error: ${response.status} ${response.statusText}`);
    }

    const json: any = await response.json();
    
    if (!json.success || !json.data) {
      return {
        price: null,
        priceUsd: null,
        liquidity: null,
        liquidityUsd: null,
        volume24h: null,
        volume24hUsd: null,
        marketCap: null,
        priceChange24h: null,
      };
    }

    const data = json.data;
    
    // Birdeye token overview structure (Solana):
    // - price: current price in SOL
    // - priceUsd: current price in USD
    // - liquidity: liquidity in SOL
    // - liquidityUsd: liquidity in USD
    // - volume24h: 24h volume
    // - volume24hUsd: 24h volume in USD
    // - marketCap: market capitalization
    // - priceChange24h: 24h price change %
    // - symbol/name: token metadata
    
    return {
      price: parseFloat(data.price || data.priceSol || '0') || null,
      priceUsd: parseFloat(data.priceUsd || data.price || '0') || null,
      liquidity: parseFloat(data.liquidity || data.liquiditySol || '0') || null,
      liquidityUsd: parseFloat(data.liquidityUsd || data.liquidity || '0') || null,
      volume24h: parseFloat(data.volume24h || data.volume24 || data.volume?.h24 || '0') || null,
      volume24hUsd: parseFloat(data.volume24hUsd || data.volume24Usd || data.volume?.h24Usd || '0') || null,
      marketCap: parseFloat(data.marketCap || data.mc || data.marketCapUsd || '0') || null,
      priceChange24h: parseFloat(data.priceChange24h || data.priceChange24 || data.priceChange?.h24 || '0') || null,
      symbol: data.symbol || data.tokenSymbol,
      name: data.name || data.tokenName,
    };
  } catch (err: any) {
    console.warn(`[BIRDEYE] Failed to fetch token snapshot for ${mint.slice(0, 8)}: ${err.message || err}`);
    return {
      price: null,
      priceUsd: null,
      liquidity: null,
      liquidityUsd: null,
      volume24h: null,
      volume24hUsd: null,
      marketCap: null,
      priceChange24h: null,
    };
  }
}

/**
 * Validate a BUY signal by cross-checking with Birdeye
 * @param wallet - Alpha wallet address
 * @param mint - Token mint address
 * @param txHash - Transaction hash
 * @param timestamp - Transaction timestamp (Unix seconds)
 * @returns true if Birdeye confirms a BUY, false otherwise
 */
export async function validateBuyWithBirdeye(
  wallet: string,
  mint: string,
  txHash: string,
  timestamp: number
): Promise<{ confirmed: boolean; trade?: BirdeyeTrade }> {
  if (!BIRDEYE_API_KEY) {
    return { confirmed: false };
  }

  try {
    // Fetch recent trades for this wallet
    const since = timestamp - 60; // 1 minute before
    const trades = await fetchWalletTradesSince(wallet, since);

    // Find matching trade
    const matchingTrade = trades.find(
      (t) =>
        (t.txHash === txHash || t.mint.toLowerCase() === mint.toLowerCase()) &&
        t.side === 'buy' &&
        Math.abs(t.timestamp - timestamp) < 120 // Within 2 minutes
    );

    if (matchingTrade) {
      return { confirmed: true, trade: matchingTrade };
    }

    // Also check if there's a SELL for this mint (which would invalidate a BUY)
    const sellTrade = trades.find(
      (t) =>
        t.mint.toLowerCase() === mint.toLowerCase() &&
        t.side === 'sell' &&
        Math.abs(t.timestamp - timestamp) < 60 // Within 1 minute
    );

    if (sellTrade) {
      console.warn(
        `[BIRDEYE] Found SELL for ${mint.slice(0, 8)} around same time, invalidating BUY signal`
      );
      return { confirmed: false };
    }

    return { confirmed: false };
  } catch (err: any) {
    console.warn(`[BIRDEYE] Validation failed: ${err.message || err}`);
    return { confirmed: false };
  }
}

