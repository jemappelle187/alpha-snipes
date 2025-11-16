#!/usr/bin/env tsx
// Check mint info and alpha wallet interactions
import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';
import { getLiquidityResilient } from '../lib/liquidity.js';
import { getQuotePrice } from '../lib/quote_client.js';
import { listAll } from '../alpha/alpha_registry.js';
import { short } from '../lib/format.js';

const MINT = process.argv[2];
if (!MINT) {
  console.error('Usage: tsx tools/check_mint.ts <mint_address>');
  process.exit(1);
}

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

async function checkAlphaInteractions(mint: string) {
  console.log('\n🔍 Checking alpha wallet interactions...\n');
  
  const { active } = listAll();
  console.log(`Found ${active.length} active alpha wallets\n`);
  
  const mintPk = new PublicKey(mint);
  let foundInteractions = false;
  
  for (const alpha of active) {
    try {
      const alphaPk = new PublicKey(alpha.address);
      
      // Get recent transactions for this alpha wallet
      const signatures = await connection.getSignaturesForAddress(alphaPk, { limit: 50 });
      
      // Check if any transactions involve this mint
      for (const sig of signatures.slice(0, 10)) { // Check last 10 transactions
        try {
          const tx = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
          
          if (tx?.meta?.postTokenBalances) {
            for (const balance of tx.meta.postTokenBalances) {
              if (balance.mint === mint) {
                console.log(`✅ Found interaction!`);
                console.log(`   Alpha: ${short(alpha.address)}`);
                console.log(`   Transaction: https://solscan.io/tx/${sig.signature}`);
                console.log(`   Time: ${new Date(sig.blockTime! * 1000).toISOString()}`);
                foundInteractions = true;
                break;
              }
            }
          }
        } catch (err) {
          // Skip failed transaction fetches
        }
      }
    } catch (err: any) {
      console.warn(`  ⚠️  Error checking ${short(alpha.address)}: ${err.message}`);
    }
  }
  
  if (!foundInteractions) {
    console.log('❌ No recent interactions found with any alpha wallets');
    console.log('   (Checked last 10 transactions per alpha wallet)');
  }
}

async function checkTokenInfo(mint: string) {
  console.log('\n📊 Fetching token information...\n');
  
  try {
    const mintPk = new PublicKey(mint);
    
    // Get liquidity info from DexScreener
    console.log('Fetching from DexScreener...');
    const liquidity = await getLiquidityResilient(mint, { retries: 2, cacheMaxAgeMs: 0 });
    
    if (liquidity.ok) {
      console.log('✅ DexScreener data:');
      console.log(`   Token Name: ${liquidity.tokenName || 'N/A'}`);
      console.log(`   Token Symbol: ${liquidity.tokenSymbol || 'N/A'}`);
      console.log(`   Liquidity: $${liquidity.liquidityUsd?.toLocaleString() || '0'}`);
      console.log(`   24h Volume: $${liquidity.volume24h?.toLocaleString() || '0'}`);
      console.log(`   Price (SOL): ${liquidity.priceSol || 'N/A'}`);
      console.log(`   Pair Address: ${liquidity.pairAddress || 'N/A'}`);
      if (liquidity.pairAddress) {
        console.log(`   Chart: https://dexscreener.com/solana/${liquidity.pairAddress}`);
      }
    } else {
      console.log('❌ DexScreener: No data available');
    }
    
    // Get price from Jupiter
    console.log('\nFetching from Jupiter...');
    try {
      const price = await getQuotePrice(mintPk);
      if (price && price > 0) {
        console.log(`✅ Jupiter price: ${price.toExponential(4)} SOL/token`);
      } else {
        console.log('❌ Jupiter: No price available (token may not be indexed yet)');
      }
    } catch (err: any) {
      console.log(`❌ Jupiter error: ${err.message || err}`);
    }
    
  } catch (err: any) {
    console.error('Error fetching token info:', err.message || err);
  }
}

async function main() {
  console.log(`\n🔎 Analyzing mint: ${MINT}\n`);
  console.log(`Solscan: https://solscan.io/token/${MINT}`);
  console.log(`DexScreener: https://dexscreener.com/solana/${MINT}\n`);
  
  await checkTokenInfo(MINT);
  await checkAlphaInteractions(MINT);
  
  console.log('\n✅ Analysis complete!\n');
}

main().catch(console.error);

