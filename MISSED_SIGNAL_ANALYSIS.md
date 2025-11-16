# Why the Bot Missed the Alpha Signal

## Transaction Details
- **Alpha Wallet:** `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp`
- **Mint:** `EqgcKbiKnVFf2LcyEAFBx3okfMZUHamabWNvRa14moon` (KITTYCASH)
- **BUY Transaction Time:** ~15 hours ago
- **SELL Transaction Time:** ~15-16 minutes ago
- **BUY Age:** ~54,000 seconds (15 hours)
- **SELL Age:** ~900 seconds (15 minutes)

## Root Cause: Signal Too Old

### The Problem
The **BUY transaction** happened **~15 hours ago**, which is way beyond any reasonable signal age window:

1. **Signal Age Guard:** `MAX_SIGNAL_AGE_SEC = 180 seconds (3 minutes)`
   - The BUY transaction is **54,000 seconds old (15 hours)** → **300x older than allowed**
   - Bot will skip: `"Signal too old (54000s > 180s)"`

2. **Polling Backup:** Only checks last **30 seconds**
   - The BUY transaction is **54,000 seconds old** → **1,800x older than polling window**
   - Polling backup won't catch it

3. **Birdeye Backfill:** Now checks last **10 minutes**
   - The BUY transaction is **15 hours old** → **90x older than backfill window**
   - Even with extended backfill, it's too old

### Why This Happened

#### Scenario 1: onLogs() Missed It
- `onLogs()` subscription might have failed or been delayed
- RPC connection issues
- Transaction wasn't in the account keys (alpha used DEX aggregator)

#### Scenario 2: Transaction Was Detected But Filtered
- Transaction was detected by `onLogs()` or polling
- But it was **already too old** when processed
- Signal age guard rejected it: `"Signal too old (702s > 180s)"`

#### Scenario 3: Classification Failed
- Transaction was detected but didn't pass classification
- Alpha not in account keys + no token balance changes detected
- Or token balance changes were filtered by:
  - `MIN_ALPHA_TOKEN_BALANCE` threshold
  - `MIN_SIZE_INCREASE_RATIO` threshold

## Current Bot Configuration

```typescript
MAX_SIGNAL_AGE_SEC = 180  // 3 minutes
Polling backup maxAge = 30_000  // 30 seconds
Polling interval = 15_000  // 15 seconds
```

## Why These Limits Exist

### Signal Age Guard (180s)
- **Purpose:** Only trade on fresh signals
- **Reason:** Old signals mean we're too late (price already moved)
- **Trade-off:** Misses transactions if bot was down or RPC delayed

### Polling Backup (30s)
- **Purpose:** Catch missed `onLogs()` transactions quickly
- **Reason:** Only process very recent transactions
- **Trade-off:** Can't catch transactions older than 30 seconds

## Solutions

### Option 1: Increase Signal Age Window (Quick Fix)
```typescript
MAX_SIGNAL_AGE_SEC = 600  // 10 minutes instead of 3
```
**Pros:** Catches more transactions
**Cons:** May enter at worse prices (signal is stale)

### Option 2: Increase Polling Backup Window (Better)
```typescript
maxAge = 300_000  // 5 minutes instead of 30 seconds
```
**Pros:** Catches more missed transactions
**Cons:** May process duplicate/old transactions

### Option 3: Startup Backfill (Best)
- On bot startup, scan last 5-10 minutes of alpha transactions
- Process any missed BUY signals
- This catches transactions missed while bot was down

### Option 4: Birdeye Backfill (Best for Reliability)
- Use Birdeye API to backfill missed transactions
- Check last 10 minutes of alpha trades on startup
- Process any BUY signals that weren't caught by RPC

## Recommended Fix

**Implement Option 3 + Option 4:**
1. **Startup Backfill:** Scan last 5 minutes on bot startup
2. **Birdeye Backfill:** Use Birdeye to validate and backfill missed signals
3. **Keep current limits:** Don't increase signal age (keeps entries fresh)

This way:
- ✅ Catches transactions missed while bot was down
- ✅ Catches transactions missed by `onLogs()` delays
- ✅ Still only trades on relatively fresh signals (< 3 minutes)
- ✅ Uses Birdeye as validation layer

## Immediate Action

For this specific transaction:
- The **BUY was 15 hours ago** - way too old to trade now
- The **SELLs were 15-16 minutes ago** - also too old (5x over the 3-minute limit)
- Price has likely moved significantly since the BUY
- Alpha already sold their position (4 sells totaling ~$304K)
- **Not worth entering at this point** - we're way too late

### Why This Happened

**Most Likely Scenario:**
1. Bot wasn't running 15 hours ago when the BUY happened
2. OR bot was running but had a detection/classification failure
3. OR alpha wallet wasn't in the active list 15 hours ago

**The SELLs (15-16 minutes ago):**
- These are SELL signals, not BUY signals
- Bot only copies BUY signals, not SELLs
- So even if detected, bot wouldn't act on them

**But we should fix the system to catch future BUY transactions!**

---

**Last Updated:** 2025-11-16

