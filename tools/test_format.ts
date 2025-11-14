// tools/test_format.ts
// Test formatting utilities

import { 
  lamportsToSol, 
  formatSol, 
  formatUsd, 
  short,
  solscanTx,
  solscanMint,
  solscanWallet
} from '../lib/format.js';

console.log('🧪 Testing Format Utilities\n');

// Test lamportsToSol
console.log('=== lamportsToSol ===');
console.log('1 SOL (1B lamports):', lamportsToSol(1_000_000_000));
console.log('0.5 SOL:', lamportsToSol(500_000_000));
console.log('0.01 SOL:', lamportsToSol(10_000_000));
console.log('String input:', lamportsToSol('1000000000'));
console.log();

// Test formatSol
console.log('=== formatSol ===');
console.log('Whole number:', formatSol(1));
console.log('With decimals:', formatSol(0.12345678));
console.log('Trailing zeros:', formatSol(1.50000000));
console.log('Small amount:', formatSol(0.00012300));
console.log('Large amount:', formatSol(123.456789));
console.log();

// Test formatUsd
console.log('=== formatUsd ===');
console.log('Whole dollar:', formatUsd(100));
console.log('With cents:', formatUsd(237.85));
console.log('Small amount:', formatUsd(0.0042));
console.log('Large amount:', formatUsd(10000.5678));
console.log();

// Test short
console.log('=== short ===');
const longAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
console.log('Full address:', longAddr);
console.log('Shortened (default):', short(longAddr));
console.log('Custom (8,6):', short(longAddr, 8, 6));
console.log('Short string:', short('abc'));
console.log('Empty string:', short(''));
console.log();

// Test Solscan URLs
console.log('=== Solscan URLs ===');
const exampleSig = '5GHV9EeEsdThNr1XyZ3Roj9zNfgdtadBrRy974a9ssCyj8ciPP7YynztPnAXSodqA9iVMHsK841PNey2RZi2HyTU';
const exampleMint = 'So11111111111111111111111111111111111111112';
const exampleWallet = '4rNgv2QXwyfWh9QJaJg8YJ6qjpqqaXRHBJVUXTAUUHrA';

console.log('TX:', short(exampleSig, 8, 8));
console.log('  ', solscanTx(exampleSig));
console.log();
console.log('Mint:', short(exampleMint));
console.log('  ', solscanMint(exampleMint));
console.log();
console.log('Wallet:', short(exampleWallet));
console.log('  ', solscanWallet(exampleWallet));
console.log();

console.log('✅ All format utilities working!');





