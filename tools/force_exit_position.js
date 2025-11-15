#!/usr/bin/env node
/**
 * Force exit a position programmatically
 * Usage: node tools/force_exit_position.js <mint>
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddress, createCloseAccountInstruction } from '@solana/spl-token';
import dotenv from 'dotenv';
import fs from 'fs';
import { getQuotePrice, getJupiterSwapTransaction, swapTokenForSOL } from '../lib/quote_client.js';
import { getSolUsd } from '../lib/sol_price.js';
import { formatSol, formatUsd, short, isValidPrice } from '../lib/format.js';
import { loadPositions, savePositions } from '../lib/positions.js';

dotenv.config();

const MINT = process.argv[2];

if (!MINT) {
  console.error('Usage: node tools/force_exit_position.js <mint>');
  process.exit(1);
}

const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
const walletKeypair = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(process.env.WALLET_PRIVATE_KEY || '[]'))
);

async function forceExit() {
  console.log(`🔨 Force exiting position for ${short(MINT)}...`);
  
  // Load positions
  const positions = loadPositions();
  const pos = positions[MINT];
  
  if (!pos) {
    console.log(`❌ No open position found for ${short(MINT)}`);
    return;
  }
  
  console.log(`📊 Position found:`);
  console.log(`   Quantity: ${pos.qty}`);
  console.log(`   Entry Price: ${pos.entryPrice}`);
  console.log(`   Cost: ${pos.costSol} SOL`);
  
  // Get current price
  console.log(`\n💰 Fetching current price...`);
  const price = await getQuotePrice(new PublicKey(MINT));
  
  if (!price || !isValidPrice(price)) {
    console.log(`❌ Could not fetch current price`);
    console.log(`   Position will be removed from tracking anyway`);
    
    // Remove from positions
    delete positions[MINT];
    savePositions(positions);
    console.log(`✅ Position removed from tracking`);
    return;
  }
  
  const solUsd = await getSolUsd();
  const exitSol = Number(pos.qty) * price;
  const exitUsd = exitSol * solUsd;
  const entryUsd = pos.costSol * solUsd;
  const pnlSol = exitSol - pos.costSol;
  const pnlUsd = exitUsd - entryUsd;
  const pnl = pos.costSol > 0 ? (pnlSol / pos.costSol) * 100 : 0;
  
  console.log(`\n📈 Exit Details:`);
  console.log(`   Current Price: ${price.toExponential(3)} SOL/token`);
  console.log(`   Exit Value: ${formatSol(exitSol)} (${formatUsd(exitUsd)})`);
  console.log(`   Entry Value: ${formatSol(pos.costSol)} (${formatUsd(entryUsd)})`);
  console.log(`   PnL: ${pnl >= 0 ? '+' : ''}${formatSol(pnlSol)} (${formatUsd(pnlUsd)}) [${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%]`);
  
  // Execute swap (paper mode - simulated)
  const IS_PAPER = (process.env.TRADE_MODE || 'paper').toLowerCase() !== 'live';
  
  if (IS_PAPER) {
    console.log(`\n📄 PAPER MODE - Simulating swap...`);
    try {
      const tx = await swapTokenForSOL(new PublicKey(MINT), pos.qty);
      console.log(`✅ Simulated swap successful`);
      console.log(`   TX: ${tx.txid || 'simulated'}`);
    } catch (err) {
      console.log(`⚠️  Swap simulation failed: ${err.message}`);
    }
  } else {
    console.log(`\n💰 LIVE MODE - Executing real swap...`);
    try {
      const tx = await swapTokenForSOL(new PublicKey(MINT), pos.qty);
      console.log(`✅ Real swap executed`);
      console.log(`   TX: ${tx.txid}`);
    } catch (err) {
      console.log(`❌ Swap failed: ${err.message}`);
      return;
    }
  }
  
  // Remove from positions
  delete positions[MINT];
  savePositions(positions);
  
  console.log(`\n✅ Position removed from tracking`);
  console.log(`   Mint: ${short(MINT)}`);
  console.log(`   Final PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`);
}

forceExit().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

