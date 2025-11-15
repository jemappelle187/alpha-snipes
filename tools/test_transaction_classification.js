#!/usr/bin/env node
/**
 * Test if a specific transaction would be captured with current filter settings
 * Usage: node tools/test_transaction_classification.js <txSignature> <alphaWallet>
 */

import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
dotenv.config();

const TX_SIG = process.argv[2];
const ALPHA_WALLET = process.argv[3] || '8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp';

if (!TX_SIG) {
  console.error('Usage: node tools/test_transaction_classification.js <txSignature> <alphaWallet>');
  process.exit(1);
}

// Load filter settings from .env
const DUST_SOL_SPENT = parseFloat(process.env.DUST_SOL_SPENT || '0.001');
const MIN_ALPHA_TOKEN_BALANCE = parseFloat(process.env.MIN_ALPHA_TOKEN_BALANCE || '0.000001');
const MIN_SIZE_INCREASE_RATIO = parseFloat(process.env.MIN_SIZE_INCREASE_RATIO || '0.25');

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');

async function parseUiAmount(uiAmount) {
  if (!uiAmount || typeof uiAmount !== 'object') return 0;
  if (typeof uiAmount.uiAmount === 'number') return uiAmount.uiAmount;
  if (typeof uiAmount.uiAmountString === 'string') return parseFloat(uiAmount.uiAmountString) || 0;
  return 0;
}

async function testTransaction() {
  console.log('🔍 Testing transaction classification...');
  console.log(`   Transaction: ${TX_SIG}`);
  console.log(`   Alpha Wallet: ${ALPHA_WALLET}`);
  console.log(`   Current Filters:`);
  console.log(`      DUST_SOL_SPENT: ${DUST_SOL_SPENT}`);
  console.log(`      MIN_ALPHA_TOKEN_BALANCE: ${MIN_ALPHA_TOKEN_BALANCE}`);
  console.log(`      MIN_SIZE_INCREASE_RATIO: ${MIN_SIZE_INCREASE_RATIO}`);
  console.log('');

  try {
    const tx = await connection.getParsedTransaction(TX_SIG, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) {
      console.log('❌ Transaction not found or has no metadata');
      return;
    }

    const keys = tx.transaction?.message?.accountKeys ?? [];
    const normalize = (k) =>
      typeof k === 'string' ? k : k?.pubkey ?? (typeof k?.toBase58 === 'function' ? k.toBase58() : '');
    const alphaIndex = keys.findIndex((k) => normalize(k) === ALPHA_WALLET);

    if (alphaIndex === -1) {
      console.log('❌ Alpha wallet not found in transaction account keys');
      return;
    }

    const preLamports = Number(tx.meta.preBalances?.[alphaIndex] ?? 0);
    const postLamports = Number(tx.meta.postBalances?.[alphaIndex] ?? 0);
    const solSpent = (preLamports - postLamports) / 1e9;
    const solReceived = (postLamports - preLamports) / 1e9;

    console.log('📊 Transaction Analysis:');
    console.log(`   SOL Spent: ${solSpent.toFixed(6)}`);
    console.log(`   SOL Received: ${solReceived.toFixed(6)}`);
    console.log('');

    // Check DUST filter
    if (!Number.isFinite(solSpent) || solSpent < DUST_SOL_SPENT) {
      if (solReceived >= DUST_SOL_SPENT) {
        console.log('❌ FILTERED: SELL detected (not BUY)');
        console.log(`   Reason: solReceived=${solReceived.toFixed(6)} >= DUST_SOL_SPENT=${DUST_SOL_SPENT}`);
        return;
      } else {
        console.log('❌ FILTERED: DUST filter');
        console.log(`   Reason: solSpent=${solSpent.toFixed(6)} < DUST_SOL_SPENT=${DUST_SOL_SPENT}`);
        console.log('   This is likely a transfer or other transaction, not a swap');
        return;
      }
    }

    // Check token balances
    const preBalances = tx.meta.preTokenBalances ?? [];
    const postBalances = tx.meta.postTokenBalances ?? [];

    const preByMint = new Map();
    for (const bal of preBalances) {
      if (bal?.owner !== ALPHA_WALLET || !bal?.mint) continue;
      preByMint.set(bal.mint, bal);
    }

    const gains = [];
    for (const post of postBalances) {
      if (post?.owner !== ALPHA_WALLET || !post?.mint) continue;
      const postAmount = await parseUiAmount(post.uiTokenAmount);
      const preAmount = preByMint.has(post.mint)
        ? await parseUiAmount(preByMint.get(post.mint).uiTokenAmount)
        : 0;
      const delta = postAmount - preAmount;
      if (delta <= 0) continue;

      console.log(`   Token: ${post.mint.slice(0, 8)}...`);
      console.log(`      Pre-balance: ${preAmount.toFixed(6)}`);
      console.log(`      Post-balance: ${postAmount.toFixed(6)}`);
      console.log(`      Delta: ${delta.toFixed(6)}`);

      // Check MIN_ALPHA_TOKEN_BALANCE
      if (postAmount < MIN_ALPHA_TOKEN_BALANCE) {
        console.log(`      ❌ FILTERED: postAmount=${postAmount.toFixed(6)} < MIN_ALPHA_TOKEN_BALANCE=${MIN_ALPHA_TOKEN_BALANCE}`);
        continue;
      }

      // Check MIN_SIZE_INCREASE_RATIO
      if (preAmount > 0) {
        const ratio = delta / preAmount;
        if (ratio < MIN_SIZE_INCREASE_RATIO) {
          console.log(`      ❌ FILTERED: size increase ${ratio.toFixed(2)}x < MIN_SIZE_INCREASE_RATIO=${MIN_SIZE_INCREASE_RATIO}x`);
          continue;
        }
        console.log(`      ✅ Size increase: ${ratio.toFixed(2)}x (>= ${MIN_SIZE_INCREASE_RATIO}x)`);
      } else {
        console.log(`      ✅ First buy (no previous balance)`);
      }

      gains.push({ mint: post.mint, delta, postAmount, preAmount });
    }

    if (gains.length === 0) {
      console.log('');
      console.log('❌ FILTERED: No qualifying token balance increases');
      if (postBalances.filter(p => p?.owner === ALPHA_WALLET && p?.mint).length === 0) {
        console.log('   Reason: No token balances found for alpha (likely transfer/other, not swap)');
      } else {
        console.log('   Reason: Token balances found but none qualified (filtered by MIN_BALANCE or MIN_SIZE_INCREASE_RATIO)');
      }
      return;
    }

    const totalDelta = gains.reduce((sum, g) => sum + g.delta, 0);
    const alphaEntryPrice = solSpent / totalDelta;

    console.log('');
    console.log('✅ WOULD BE CAPTURED!');
    console.log(`   Total token delta: ${totalDelta.toFixed(6)}`);
    console.log(`   Alpha entry price: ${alphaEntryPrice.toExponential(3)} SOL/token`);
    console.log(`   Qualifying tokens: ${gains.length}`);
    gains.forEach(g => {
      console.log(`      - ${g.mint.slice(0, 8)}...: +${g.delta.toFixed(6)} tokens`);
    });

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
}

testTransaction();

