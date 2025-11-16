#!/usr/bin/env node
// Check why a specific alpha transaction was missed
import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';

const MINT = process.argv[2];
const ALPHA = process.argv[3] || '8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp';
const TX_SIG = process.argv[4]; // Optional: specific transaction signature

if (!MINT) {
  console.error('Usage: node tools/check_missed_signal.mjs <mint> [alpha_wallet] [tx_signature]');
  process.exit(1);
}

const RPC_URL = process.env.HELIUS_RPC_URL || process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

const MAX_SIGNAL_AGE_SEC = parseInt(process.env.MAX_SIGNAL_AGE_SEC || '180', 10);
const DUST_SOL_SPENT = parseFloat(process.env.DUST_SOL_SPENT || '0.001');
const MIN_ALPHA_TOKEN_BALANCE = parseFloat(process.env.MIN_ALPHA_TOKEN_BALANCE || '1000');
const MIN_SIZE_INCREASE_RATIO = parseFloat(process.env.MIN_SIZE_INCREASE_RATIO || '0.1');
const MIN_LIQUIDITY_USD = parseFloat(process.env.MIN_LIQUIDITY_USD || '10000');

async function checkTransaction(sig) {
  console.log(`\n🔍 Analyzing transaction: ${sig}\n`);
  console.log(`Solscan: https://solscan.io/tx/${sig}\n`);
  
  try {
    const tx = await connection.getParsedTransaction(sig, {
      maxSupportedTransactionVersion: 0,
    });
    
    if (!tx || !tx.meta) {
      console.log('❌ Transaction not found or has no metadata');
      return;
    }
    
    const blockTime = tx.blockTime ? tx.blockTime * 1000 : null;
    const now = Date.now();
    const ageSec = blockTime ? (now - blockTime) / 1000 : null;
    
    console.log('📊 Transaction Details:');
    console.log(`  Block Time: ${blockTime ? new Date(blockTime).toISOString() : 'N/A'}`);
    console.log(`  Age: ${ageSec ? `${ageSec.toFixed(1)}s` : 'N/A'}`);
    console.log(`  Max Signal Age: ${MAX_SIGNAL_AGE_SEC}s`);
    if (ageSec && ageSec > MAX_SIGNAL_AGE_SEC) {
      console.log(`  ❌ TOO OLD! Signal age (${ageSec.toFixed(1)}s) > max (${MAX_SIGNAL_AGE_SEC}s)`);
    } else if (ageSec) {
      console.log(`  ✅ Age OK (${ageSec.toFixed(1)}s <= ${MAX_SIGNAL_AGE_SEC}s)`);
    }
    
    const keys = tx.transaction?.message?.accountKeys ?? [];
    const alphaIndex = keys.findIndex((k) => {
      const addr = typeof k === 'string' ? k : k?.pubkey ?? (typeof k?.toBase58 === 'function' ? k.toBase58() : '');
      return addr === ALPHA;
    });
    
    console.log(`\n🔑 Account Keys:`);
    console.log(`  Alpha in account keys: ${alphaIndex !== -1 ? `✅ Yes (index ${alphaIndex})` : '❌ No'}`);
    
    if (alphaIndex !== -1) {
      const preLamports = Number(tx.meta.preBalances?.[alphaIndex] ?? 0);
      const postLamports = Number(tx.meta.postBalances?.[alphaIndex] ?? 0);
      const solSpent = (preLamports - postLamports) / 1e9;
      const solReceived = (postLamports - preLamports) / 1e9;
      
      console.log(`  SOL Spent: ${solSpent.toFixed(6)} SOL`);
      console.log(`  SOL Received: ${solReceived.toFixed(6)} SOL`);
      console.log(`  Dust Threshold: ${DUST_SOL_SPENT} SOL`);
      
      if (solSpent < DUST_SOL_SPENT) {
        console.log(`  ❌ SOL spent (${solSpent.toFixed(6)}) < dust threshold (${DUST_SOL_SPENT})`);
      } else {
        console.log(`  ✅ SOL spent (${solSpent.toFixed(6)}) >= dust threshold`);
      }
      
      if (solReceived >= DUST_SOL_SPENT) {
        console.log(`  ⚠️  SELL detected (SOL received: ${solReceived.toFixed(6)})`);
      }
    }
    
    const preBalances = tx.meta.preTokenBalances ?? [];
    const postBalances = tx.meta.postTokenBalances ?? [];
    
    console.log(`\n🪙 Token Balances:`);
    const preByMint = new Map();
    for (const bal of preBalances) {
      if (bal?.owner === ALPHA && bal?.mint) {
        preByMint.set(bal.mint, bal);
      }
    }
    
    let foundMint = false;
    for (const post of postBalances) {
      if (post?.owner === ALPHA && post?.mint === MINT) {
        foundMint = true;
        const pre = preByMint.get(MINT);
        const preAmount = pre ? parseFloat(pre.uiTokenAmount?.uiAmountString || 0) : 0;
        const postAmount = parseFloat(post.uiTokenAmount?.uiAmountString || 0);
        const delta = postAmount - preAmount;
        
        console.log(`  ✅ Found mint ${MINT.slice(0, 8)}...`);
        console.log(`  Pre Balance: ${preAmount.toFixed(2)}`);
        console.log(`  Post Balance: ${postAmount.toFixed(2)}`);
        console.log(`  Delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`);
        console.log(`  Min Balance Threshold: ${MIN_ALPHA_TOKEN_BALANCE}`);
        console.log(`  Min Size Increase Ratio: ${MIN_SIZE_INCREASE_RATIO}x`);
        
        if (delta <= 0) {
          console.log(`  ❌ No token gain (delta: ${delta.toFixed(2)})`);
        } else if (postAmount < MIN_ALPHA_TOKEN_BALANCE) {
          console.log(`  ❌ Post balance (${postAmount.toFixed(2)}) < min threshold (${MIN_ALPHA_TOKEN_BALANCE})`);
        } else if (preAmount > 0) {
          const ratio = delta / preAmount;
          if (ratio < MIN_SIZE_INCREASE_RATIO) {
            console.log(`  ❌ Size increase (${ratio.toFixed(2)}x) < min ratio (${MIN_SIZE_INCREASE_RATIO}x)`);
          } else {
            console.log(`  ✅ Size increase (${ratio.toFixed(2)}x) >= min ratio`);
          }
        } else {
          console.log(`  ✅ New token (pre=0, post=${postAmount.toFixed(2)})`);
        }
      }
    }
    
    if (!foundMint) {
      console.log(`  ❌ Mint ${MINT.slice(0, 8)}... not found in token balances`);
      console.log(`  Available mints for alpha:`);
      const alphaMints = new Set();
      for (const bal of postBalances) {
        if (bal?.owner === ALPHA && bal?.mint) {
          alphaMints.add(bal.mint);
        }
      }
      for (const mint of alphaMints) {
        console.log(`    - ${mint.slice(0, 8)}...`);
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function findTransactions() {
  console.log(`\n🔍 Finding transactions for:`);
  console.log(`  Alpha: ${ALPHA}`);
  console.log(`  Mint: ${MINT}\n`);
  
  try {
    const alphaPk = new PublicKey(ALPHA);
    const sigs = await connection.getSignaturesForAddress(alphaPk, { limit: 50 });
    
    console.log(`Found ${sigs.length} recent transactions\n`);
    
    let found = 0;
    for (const sigInfo of sigs) {
      if (!sigInfo.blockTime) continue;
      
      const tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });
      
      if (!tx || !tx.meta) continue;
      
      const postBalances = tx.meta.postTokenBalances ?? [];
      for (const bal of postBalances) {
        if (bal?.owner === ALPHA && bal?.mint === MINT) {
          found++;
          console.log(`\n✅ Found interaction #${found}:`);
          await checkTransaction(sigInfo.signature);
          if (TX_SIG && sigInfo.signature === TX_SIG) {
            break; // Found the specific transaction
          }
        }
      }
    }
    
    if (found === 0) {
      console.log('❌ No transactions found for this mint');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

if (TX_SIG) {
  checkTransaction(TX_SIG).catch(console.error);
} else {
  findTransactions().catch(console.error);
}

