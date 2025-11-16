#!/usr/bin/env node
// Analyze alpha wallet configuration and signal detection
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const ALPHA_WALLET = process.argv[2] || '8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp';

console.log(`\n🔍 Analyzing Alpha Wallet Configuration\n`);
console.log(`Alpha Wallet: ${ALPHA_WALLET}\n`);

// Read registry
try {
  const registryPath = join(projectRoot, 'alpha', 'registry.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  
  const isActive = registry.active?.includes(ALPHA_WALLET);
  const isCandidate = registry.candidates?.includes(ALPHA_WALLET);
  const score = registry.scores?.[ALPHA_WALLET];
  
  console.log('📋 Registry Status:');
  console.log(`  Active: ${isActive ? '✅ YES' : '❌ NO'}`);
  console.log(`  Candidate: ${isCandidate ? '✅ YES' : '❌ NO'}`);
  if (score) {
    console.log(`  Signals: ${score.signals || 0}`);
    console.log(`  Last Seen: ${score.lastSeen ? new Date(score.lastSeen).toISOString() : 'Never'}`);
  }
  console.log('');
} catch (err) {
  console.error('Error reading registry:', err.message);
}

// Read .env for configuration
try {
  const envPath = join(projectRoot, '.env');
  const envContent = readFileSync(envPath, 'utf8');
  
  const config = {
    MAX_SIGNAL_AGE_SEC: envContent.match(/MAX_SIGNAL_AGE_SEC=(\d+)/)?.[1] || '180',
    DUST_SOL_SPENT: envContent.match(/DUST_SOL_SPENT=([\d.]+)/)?.[1] || '0.001',
    MIN_ALPHA_TOKEN_BALANCE: envContent.match(/MIN_ALPHA_TOKEN_BALANCE=([\d.]+)/)?.[1] || '1000',
    MIN_SIZE_INCREASE_RATIO: envContent.match(/MIN_SIZE_INCREASE_RATIO=([\d.]+)/)?.[1] || '0.1',
    MIN_LIQUIDITY_USD: envContent.match(/MIN_LIQUIDITY_USD=([\d.]+)/)?.[1] || '10000',
    BUY_SOL: envContent.match(/BUY_SOL=([\d.]+)/)?.[1] || '0.01',
    MAX_ALPHA_ENTRY_MULTIPLIER: envContent.match(/MAX_ALPHA_ENTRY_MULTIPLIER=([\d.]+)/)?.[1] || '2',
  };
  
  console.log('⚙️  Configuration:');
  console.log(`  MAX_SIGNAL_AGE_SEC: ${config.MAX_SIGNAL_AGE_SEC}s (${config.MAX_SIGNAL_AGE_SEC / 60} minutes)`);
  console.log(`  DUST_SOL_SPENT: ${config.DUST_SOL_SPENT} SOL`);
  console.log(`  MIN_ALPHA_TOKEN_BALANCE: ${config.MIN_ALPHA_TOKEN_BALANCE}`);
  console.log(`  MIN_SIZE_INCREASE_RATIO: ${config.MIN_SIZE_INCREASE_RATIO}x`);
  console.log(`  MIN_LIQUIDITY_USD: $${config.MIN_LIQUIDITY_USD}`);
  console.log(`  BUY_SOL: ${config.BUY_SOL} SOL`);
  console.log(`  MAX_ALPHA_ENTRY_MULTIPLIER: ${config.MAX_ALPHA_ENTRY_MULTIPLIER}x`);
  console.log('');
  
  console.log('📊 Signal Detection Requirements:');
  console.log(`  ✅ Alpha must be in active list`);
  console.log(`  ✅ SOL spent >= ${config.DUST_SOL_SPENT} SOL`);
  console.log(`  ✅ Token balance increase >= ${config.MIN_ALPHA_TOKEN_BALANCE} tokens`);
  console.log(`  ✅ Size increase ratio >= ${config.MIN_SIZE_INCREASE_RATIO}x (if existing position)`);
  console.log(`  ✅ Signal age <= ${config.MAX_SIGNAL_AGE_SEC}s`);
  console.log(`  ✅ Liquidity >= $${config.MIN_LIQUIDITY_USD}`);
  console.log(`  ✅ Price <= ${config.MAX_ALPHA_ENTRY_MULTIPLIER}x alpha entry price`);
  console.log('');
  
} catch (err) {
  console.error('Error reading .env:', err.message);
}

console.log('🔍 Detection Methods:');
console.log('  1. onLogs() subscription - Real-time transaction monitoring');
console.log('  2. Polling backup - Every 15s, checks last 30s');
console.log('  3. Birdeye backfill - On startup, checks last 30 minutes');
console.log('');

console.log('⚠️  Current Limitations:');
console.log('  - Bot only detects BUY signals (not SELL signals)');
console.log('  - Bot exits based on price targets, not alpha wallet sells');
console.log('  - Signal age guard: 3 minutes max');
console.log('  - Polling backup: 30 seconds max');
console.log('');

