#!/usr/bin/env node
// Test if price guard is blocking entries
import 'dotenv/config';

const ALPHA_ENTRY_PRICE = parseFloat(process.argv[2]); // e.g., 0.000001
const CURRENT_PRICE = parseFloat(process.argv[3]); // e.g., 0.000005
const MAX_MULTIPLIER = parseFloat(process.env.MAX_ALPHA_ENTRY_MULTIPLIER || '2');

if (!ALPHA_ENTRY_PRICE || !CURRENT_PRICE) {
  console.error('Usage: node tools/test_price_guard.mjs <alpha_entry_price> <current_price>');
  console.error('Example: node tools/test_price_guard.mjs 0.000001 0.000005');
  process.exit(1);
}

console.log('\n🔍 Testing Price Guard\n');
console.log(`Alpha Entry Price: ${ALPHA_ENTRY_PRICE.toExponential(4)} SOL/token`);
console.log(`Current Price: ${CURRENT_PRICE.toExponential(4)} SOL/token`);
console.log(`MAX_ALPHA_ENTRY_MULTIPLIER: ${MAX_MULTIPLIER}x\n`);

const ratio = CURRENT_PRICE / ALPHA_ENTRY_PRICE;
const pass = ratio <= MAX_MULTIPLIER;

console.log('📊 Calculation:');
console.log(`  Ratio: ${ratio.toFixed(2)}x (current / alpha entry)`);
console.log(`  Max Allowed: ${MAX_MULTIPLIER}x`);
console.log(`  Result: ${pass ? '✅ PASS' : '❌ FAIL'}\n`);

if (!pass) {
  console.log('❌ BLOCKED by price guard!');
  console.log(`   Current price (${CURRENT_PRICE.toExponential(4)}) is ${ratio.toFixed(2)}x higher than alpha entry`);
  console.log(`   Maximum allowed: ${MAX_MULTIPLIER}x\n`);
  console.log('💡 This means:');
  console.log('   - Alpha entered at a very early/low price');
  console.log('   - By the time bot detected the signal, price moved up significantly');
  console.log('   - Bot rejects to avoid entering at a much worse price\n');
  console.log('🔧 Solutions:');
  console.log(`   1. Increase MAX_ALPHA_ENTRY_MULTIPLIER to ${Math.ceil(ratio)}x or higher`);
  console.log('   2. Improve detection speed (reduce signal age)');
  console.log('   3. Accept higher entry prices (higher risk, but may catch more opportunities)\n');
} else {
  console.log('✅ Price guard would PASS');
  console.log(`   Current price is ${ratio.toFixed(2)}x alpha entry (within ${MAX_MULTIPLIER}x limit)\n`);
}

// Show examples
console.log('📈 Example Scenarios:\n');
const examples = [
  { alpha: 0.000001, current: 0.000002, desc: 'Price doubled (2x)' },
  { alpha: 0.000001, current: 0.000003, desc: 'Price tripled (3x)' },
  { alpha: 0.000001, current: 0.000005, desc: 'Price 5x' },
  { alpha: 0.000001, current: 0.000010, desc: 'Price 10x' },
];

for (const ex of examples) {
  const exRatio = ex.current / ex.alpha;
  const exPass = exRatio <= MAX_MULTIPLIER;
  console.log(`  ${ex.desc}:`);
  console.log(`    Alpha: ${ex.alpha.toExponential(4)}, Current: ${ex.current.toExponential(4)}`);
  console.log(`    Ratio: ${exRatio.toFixed(1)}x → ${exPass ? '✅ PASS' : '❌ BLOCKED'}\n`);
}

