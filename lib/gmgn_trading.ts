/**
 * GMGN.ai Trading API Integration
 * Alternative swap router to Jupiter with JITO Anti-MEV support
 * 
 * Documentation: https://docs.gmgn.ai/index/cooperation-api-integrate-gmgn-solana-trading-api
 * 
 * NOTE: This API is for TRADE EXECUTION, not wallet monitoring
 * For wallet monitoring, use Birdeye API instead
 */

import fetch from 'node-fetch';
import { VersionedTransaction, Connection, PublicKey } from '@solana/web3.js';

const GMGN_API_BASE = 'https://gmgn.ai';
const GMGN_API_KEY = process.env.GMGN_API_KEY || '';

export type GMGNSwapRoute = {
  quote: {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: 'ExactIn' | 'ExactOut';
    slippageBps: number;
    platformFee: number | null;
    priceImpact: string;
    routePlan: any[];
    contextSlot: number;
    timeTaken: number;
  };
  raw_tx: {
    swapTransaction: string; // Base64-encoded unsigned transaction
    lastValidBlockHeight: number;
    recentBlockhash: string;
    prioritizationFeeLamports: number;
  };
};

export type GMGNSwapParams = {
  tokenIn: string; // Token address to spend
  tokenOut: string; // Target token address
  amount: string; // Amount in lamports
  fromAddress: string; // Wallet address
  slippage: number; // Slippage percentage (e.g., 0.5 for 0.5%)
  swapMode?: 'ExactIn' | 'ExactOut'; // Default: ExactIn
  fee?: number; // Network priority fees in SOL (e.g., 0.006)
  isAntiMev?: boolean; // Enable JITO Anti-MEV (requires fee >= 0.002)
  partner?: string; // Optional partner source name
};

/**
 * Get swap route from GMGN Trading API
 * @param params - Swap parameters
 * @returns Swap route with unsigned transaction
 */
export async function getGMGNSwapRoute(params: GMGNSwapParams): Promise<GMGNSwapRoute> {
  if (!GMGN_API_KEY) {
    throw new Error('GMGN_API_KEY not configured. Apply at: https://forms.gle/CWABDLRe8twvygvy5');
  }

  const {
    tokenIn,
    tokenOut,
    amount,
    fromAddress,
    slippage,
    swapMode = 'ExactIn',
    fee,
    isAntiMev = false,
    partner,
  } = params;

  const queryParams = new URLSearchParams({
    token_in_address: tokenIn,
    token_out_address: tokenOut,
    in_amount: amount,
    from_address: fromAddress,
    slippage: slippage.toString(),
    swap_mode: swapMode,
  });

  if (fee !== undefined) {
    queryParams.append('fee', fee.toString());
  }

  if (isAntiMev) {
    queryParams.append('is_anti_mev', 'true');
    if (fee === undefined || fee < 0.002) {
      throw new Error('isAntiMev requires fee >= 0.002 SOL');
    }
  }

  if (partner) {
    queryParams.append('partner', partner);
  }

  const url = `${GMGN_API_BASE}/defi/router/v1/sol/tx/get_swap_route?${queryParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      'x-route-key': GMGN_API_KEY,
      'Accept': 'application/json',
    },
    timeout: 10000,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('GMGN API authentication failed. Check API key.');
    }
    if (response.status === 429) {
      throw new Error('GMGN API rate limit exceeded (1 call per 5 seconds)');
    }
    const errorText = await response.text().catch(() => '');
    throw new Error(`GMGN API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`GMGN API error: ${data.msg || 'Unknown error'}`);
  }

  return data.data;
}

/**
 * Submit signed transaction to GMGN
 * @param signedTx - Base64-encoded signed transaction
 * @param isAntiMev - Whether transaction uses JITO Anti-MEV
 * @returns Transaction hash
 */
export async function submitGMGNTransaction(
  signedTx: string,
  isAntiMev: boolean = false
): Promise<string> {
  const url = `${GMGN_API_BASE}/txproxy/v1/send_transaction`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chain: 'sol',
      signedTx,
      isAntiMev,
    }),
    timeout: 10000,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`GMGN transaction submission failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`GMGN API error: ${data.msg || 'Unknown error'}`);
  }

  return data.data.hash;
}

/**
 * Check transaction status
 * @param hash - Transaction hash
 * @param lastValidBlockHeight - Block height from route response
 * @returns Transaction status
 */
export async function getGMGNTransactionStatus(
  hash: string,
  lastValidBlockHeight: number
): Promise<{ success: boolean; failed: boolean; expired: boolean }> {
  const url = `${GMGN_API_BASE}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;

  const response = await fetch(url, {
    headers: {
      'x-route-key': GMGN_API_KEY,
      'Accept': 'application/json',
    },
    timeout: 10000,
  });

  if (!response.ok) {
    throw new Error(`GMGN status check failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`GMGN API error: ${data.msg || 'Unknown error'}`);
  }

  return data.data;
}

/**
 * Check if GMGN API is available and configured
 */
export function isGMGNAvailable(): boolean {
  return !!GMGN_API_KEY;
}

