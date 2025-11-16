#!/usr/bin/env node
// Check mint info, alpha interactions, and add to watchlist
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { Connection, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';

const MINT = process.argv[2];
if (!MINT) {
  console.error('Usage: node tools/check_and_add_mint.mjs <mint_address>');
  process.exit(1);
}

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;

async function checkTokenInfo() {
  console.log('\n📊 Fetching token information...\n');
  
  try {
    // Try DexScreener
    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${MINT}`;
    const dexRes = await fetch(dexUrl);
    const dexData = await dexRes.json();
    
    if (dexData.pairs && dexData.pairs.length > 0) {
      const pair = dexData.pairs[0];
      console.log('✅ DexScreener data:');
      console.log(`   Token Name: ${pair.baseToken?.name || pair.quoteToken?.name || 'N/A'}`);
      console.log(`   Token Symbol: ${pair.baseToken?.symbol || pair.quoteToken?.symbol || 'N/A'}`);
      console.log(`   Liquidity: $${parseFloat(pair.liquidity?.usd || 0).toLocaleString()}`);
      console.log(`   24h Volume: $${parseFloat(pair.volume?.h24 || 0).toLocaleString()}`);
      console.log(`   Price (SOL): ${pair.priceNative || 'N/A'}`);
      console.log(`   Pair Address: ${pair.pairAddress || 'N/A'}`);
      if (pair.pairAddress) {
        console.log(`   Chart: https://dexscreener.com/solana/${pair.pairAddress}`);
      }
      return {
        tokenName: pair.baseToken?.name || pair.quoteToken?.name,
        tokenSymbol: pair.baseToken?.symbol || pair.quoteToken?.symbol,
        liquidityUsd: parseFloat(pair.liquidity?.usd || 0),
        volume24h: parseFloat(pair.volume?.h24 || 0),
        priceSol: parseFloat(pair.priceNative || 0),
        pairAddress: pair.pairAddress,
      };
    } else {
      console.log('❌ DexScreener: No pairs found');
    }
  } catch (err) {
    console.log(`❌ DexScreener error: ${err.message}`);
  }
  
  return null;
}

async function checkAlphaInteractions() {
  console.log('\n🔍 Checking alpha wallet interactions...\n');
  
  try {
    // Load alpha registry
    const registryPath = './alpha/alpha_registry.json';
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const active = registry.active || [];
    
    console.log(`Found ${active.length} active alpha wallets\n`);
    
    if (active.length === 0) {
      console.log('No active alpha wallets to check');
      return;
    }
    
    const mintPk = new PublicKey(MINT);
    let foundInteractions = false;
    
    for (const alpha of active.slice(0, 10)) { // Check first 10 alphas
      try {
        const alphaPk = new PublicKey(alpha.address);
        
        // Get recent transactions
        const signatures = await connection.getSignaturesForAddress(alphaPk, { limit: 20 });
        
        for (const sig of signatures.slice(0, 5)) { // Check last 5 transactions
          try {
            const tx = await connection.getParsedTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            });
            
            if (tx?.meta?.postTokenBalances) {
              for (const balance of tx.meta.postTokenBalances) {
                if (balance.mint === mintPk.toBase58()) {
                  console.log(`✅ Found interaction!`);
                  console.log(`   Alpha: ${alpha.address.slice(0, 8)}...${alpha.address.slice(-8)}`);
                  console.log(`   Transaction: https://solscan.io/tx/${sig.signature}`);
                  console.log(`   Time: ${new Date((sig.blockTime || 0) * 1000).toISOString()}`);
                  foundInteractions = true;
                  return alpha.address; // Return first alpha that interacted
                }
              }
            }
          } catch (err) {
            // Skip failed fetches
          }
        }
      } catch (err) {
        console.warn(`  ⚠️  Error checking ${alpha.address.slice(0, 8)}...: ${err.message}`);
      }
    }
    
    if (!foundInteractions) {
      console.log('❌ No recent interactions found with any alpha wallets');
      console.log('   (Checked last 5 transactions per alpha wallet)');
    }
    
    return foundInteractions ? active[0].address : null;
  } catch (err) {
    console.error('Error checking alpha interactions:', err.message);
    return null;
  }
}

async function addToWatchlist(alphaAddress) {
  console.log('\n📝 Adding to watchlist...\n');
  
  try {
    const watchlistPath = './data/watchlist.json';
    let watchlist = {};
    
    try {
      watchlist = JSON.parse(readFileSync(watchlistPath, 'utf8'));
    } catch {
      // File doesn't exist, create new
    }
  
    const entry = {
      mint: MINT,
      alpha: alphaAddress || 'MANUAL',
      reason: 'Manual addition',
      addedAt: Date.now(),
      lastChecked: 0,
      checkCount: 0,
    };
  
    watchlist[MINT] = entry;
    writeFileSync(watchlistPath, JSON.stringify(watchlist, null, 2));
    
    console.log('✅ Added to watchlist!');
    console.log(`   Mint: ${MINT}`);
    console.log(`   Alpha: ${alphaAddress || 'MANUAL'}`);
    console.log(`   Reason: Manual addition`);
    console.log(`\n   The bot will monitor this token for liquidity and auto-buy when ready.`);
  } catch (err) {
    console.error('❌ Error adding to watchlist:', err.message);
  }
}

async function main() {
  console.log(`\n🔎 Analyzing mint: ${MINT}\n`);
  console.log(`Solscan: https://solscan.io/token/${MINT}`);
  console.log(`DexScreener: https://dexscreener.com/solana/${MINT}\n`);
  
  const tokenInfo = await checkTokenInfo();
  const alphaAddress = await checkAlphaInteractions();
  
  if (tokenInfo) {
    console.log('\n📊 Token Summary:');
    console.log(`   Name: ${tokenInfo.tokenName || 'N/A'}`);
    console.log(`   Symbol: ${tokenInfo.tokenSymbol || 'N/A'}`);
    console.log(`   Liquidity: $${tokenInfo.liquidityUsd.toLocaleString()}`);
    console.log(`   24h Volume: $${tokenInfo.volume24h.toLocaleString()}`);
  }
  
  // Add to watchlist
  await addToWatchlist(alphaAddress);
  
  console.log('\n✅ Analysis complete!\n');
}

main().catch(console.error);

