#!/usr/bin/env node
// Test BUY detection for a specific alpha wallet transaction
import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';

const TX_SIG = process.argv[2];
const ALPHA = process.argv[3] || '8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp';

if (!TX_SIG) {
  console.error('Usage: node tools/test_buy_detection.mjs <tx_signature> [alpha_wallet]');
  process.exit(1);
}

const RPC_URL = process.env.HELIUS_RPC_URL || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

const DUST_SOL_SPENT = parseFloat(process.env.DUST_SOL_SPENT || '0.001');
const MIN_ALPHA_TOKEN_BALANCE = parseFloat(process.env.MIN_ALPHA_TOKEN_BALANCE || '1000');
const MIN_SIZE_INCREASE_RATIO = parseFloat(process.env.MIN_SIZE_INCREASE_RATIO || '0.1');
const MAX_SIGNAL_AGE_SEC = parseInt(process.env.MAX_SIGNAL_AGE_SEC || '180', 10);

function parseUiAmount(uiTokenAmount) {
  if (!uiTokenAmount) return 0;
  return parseFloat(uiTokenAmount.uiAmountString || uiTokenAmount.amount || '0');
}

async function testTransaction() {
  console.log(`\n🔍 Testing BUY Detection\n`);
  console.log(`Transaction: ${TX_SIG}`);
  console.log(`Alpha Wallet: ${ALPHA}\n`);
  console.log(`Solscan: https://solscan.io/tx/${TX_SIG}\n`);
  
  try {
    const tx = await connection.getParsedTransaction(TX_SIG, {
      maxSupportedTransactionVersion: 0,
    });
    
    if (!tx || !tx.meta) {
      console.log('❌ Transaction not found or has no metadata');
      return;
    }
    
    const keys = tx.transaction?.message?.accountKeys ?? [];
    const normalize = (k) => typeof k === 'string' ? k : k?.pubkey ?? (typeof k?.toBase58 === 'function' ? k.toBase58() : '');
    const alphaIndex = keys.findIndex((k) => normalize(k) === ALPHA);
    const alphaInAccountKeys = alphaIndex !== -1;
    
    console.log('📊 Transaction Analysis:\n');
    console.log(`  Alpha in account keys: ${alphaInAccountKeys ? `✅ Yes (index ${alphaIndex})` : '❌ No'}`);
    
    // Check SOL balance changes
    let solSpent = 0;
    let solReceived = 0;
    if (alphaInAccountKeys) {
      const preLamports = Number(tx.meta.preBalances?.[alphaIndex] ?? 0);
      const postLamports = Number(tx.meta.postBalances?.[alphaIndex] ?? 0);
      solSpent = (preLamports - postLamports) / 1e9;
      solReceived = (postLamports - preLamports) / 1e9;
      
      console.log(`  SOL Spent: ${solSpent.toFixed(6)} SOL`);
      console.log(`  SOL Received: ${solReceived.toFixed(6)} SOL`);
      console.log(`  DUST_SOL_SPENT threshold: ${DUST_SOL_SPENT} SOL`);
      
      if (solSpent < DUST_SOL_SPENT) {
        console.log(`  ❌ SOL spent (${solSpent.toFixed(6)}) < dust threshold (${DUST_SOL_SPENT})`);
        if (solReceived >= DUST_SOL_SPENT) {
          console.log(`  ⚠️  This is a SELL transaction (SOL received: ${solReceived.toFixed(6)})`);
        }
        return;
      } else {
        console.log(`  ✅ SOL spent (${solSpent.toFixed(6)}) >= dust threshold`);
      }
    } else {
      console.log(`  ⚠️  Alpha not in account keys - checking token balances only`);
    }
    
    // Check token balances
    const preBalances = tx.meta.preTokenBalances ?? [];
    const postBalances = tx.meta.postTokenBalances ?? [];
    
    console.log(`\n🪙 Token Balance Analysis:\n`);
    
    const preByMint = new Map();
    for (const bal of preBalances) {
      if (bal?.owner === ALPHA && bal?.mint) {
        preByMint.set(bal.mint, bal);
      }
    }
    
    let foundBuy = false;
    for (const post of postBalances) {
      if (post?.owner === ALPHA && post?.mint) {
        const pre = preByMint.get(post.mint);
        const preAmount = pre ? parseUiAmount(pre.uiTokenAmount) : 0;
        const postAmount = parseUiAmount(post.uiTokenAmount);
        const delta = postAmount - preAmount;
        
        if (delta > 0) {
          foundBuy = true;
          console.log(`  ✅ Found token gain: ${post.mint.slice(0, 8)}...`);
          console.log(`     Pre: ${preAmount.toFixed(2)}`);
          console.log(`     Post: ${postAmount.toFixed(2)}`);
          console.log(`     Delta: +${delta.toFixed(2)}`);
          console.log(`     MIN_ALPHA_TOKEN_BALANCE: ${MIN_ALPHA_TOKEN_BALANCE}`);
          
          if (postAmount < MIN_ALPHA_TOKEN_BALANCE) {
            console.log(`     ❌ Post balance (${postAmount.toFixed(2)}) < min threshold (${MIN_ALPHA_TOKEN_BALANCE})`);
          } else {
            console.log(`     ✅ Post balance (${postAmount.toFixed(2)}) >= min threshold`);
          }
          
          if (preAmount > 0) {
            const ratio = delta / preAmount;
            console.log(`     Size increase ratio: ${ratio.toFixed(2)}x`);
            console.log(`     MIN_SIZE_INCREASE_RATIO: ${MIN_SIZE_INCREASE_RATIO}x`);
            if (ratio < MIN_SIZE_INCREASE_RATIO) {
              console.log(`     ❌ Size increase (${ratio.toFixed(2)}x) < min ratio (${MIN_SIZE_INCREASE_RATIO}x)`);
            } else {
              console.log(`     ✅ Size increase (${ratio.toFixed(2)}x) >= min ratio`);
            }
          } else {
            console.log(`     ✅ New token (pre=0, post=${postAmount.toFixed(2)})`);
          }
        }
      }
    }
    
    if (!foundBuy) {
      console.log(`  ❌ No token gains found for alpha wallet`);
    }
    
    // Check signal age
    const blockTime = tx.blockTime ? tx.blockTime * 1000 : null;
    const now = Date.now();
    const ageSec = blockTime ? (now - blockTime) / 1000 : null;
    
    console.log(`\n⏰ Signal Age:\n`);
    if (blockTime) {
      console.log(`  Block Time: ${new Date(blockTime).toISOString()}`);
      console.log(`  Current Time: ${new Date(now).toISOString()}`);
      console.log(`  Age: ${ageSec ? `${ageSec.toFixed(1)}s` : 'N/A'}`);
      console.log(`  MAX_SIGNAL_AGE_SEC: ${MAX_SIGNAL_AGE_SEC}s`);
      if (ageSec && ageSec > MAX_SIGNAL_AGE_SEC) {
        console.log(`  ❌ Signal too old (${ageSec.toFixed(1)}s > ${MAX_SIGNAL_AGE_SEC}s)`);
      } else if (ageSec) {
        console.log(`  ✅ Signal age OK (${ageSec.toFixed(1)}s <= ${MAX_SIGNAL_AGE_SEC}s)`);
      }
    } else {
      console.log(`  ⚠️  No block time available`);
    }
    
    console.log(`\n📋 Summary:\n`);
    const checks = [
      { name: 'Alpha in account keys or token balance detected', pass: alphaInAccountKeys || foundBuy },
      { name: `SOL spent >= ${DUST_SOL_SPENT} SOL`, pass: alphaInAccountKeys ? solSpent >= DUST_SOL_SPENT : true },
      { name: `Token balance >= ${MIN_ALPHA_TOKEN_BALANCE}`, pass: foundBuy },
      { name: `Signal age <= ${MAX_SIGNAL_AGE_SEC}s`, pass: !ageSec || ageSec <= MAX_SIGNAL_AGE_SEC },
    ];
    
    for (const check of checks) {
      console.log(`  ${check.pass ? '✅' : '❌'} ${check.name}`);
    }
    
    const allPass = checks.every(c => c.pass);
    console.log(`\n${allPass ? '✅ BUY signal would be detected' : '❌ BUY signal would be filtered out'}\n`);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testTransaction().catch(console.error);

