#!/usr/bin/env node
// Check if alpha wallet interacted with a specific mint
import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';

const MINT = process.argv[2];
const ALPHA_WALLET = process.argv[3] || '8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp';

if (!MINT) {
  console.error('Usage: node tools/check_alpha_interaction.mjs <mint_address> [alpha_wallet]');
  process.exit(1);
}

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

async function checkInteraction() {
  console.log(`\n🔍 Checking if alpha wallet ${ALPHA_WALLET.slice(0, 8)}...${ALPHA_WALLET.slice(-8)} interacted with ${MINT.slice(0, 8)}...${MINT.slice(-8)}\n`);
  
  try {
    const alphaPk = new PublicKey(ALPHA_WALLET);
    const mintPk = new PublicKey(MINT);
    
    // Get recent transactions (last 100)
    console.log('Fetching recent transactions...');
    const signatures = await connection.getSignaturesForAddress(alphaPk, { limit: 100 });
    console.log(`Found ${signatures.length} recent transactions\n`);
    
    let foundInteractions = [];
    
    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (!tx) continue;
        
        // Check post token balances
        if (tx.meta?.postTokenBalances) {
          for (const balance of tx.meta.postTokenBalances) {
            if (balance.mint === mintPk.toBase58()) {
              const preBalance = tx.meta.preTokenBalances?.find(b => 
                b.accountIndex === balance.accountIndex && b.mint === mintPk.toBase58()
              );
              
              const preAmount = preBalance ? parseFloat(preBalance.uiTokenAmount.uiAmountString || '0') : 0;
              const postAmount = parseFloat(balance.uiTokenAmount.uiAmountString || '0');
              const delta = postAmount - preAmount;
              
              foundInteractions.push({
                signature: sig.signature,
                blockTime: sig.blockTime,
                delta: delta,
                postAmount: postAmount,
                type: delta > 0 ? 'BUY' : delta < 0 ? 'SELL' : 'TRANSFER'
              });
            }
          }
        }
      } catch (err) {
        // Skip failed fetches
      }
    }
    
    if (foundInteractions.length > 0) {
      console.log(`✅ Found ${foundInteractions.length} interaction(s)!\n`);
      for (const interaction of foundInteractions.slice(0, 5)) {
        console.log(`   Type: ${interaction.type}`);
        console.log(`   Amount: ${interaction.delta > 0 ? '+' : ''}${interaction.delta}`);
        console.log(`   Transaction: https://solscan.io/tx/${interaction.signature}`);
        console.log(`   Time: ${new Date(interaction.blockTime * 1000).toISOString()}`);
        console.log('');
      }
      return true;
    } else {
      console.log('❌ No interactions found');
      console.log(`   (Checked last ${signatures.length} transactions)`);
      return false;
    }
  } catch (err) {
    console.error('Error:', err.message);
    return false;
  }
}

checkInteraction().then(hasInteraction => {
  if (hasInteraction) {
    console.log('✅ Alpha wallet HAS interacted with this token');
  } else {
    console.log('❌ Alpha wallet has NOT interacted with this token');
  }
  process.exit(hasInteraction ? 0 : 1);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

