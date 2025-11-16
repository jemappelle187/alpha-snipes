# BUY Detection Issues - Analysis

## Problem Summary

Alpha wallet `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp` shows **"Last Seen: Never"** despite being active and making transactions.

## Current Detection Flow

1. **onLogs() subscription** - Real-time monitoring
2. **Polling backup** - Every 15s, checks last 30s
3. **Birdeye backfill** - On startup, checks last 30 minutes

## Issues Found

### Issue 1: Alpha Not in Account Keys
- **Symptom:** Alpha wallet not in transaction account keys
- **Cause:** DEX aggregator swaps (Jupiter, etc.) - alpha is not a direct signer
- **Impact:** Can't detect SOL spent directly
- **Current Fix:** Bot checks token balances instead, but may miss some transactions

### Issue 2: Token Balance Detection
- **Symptom:** Transaction shows BUY but token balance detection fails
- **Possible Causes:**
  1. Owner field format mismatch
  2. Token balance parsing issues
  3. Filters too strict (MIN_ALPHA_TOKEN_BALANCE, MIN_SIZE_INCREASE_RATIO)

### Issue 3: Signal Age Guard
- **Symptom:** Transactions detected but too old (> 3 minutes)
- **Impact:** Valid BUY signals rejected
- **Current:** MAX_SIGNAL_AGE_SEC = 180s (3 minutes)

### Issue 4: Polling Backup Window Too Short
- **Symptom:** Only checks last 30 seconds
- **Impact:** Misses transactions older than 30 seconds
- **Current:** maxAge = 30_000 (30 seconds)

## Test Results

### Transaction: `XCAsxkurtc1gLuuGgLjxtFFKeCAPDqfRcDoTJdXsoKJ9fyEQVdgdnvmCtPKLwrUv4NRsCK8tvPGJY7fVp4Vy5L5`
- **Alpha in account keys:** ❌ No
- **Token balance change:** DECREASED (SELL, not BUY)
- **Signal age:** 2615s (43.6 minutes) - too old

### Transaction: `2NuQ3ixCAADasmSVVo6aZMDb22pucYEycdExNcXJQ2y2TN7SaMb86vNT4R9XKRuuCwD1iAEpDwMowgENdn8zR8va`
- **Alpha in account keys:** ❌ No  
- **Token balance change:** Need to verify
- **Signal age:** 2644s (44 minutes) - too old

## Root Causes

1. **Transactions are too old** - Happened 40+ minutes ago, beyond 3-minute window
2. **Alpha not in account keys** - DEX aggregator swaps don't include alpha as signer
3. **Token balance detection may be failing** - Need to verify owner field matching

## Fixes Needed

### Priority 1: Improve Detection for Non-Account-Key Transactions
- ✅ Already checks token balances (good)
- ⚠️ Need to verify owner field matching works correctly
- ⚠️ May need to normalize owner addresses

### Priority 2: Increase Polling Backup Window
- Current: 30 seconds
- Recommended: 5 minutes (300 seconds)
- This will catch more missed transactions

### Priority 3: Relax Filters (For Testing)
- `MIN_LIQUIDITY_USD`: $10,000 → $1,000
- `DUST_SOL_SPENT`: 0.001 → 0.0001 SOL
- `MIN_ALPHA_TOKEN_BALANCE`: 1000 → 100 tokens
- `MAX_SIGNAL_AGE_SEC`: 180s → 300s (5 minutes) for testing

### Priority 4: Better Logging
- Log all alpha transactions (BUY and SELL)
- Log why transactions are filtered
- Track detection success rate

---

**Next Steps:** Test with a recent transaction (< 3 minutes old) to see if detection works.

