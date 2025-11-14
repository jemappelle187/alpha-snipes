// tools/test_sol_price.ts
// Quick test for SOL/USD price fetching

import 'dotenv/config';
import { getSolUsd } from '../lib/sol_price.js';

(async () => {
  console.log('🔍 Fetching SOL/USD price...\n');
  
  const price1 = await getSolUsd();
  console.log(`💰 SOL price: $${price1.toFixed(2)}`);
  
  // Test caching (should return instantly)
  const start = Date.now();
  const price2 = await getSolUsd();
  const elapsed = Date.now() - start;
  console.log(`📦 Cached price: $${price2.toFixed(2)} (${elapsed}ms)`);
  
  if (price1 === price2 && elapsed < 10) {
    console.log('✅ Cache working correctly!');
  }
})();





