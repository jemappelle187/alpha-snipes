#!/usr/bin/env node
// Compare bot data with GMGN.ai data for a token
import 'dotenv/config';
import fetch from 'node-fetch';

const MINT = process.argv[2];
if (!MINT) {
  console.error('Usage: node tools/compare_gmgn_data.mjs <mint_address>');
  process.exit(1);
}

// Bot's reported data from the message
const BOT_DATA = {
  entryPrice: 0.000634, // SOL/token
  entryPriceUsd: 0.086,
  sizeSol: 0.01,
  sizeUsd: 1.3563,
  liquidityUsd: 0.00,
  tokensReceived: 15429603995,
};

async function fetchDexScreener() {
  console.log('\n📊 Fetching from DexScreener...\n');
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${MINT}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0];
      return {
        tokenName: pair.baseToken?.name || pair.quoteToken?.name,
        tokenSymbol: pair.baseToken?.symbol || pair.quoteToken?.symbol,
        priceSol: parseFloat(pair.priceNative || 0),
        priceUsd: parseFloat(pair.priceUsd || 0),
        liquidityUsd: parseFloat(pair.liquidity?.usd || 0),
        volume24h: parseFloat(pair.volume?.h24 || 0),
        pairAddress: pair.pairAddress,
      };
    }
  } catch (err) {
    console.error('DexScreener error:', err.message);
  }
  return null;
}

async function fetchJupiterPrice() {
  console.log('📊 Fetching from Jupiter...\n');
  try {
    const SOL = 'So11111111111111111111111111111111111111112';
    const url = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL}&outputMint=${MINT}&amount=1000000000&slippageBps=50`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data && data.outAmount) {
      // Calculate price: 1 SOL = outAmount tokens
      // Price per token = 1 / (outAmount / 1e9) = 1e9 / outAmount
      const tokensPerSol = parseFloat(data.outAmount) / 1e9;
      const pricePerToken = 1 / tokensPerSol;
      return pricePerToken;
    }
  } catch (err) {
    console.error('Jupiter error:', err.message);
  }
  return null;
}

function calculateMetrics() {
  console.log('\n📈 Calculating metrics from bot data...\n');
  
  // Calculate price from bot's data
  // Entry price = SOL spent / tokens received
  const calculatedPrice = BOT_DATA.sizeSol / BOT_DATA.tokensReceived;
  
  // Calculate market cap estimate (if we had total supply)
  // Market cap = price * total supply
  
  console.log('Bot Reported Data:');
  console.log(`  Entry Price: ${BOT_DATA.entryPrice.toExponential(4)} SOL/token`);
  console.log(`  Entry Price (USD): $${BOT_DATA.entryPriceUsd}`);
  console.log(`  Size: ${BOT_DATA.sizeSol} SOL ($${BOT_DATA.sizeUsd})`);
  console.log(`  Tokens Received: ${BOT_DATA.tokensReceived.toLocaleString()}`);
  console.log(`  Liquidity: $${BOT_DATA.liquidityUsd}`);
  console.log(`\n  Calculated Price: ${calculatedPrice.toExponential(4)} SOL/token`);
  console.log(`  Price Match: ${Math.abs(calculatedPrice - BOT_DATA.entryPrice) < 0.0001 ? '✅' : '❌'}`);
  
  return calculatedPrice;
}

async function main() {
  console.log(`\n🔍 Comparing data for: ${MINT}\n`);
  console.log(`GMGN.ai: https://gmgn.ai/sol/token/${MINT}`);
  console.log(`DexScreener: https://dexscreener.com/solana/${MINT}`);
  console.log(`Solscan: https://solscan.io/token/${MINT}\n`);
  
  const calculatedPrice = calculateMetrics();
  
  const dexData = await fetchDexScreener();
  const jupiterPrice = await fetchJupiterPrice();
  
  console.log('\n📊 Current Market Data:\n');
  
  if (dexData) {
    console.log('DexScreener:');
    console.log(`  Token: ${dexData.tokenName || 'N/A'} (${dexData.tokenSymbol || 'N/A'})`);
    console.log(`  Current Price: ${dexData.priceSol.toExponential(4)} SOL/token`);
    console.log(`  Current Price (USD): $${dexData.priceUsd || 'N/A'}`);
    console.log(`  Liquidity: $${dexData.liquidityUsd.toLocaleString()}`);
    console.log(`  24h Volume: $${dexData.volume24h.toLocaleString()}`);
    
    // Compare with bot's entry price
    const priceChange = ((dexData.priceSol - BOT_DATA.entryPrice) / BOT_DATA.entryPrice) * 100;
    console.log(`\n  Price Change from Entry: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
    
    if (Math.abs(priceChange) > 50) {
      console.log(`  ⚠️  Significant price change detected!`);
    }
  }
  
  if (jupiterPrice) {
    console.log('\nJupiter:');
    console.log(`  Current Price: ${jupiterPrice.toExponential(4)} SOL/token`);
    
    const priceChange = ((jupiterPrice - BOT_DATA.entryPrice) / BOT_DATA.entryPrice) * 100;
    console.log(`  Price Change from Entry: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`);
  }
  
  console.log('\n📋 Comparison Summary:\n');
  console.log('Bot Entry Data:');
  console.log(`  Entry: ${BOT_DATA.entryPrice.toExponential(4)} SOL/token ($${BOT_DATA.entryPriceUsd})`);
  console.log(`  Liquidity at Entry: $${BOT_DATA.liquidityUsd}`);
  console.log(`  Tokens: ${BOT_DATA.tokensReceived.toLocaleString()}`);
  
  if (dexData) {
    console.log('\nCurrent Market:');
    console.log(`  Price: ${dexData.priceSol.toExponential(4)} SOL/token`);
    console.log(`  Liquidity: $${dexData.liquidityUsd.toLocaleString()}`);
    
    if (BOT_DATA.liquidityUsd === 0 && dexData.liquidityUsd > 0) {
      console.log(`\n  ✅ Liquidity was added after entry!`);
    } else if (BOT_DATA.liquidityUsd > 0 && dexData.liquidityUsd === 0) {
      console.log(`\n  ⚠️  Liquidity was removed! (Potential rug)`);
    } else if (BOT_DATA.liquidityUsd === 0 && dexData.liquidityUsd === 0) {
      console.log(`\n  ⚠️  Still no liquidity - token may not be tradeable`);
    }
  }
  
  console.log('\n✅ Comparison complete!\n');
}

main().catch(console.error);

