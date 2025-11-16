# What Increasing Birdeye Backfill Window Changes

## Current Configuration
- **Backfill Window:** 10 minutes (600 seconds)
- **When it runs:** On bot startup only
- **What it does:** Fetches missed BUY trades from Birdeye API for the last 10 minutes

## What Would Change if We Increase It to 20-30 Minutes?

### ✅ Benefits

1. **Catches More Missed Transactions**
   - Current: Only catches transactions from last 10 minutes
   - With 20-30 min: Catches transactions from last 20-30 minutes
   - **Example:** The KITTYCASH BUY (19-20 min ago) would be caught with a 20-30 min window

2. **Better Recovery After Downtime**
   - If bot restarts after being down for 15-20 minutes
   - Can still catch alpha trades that happened during downtime
   - Reduces missed opportunities

3. **Compensates for RPC Delays**
   - If `onLogs()` subscription is delayed or fails
   - Birdeye backfill can catch transactions that RPC missed
   - Acts as a safety net

### ⚠️ Trade-offs

1. **Signal Age Guard Still Applies**
   - Even if Birdeye finds a 20-minute-old transaction
   - Bot will still check: `signalAgeSec > MAX_SIGNAL_AGE_SEC (180s)`
   - **Result:** Transaction will be skipped as "too old"
   - **This is intentional** - we don't want to trade on stale signals

2. **More API Calls**
   - Longer window = more trades to fetch
   - Slightly higher API usage (but still minimal - only on startup)

3. **Processing Time**
   - Longer window = more trades to process
   - Startup might take a few seconds longer
   - But this is acceptable (only happens on startup)

## The Real Issue

**The problem isn't just the backfill window - it's the signal age guard!**

Even if we increase the backfill window to 30 minutes:
- ✅ Birdeye will find the 19-minute-old transaction
- ❌ But the bot will still skip it because `19 min > 3 min` (signal age guard)

## What We Should Actually Do

### Option 1: Increase Backfill Window + Keep Signal Age Guard (Recommended)
- Increase backfill to 20-30 minutes
- Keep signal age guard at 3 minutes
- **Result:** We'll detect more transactions, but only trade on fresh ones (< 3 min old)
- **Use case:** Better for monitoring and alerting, but won't trade on old signals

### Option 2: Increase Both (Not Recommended)
- Increase backfill to 20-30 minutes
- Increase signal age guard to 10-15 minutes
- **Result:** Will trade on older signals (10-15 min old)
- **Risk:** Entering at worse prices (signal is stale)

### Option 3: Periodic Birdeye Checks (Best Long-term)
- Keep backfill at 10-15 minutes
- Add periodic Birdeye checks every 5 minutes (not just on startup)
- **Result:** Catches missed transactions more frequently
- **Benefit:** Better real-time detection without trading on stale signals

## Recommendation

**Increase backfill window to 20-30 minutes** for better detection, but **keep signal age guard at 3 minutes** to only trade on fresh signals.

This way:
- ✅ We detect more missed transactions (better monitoring)
- ✅ We still only trade on fresh signals (< 3 min old)
- ✅ Better recovery after downtime
- ✅ Better compensation for RPC delays

---

**Last Updated:** 2025-11-16

