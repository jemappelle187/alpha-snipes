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
    // Birdeye wallet trades endpoint
    // Note: Actual endpoint may vary - this is a common pattern
    const url = `${BIRDEYE_API_BASE}/v1/wallet/trades?address=${wallet}&from=${sinceUnixSec}`;
    
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': BIRDEYE_API_KEY,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[BIRDEYE] Rate limit hit, skipping wallet trades fetch');
        return [];
      }
      throw new Error(`Birdeye API error: ${response.status} ${response.statusText}`);
    }

    const json: any = await response.json();
    
    // Parse response - structure may vary based on actual API
    const trades: BirdeyeTrade[] = [];
    
    if (json.success && Array.isArray(json.data?.trades)) {
      for (const trade of json.data.trades) {
        try {
          trades.push({
            txHash: trade.txHash || trade.signature || '',
            mint: trade.mint || trade.tokenAddress || '',
            side: (trade.side || trade.type || '').toLowerCase() === 'sell' ? 'sell' : 'buy',
            amountToken: parseFloat(trade.amountToken || trade.tokenAmount || '0') || 0,
            amountSol: parseFloat(trade.amountSol || trade.solAmount || '0') || 0,
            amountUsd: parseFloat(trade.amountUsd || trade.usdValue || '0') || 0,
            priceUsd: parseFloat(trade.priceUsd || trade.price || '0') || 0,
            timestamp: parseInt(trade.timestamp || trade.time || '0', 10) || 0,
            symbol: trade.symbol || trade.tokenSymbol,
            name: trade.name || trade.tokenName,
          });
        } catch (err) {
          console.warn(`[BIRDEYE] Failed to parse trade: ${err}`);
        }
      }
    } else if (Array.isArray(json.data)) {
      // Alternative response format
      for (const trade of json.data) {
        try {
          trades.push({
            txHash: trade.txHash || trade.signature || '',
            mint: trade.mint || trade.tokenAddress || '',
            side: (trade.side || trade.type || '').toLowerCase() === 'sell' ? 'sell' : 'buy',
            amountToken: parseFloat(trade.amountToken || trade.tokenAmount || '0') || 0,
            amountSol: parseFloat(trade.amountSol || trade.solAmount || '0') || 0,
            amountUsd: parseFloat(trade.amountUsd || trade.usdValue || '0') || 0,
            priceUsd: parseFloat(trade.priceUsd || trade.price || '0') || 0,
            timestamp: parseInt(trade.timestamp || trade.time || '0', 10) || 0,
            symbol: trade.symbol || trade.tokenSymbol,
            name: trade.name || trade.tokenName,
          });
        } catch (err) {
          console.warn(`[BIRDEYE] Failed to parse trade: ${err}`);
        }
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
    // Birdeye token info endpoint
    const url = `${BIRDEYE_API_BASE}/v1/token/overview?address=${mint}`;
    
    const response = await fetch(url, {
      headers: {
        'X-API-KEY': BIRDEYE_API_KEY,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`[BIRDEYE] Rate limit hit for token ${mint.slice(0, 8)}`);
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
    
    return {
      price: parseFloat(data.price || data.priceSol || '0') || null,
      priceUsd: parseFloat(data.priceUsd || data.price || '0') || null,
      liquidity: parseFloat(data.liquidity || '0') || null,
      liquidityUsd: parseFloat(data.liquidityUsd || data.liquidity || '0') || null,
      volume24h: parseFloat(data.volume24h || data.volume24 || '0') || null,
      volume24hUsd: parseFloat(data.volume24hUsd || data.volume24 || '0') || null,
      marketCap: parseFloat(data.marketCap || data.mc || '0') || null,
      priceChange24h: parseFloat(data.priceChange24h || data.priceChange24 || '0') || null,
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

