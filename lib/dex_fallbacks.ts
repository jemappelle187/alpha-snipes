import { Connection, Keypair, PublicKey } from '@solana/web3.js';

export type DEXSwapParams = {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: number | bigint;
  slippageBps?: number;
  connection: Connection;
  wallet: Keypair;
};

export type SwapResult = {
  txid: string;
  outAmount?: string;
  dex?: string;
};

export async function swapWithDEXFallback(
  jupiterSwap: () => Promise<SwapResult>,
  params: DEXSwapParams,
  enableOrca: boolean,
  enableRaydium: boolean
): Promise<SwapResult> {
  let lastError: Error | null = null;

  try {
    const result = await jupiterSwap();
    return { ...result, dex: 'jupiter' };
  } catch (err: any) {
    console.warn(`[SWAP] Jupiter failed: ${err?.message || err}`);
    lastError = err instanceof Error ? err : new Error(String(err));
  }

  if (enableOrca) {
    try {
      console.log(`[SWAP] Attempting Orca swap for ${params.inputMint.toBase58().slice(0, 8)}...`);
      const result = await swapViaOrca(params);
      return { ...result, dex: 'orca' };
    } catch (err: any) {
      console.warn(`[SWAP] Orca failed: ${err?.message || err}`);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (enableRaydium) {
    try {
      console.log(`[SWAP] Attempting Raydium swap for ${params.inputMint.toBase58().slice(0, 8)}...`);
      const result = await swapViaRaydium(params);
      return { ...result, dex: 'raydium' };
    } catch (err: any) {
      console.warn(`[SWAP] Raydium failed: ${err?.message || err}`);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`All swap routes failed. Last error: ${lastError?.message || lastError}`);
}

async function swapViaOrca(_params: DEXSwapParams): Promise<SwapResult> {
  throw new Error('Orca SDK integration not yet implemented.');
}

async function swapViaRaydium(_params: DEXSwapParams): Promise<SwapResult> {
  throw new Error('Raydium SDK integration not yet implemented.');
}

