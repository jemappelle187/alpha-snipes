// lib/priority.ts
import {
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
  Keypair,
  Connection,
  TransactionInstruction,
} from '@solana/web3.js';

export function withPriority(tx: VersionedTransaction, microLamports: number, cuLimit: number) {
  // NOTE: If you're building txs with Jupiter's `execute`, you cannot inject here.
  // For now, we expose helpers for when you craft raw transactions.
  return tx;
}

export function priorityIxs(unitPriceMicroLamports: number, cuLimit: number): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: unitPriceMicroLamports }),
  ];
}

// Helper to add these ix when you manually build messages:
export async function buildPriorityTx(
  connection: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[],
  unitPriceMicroLamports: number,
  cuLimit: number,
) {
  const prio = priorityIxs(unitPriceMicroLamports, cuLimit);
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [...prio, ...ixs],
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}

/*
 * Jupiter's high-level execute() builds and sends the transaction internally,
 * so we can't inject compute ix into that object. Two practical options:
 * 1. Keep Jupiter but accept "Jito-lite" can't be injected there (still fine for now), or
 * 2. When you need hard priority, switch to raw route → build swap tx → prepend ComputeBudgetProgram ix → send.
 *
 * For option (2), you would need to use Jupiter's swap API to get the transaction,
 * then add the priority instructions before signing and sending.
 */


