#!/usr/bin/env node
/**
 * Check if alpha wallet appears in token transactions
 * Uses batch fetching to avoid rate limits
 */

const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv/config');

const MINT = process.argv[2] || 'o1fGAh5v4zd9y8QAMn1BZY4rZGrbkNjiABCmwyemoon';
const ALPHA_WALLET = process.argv[3] || '8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp';
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const mint = new PublicKey(MINT);
  
  console.log(`\n🔍 Checking token: ${MINT}`);
  console.log(`👤 Looking for alpha: ${ALPHA_WALLET}\n`);
  
  try {
    // Get signatures (this is fast, no rate limit issues)
    console.log('📡 Fetching transaction signatures...');
    const sigs = await connection.getSignaturesForAddress(mint, { limit: 100 });
    console.log(`✅ Found ${sigs.length} transactions\n`);
    
    if (sigs.length === 0) {
      console.log('❌ No transactions found');
      return;
    }
    
    // Filter signatures that might involve our alpha wallet
    // We'll check the account keys in the signature info
    console.log('🔎 Scanning for alpha wallet...\n');
    
    let alphaTxs = [];
    let checked = 0;
    const BATCH_SIZE = 10; // Fetch 10 at a time to avoid rate limits
    
    for (let i = 0; i < sigs.length; i += BATCH_SIZE) {
      const batch = sigs.slice(i, i + BATCH_SIZE);
      const signatures = batch.map(s => s.signature);
      
      try {
        // Batch fetch transactions
        const txs = await connection.getParsedTransactions(signatures, {
          maxSupportedTransactionVersion: 0,
        });
        
        for (let j = 0; j < txs.length; j++) {
          const tx = txs[j];
          if (!tx) continue;
          
          checked++;
          const sig = batch[j];
          
          // Check if alpha wallet is in account keys
          const accountKeys = tx.transaction?.message?.accountKeys || [];
          const alphaIndex = accountKeys.findIndex(k => {
            const addr = typeof k === 'string' ? k : (k.pubkey?.toBase58() || k);
            return addr === ALPHA_WALLET;
          });
          
          if (alphaIndex !== -1) {
            // Alpha wallet found! Analyze the transaction
            const preLamports = tx.meta?.preBalances?.[alphaIndex] || 0;
            const postLamports = tx.meta?.postBalances?.[alphaIndex] || 0;
            const solSpent = (preLamports - postLamports) / 1e9;
            const solReceived = (postLamports - preLamports) / 1e9;
            
            // Check token balance changes
            const preTokenBalances = tx.meta?.preTokenBalances || [];
            const postTokenBalances = tx.meta?.postTokenBalances || [];
            let tokensReceived = 0;
            
            for (const post of postTokenBalances) {
              if (post.owner === ALPHA_WALLET && post.mint === MINT) {
                const pre = preTokenBalances.find(
                  p => p.owner === ALPHA_WALLET && p.mint === post.mint && p.accountIndex === post.accountIndex
                );
                const preAmount = pre ? parseFloat(pre.uiTokenAmount?.uiAmountString || '0') : 0;
                const postAmount = parseFloat(post.uiTokenAmount?.uiAmountString || '0');
                tokensReceived = postAmount - preAmount;
              }
            }
            
            const type = solSpent > 0.001 ? 'BUY' : solReceived > 0.001 ? 'SELL' : 'OTHER';
            const time = new Date(sig.blockTime * 1000).toISOString();
            
            alphaTxs.push({
              signature: sig.signature,
              time,
              solSpent,
              solReceived,
              tokensReceived,
              type,
            });
          }
        }
        
        // Progress indicator
        if (checked % 20 === 0) {
          process.stdout.write(`\r   Checked ${checked}/${sigs.length} transactions...`);
        }
        
        // Small delay to avoid rate limits
        if (i + BATCH_SIZE < sigs.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (err) {
        console.error(`\n⚠️  Error fetching batch: ${err.message}`);
        // Continue with next batch
      }
    }
    
    console.log(`\r   Checked ${checked}/${sigs.length} transactions... ✅\n`);
    
    // Report results
    if (alphaTxs.length > 0) {
      console.log(`\n✅ Found ${alphaTxs.length} transaction(s) involving alpha wallet:\n`);
      console.log('═'.repeat(80));
      
      alphaTxs.forEach((tx, i) => {
        console.log(`\n${i + 1}. ${tx.type} Transaction`);
        console.log(`   Time: ${tx.time}`);
        console.log(`   Signature: ${tx.signature}`);
        console.log(`   Solscan: https://solscan.io/tx/${tx.signature}`);
        
        if (tx.type === 'BUY') {
          console.log(`   💰 SOL Spent: ${tx.solSpent.toFixed(6)} SOL`);
          console.log(`   🪙 Tokens Received: ${tx.tokensReceived.toLocaleString()}`);
          if (tx.tokensReceived > 0) {
            const pricePerToken = tx.solSpent / tx.tokensReceived;
            console.log(`   💵 Entry Price: ${pricePerToken.toExponential(3)} SOL/token`);
          }
        } else if (tx.type === 'SELL') {
          console.log(`   💰 SOL Received: ${tx.solReceived.toFixed(6)} SOL`);
          console.log(`   🪙 Tokens Sold: ${Math.abs(tx.tokensReceived).toLocaleString()}`);
        }
      });
      
      console.log('\n' + '═'.repeat(80));
    } else {
      console.log(`\n❌ Alpha wallet (${ALPHA_WALLET}) NOT found in recent ${checked} transactions`);
      console.log(`\n💡 This could mean:`);
      console.log(`   • Alpha hasn't traded this token yet`);
      console.log(`   • Alpha's transaction is older than the last ${sigs.length} transactions`);
      console.log(`   • Alpha used a different wallet/subaccount`);
    }
    
    // Explain why there are many swaps
    console.log(`\n📊 Why so many swaps?`);
    console.log(`   • Active tokens have many traders (retail, bots, snipers)`);
    console.log(`   • Each swap creates a new transaction`);
    console.log(`   • High-volume tokens can have 100+ swaps per hour`);
    console.log(`   • This is normal for popular tokens\n`);
    
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (err.message.includes('429')) {
      console.error(`\n⚠️  Rate limit hit! Try again in a few minutes or use Helius RPC.`);
    }
    process.exit(1);
  }
}

main();

