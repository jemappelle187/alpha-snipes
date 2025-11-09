// tools/dedupe_registry.ts
// One-shot cleanup utility to dedupe and fix the alpha registry
import { readRegistry } from '../alpha/alpha_registry.js';

console.log('🧹 Running registry cleanup...\n');

const before = JSON.stringify(readRegistry(), null, 2);
console.log('Before:');
console.log(before);
console.log('\n');

// readRegistry() has self-heal logic that will automatically:
// - Dedupe active list
// - Dedupe candidates list
// - Remove candidates that are also in active
// - Persist atomically if any fixes were made

const after = readRegistry();
console.log('After self-heal:');
console.log(JSON.stringify(after, null, 2));
console.log('\n');

if (before === JSON.stringify(after, null, 2)) {
  console.log('✅ Registry was already clean - no changes needed');
} else {
  console.log('✅ Registry cleaned and saved');
  console.log('\nChanges made:');
  console.log(`  Active: ${after.active.length} wallets`);
  console.log(`  Candidates: ${after.candidates.length} wallets`);
  console.log(`  Scores: ${Object.keys(after.scores).length} entries`);
}

