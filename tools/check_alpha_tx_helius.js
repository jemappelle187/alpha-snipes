#!/usr/bin/env node
/**
 * Check if alpha wallet appears in token transactions
 * Uses Helius RPC with proper rate limiting
 */

import { Connection, PublicKey } from '@solana/web3.js';
import 'dotenv/config';

const MINT = process.argv[2] || 'o1fGAh5v4zd9y8QAMn1BZY4rZGrbkNjiABCmwyemoon';
const ALPHA_WALLET = process.argv[3] || '8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp';

// Use Helius RPC if available
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';

// Ensure we're using Helius if API key is available
const finalRpcUrl = HELIUS_API_KEY && !RPC_URL.includes('helius')
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : RPC_URL;

console.log(`\n🔍 Checking token: ${MINT}`);
console.log(`👤 Looking for alpha: ${ALPHA_WALLET}`);
console.log(`🌐 RPC: ${finalRpcUrl.includes('helius') ? '✅ Helius' : '⚠️  Public RPC'}\n`);

async function main() {
  const connection = new Connection(finalRpcUrl, 'confirmed');
  const mint = new PublicKey(MINT);
  const alphaPubkey = new PublicKey(ALPHA_WALLET);
  
  try {
    // Method 1: Check alpha wallet's transactions for this token
    console.log('📡 Method 1: Checking alpha wallet transactions...');
    const alphaSigs = await connection.getSignaturesForAddress(alphaPubkey, { limit: 50 });
    console.log(`✅ Found ${alphaSigs.length} recent alpha transactions\n`);
    
    let foundInAlphaTxs = false;
    const BATCH_SIZE = 5; // Smaller batches for Helius
    
    // Fetch transactions one by one (Helius free tier doesn't support batch)
    for (let i = 0; i < Math.min(30, alphaSigs.length); i++) {
      const sig = alphaSigs[i];
      
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (tx) {
          
          // Check if this transaction involves our token
          const preTokenBalances = tx.meta?.preTokenBalances || [];
          const postTokenBalances = tx.meta?.postTokenBalances || [];
          
          const hasToken = [...preTokenBalances, ...postTokenBalances].some(
            bal => bal?.mint === MINT
          );
          
          if (hasToken) {
            foundInAlphaTxs = true;
            
            // Analyze transaction
            const accountKeys = tx.transaction?.message?.accountKeys || [];
            const alphaIndex = accountKeys.findIndex(k => {
              const addr = typeof k === 'string' ? k : (k.pubkey?.toBase58() || k);
              return addr === ALPHA_WALLET;
            });
            
            const preLamports = tx.meta?.preBalances?.[alphaIndex] || 0;
            const postLamports = tx.meta?.postBalances?.[alphaIndex] || 0;
            const solSpent = (preLamports - postLamports) / 1e9;
            const solReceived = (postLamports - preLamports) / 1e9;
            
            // Find token balance changes
            let tokensReceived = 0;
            for (const post of postTokenBalances) {
              if (post.owner === ALPHA_WALLET && post.mint === MINT) {
                const pre = preTokenBalances.find(
                  p => p.owner === ALPHA_WALLET && p.mint === MINT && p.accountIndex === post.accountIndex
                );
                const preAmount = pre ? parseFloat(pre.uiTokenAmount?.uiAmountString || '0') : 0;
                const postAmount = parseFloat(post.uiTokenAmount?.uiAmountString || '0');
                tokensReceived = postAmount - preAmount;
              }
            }
            
            const type = solSpent > 0.001 ? 'BUY' : solReceived > 0.001 ? 'SELL' : 'OTHER';
            const time = new Date(sig.blockTime * 1000).toISOString();
            
            console.log(`\n✅ FOUND ALPHA TRANSACTION!\n`);
            console.log('═'.repeat(80));
            console.log(`\n${type} Transaction`);
            console.log(`   Time: ${time}`);
            console.log(`   Signature: ${sig.signature}`);
            console.log(`   Solscan: https://solscan.io/tx/${sig.signature}`);
            
            if (type === 'BUY') {
              console.log(`   💰 SOL Spent: ${solSpent.toFixed(6)} SOL`);
              console.log(`   🪙 Tokens Received: ${tokensReceived.toLocaleString()}`);
              if (tokensReceived > 0) {
                const pricePerToken = solSpent / tokensReceived;
                console.log(`   💵 Entry Price: ${pricePerToken.toExponential(3)} SOL/token`);
              }
            } else if (type === 'SELL') {
              console.log(`   💰 SOL Received: ${solReceived.toFixed(6)} SOL`);
              console.log(`   🪙 Tokens Sold: ${Math.abs(tokensReceived).toLocaleString()}`);
            }
            console.log('\n' + '═'.repeat(80));
          }
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (err) {
        if (err.message?.includes('429')) {
          console.error(`\n⚠️  Rate limit hit. Waiting 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          console.error(`\n⚠️  Error fetching batch: ${err.message}`);
        }
      }
    }
    
    if (!foundInAlphaTxs) {
      console.log(`\n❌ Alpha wallet NOT found in recent alpha transactions`);
    }
    
    // Method 2: Check token transactions (slower, but more comprehensive)
    console.log(`\n📡 Method 2: Checking token transactions...`);
    const tokenSigs = await connection.getSignaturesForAddress(mint, { limit: 100 });
    console.log(`✅ Found ${tokenSigs.length} token transactions\n`);
    
    let foundInTokenTxs = false;
    let checked = 0;
    
    console.log('   Checking transactions one by one (Helius free tier limitation)...\n');
    
    // Check first 50 transactions (most recent) - one by one for Helius free tier
    for (let i = 0; i < Math.min(50, tokenSigs.length); i++) {
      const sig = tokenSigs[i];
      
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (tx) {
          checked++;
          
          // Check if alpha wallet is in account keys
          const accountKeys = tx.transaction?.message?.accountKeys || [];
          const alphaIndex = accountKeys.findIndex(k => {
            const addr = typeof k === 'string' ? k : (k.pubkey?.toBase58() || k);
            return addr === ALPHA_WALLET;
          });
          
          if (alphaIndex !== -1) {
            foundInTokenTxs = true;
            
            const preLamports = tx.meta?.preBalances?.[alphaIndex] || 0;
            const postLamports = tx.meta?.postBalances?.[alphaIndex] || 0;
            const solSpent = (preLamports - postLamports) / 1e9;
            const solReceived = (postLamports - preLamports) / 1e9;
            
            const preTokenBalances = tx.meta?.preTokenBalances || [];
            const postTokenBalances = tx.meta?.postTokenBalances || [];
            let tokensReceived = 0;
            
            for (const post of postTokenBalances) {
              if (post.owner === ALPHA_WALLET && post.mint === MINT) {
                const pre = preTokenBalances.find(
                  p => p.owner === ALPHA_WALLET && p.mint === MINT && p.accountIndex === post.accountIndex
                );
                const preAmount = pre ? parseFloat(pre.uiTokenAmount?.uiAmountString || '0') : 0;
                const postAmount = parseFloat(post.uiTokenAmount?.uiAmountString || '0');
                tokensReceived = postAmount - preAmount;
              }
            }
            
            const type = solSpent > 0.001 ? 'BUY' : solReceived > 0.001 ? 'SELL' : 'OTHER';
            const time = new Date(sig.blockTime * 1000).toISOString();
            
            if (!foundInAlphaTxs) {
              console.log(`\n✅ FOUND ALPHA TRANSACTION!\n`);
              console.log('═'.repeat(80));
            }
            console.log(`\n${type} Transaction`);
            console.log(`   Time: ${time}`);
            console.log(`   Signature: ${sig.signature}`);
            console.log(`   Solscan: https://solscan.io/tx/${sig.signature}`);
            
            if (type === 'BUY') {
              console.log(`   💰 SOL Spent: ${solSpent.toFixed(6)} SOL`);
              console.log(`   🪙 Tokens Received: ${tokensReceived.toLocaleString()}`);
            } else if (type === 'SELL') {
              console.log(`   💰 SOL Received: ${solReceived.toFixed(6)} SOL`);
              console.log(`   🪙 Tokens Sold: ${Math.abs(tokensReceived).toLocaleString()}`);
            }
            if (!foundInAlphaTxs) {
              console.log('\n' + '═'.repeat(80));
            }
          }
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (err) {
        if (err.message?.includes('429')) {
          console.error(`\n⚠️  Rate limit hit. Waiting 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          console.error(`\n⚠️  Error: ${err.message}`);
        }
      }
    }
    
    if (!foundInAlphaTxs && !foundInTokenTxs) {
      console.log(`\n❌ Alpha wallet NOT found in recent transactions`);
      console.log(`\n💡 Possible reasons:`);
      console.log(`   • Alpha hasn't traded this token yet`);
      console.log(`   • Transaction is older than checked range`);
      console.log(`   • Alpha used a different wallet/subaccount`);
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   • Checked ${checked} token transactions`);
    console.log(`   • Alpha transactions found: ${foundInAlphaTxs || foundInTokenTxs ? '✅ YES' : '❌ NO'}`);
    console.log(`   • Many swaps are normal for active tokens (retail, bots, snipers)\n`);
    
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (err.message?.includes('429')) {
      console.error(`\n⚠️  Rate limit exceeded. Try again in a few minutes.`);
    }
    process.exit(1);
  }
}

main();

