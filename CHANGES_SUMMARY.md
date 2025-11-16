# Changes Summary - Birdeye Backfill & GMGN.ai Research

## ✅ Changes Implemented

### 1. Increased Birdeye Backfill Window
- **Before:** 10 minutes
- **After:** 30 minutes
- **Location:** `index.ts` line 3401
- **Impact:** Bot will now catch missed transactions from the last 30 minutes on startup

### 2. GMGN.ai API Research
- **Finding:** GMGN.ai does NOT have a public API
- **Conclusion:** Continue using Birdeye + RPC + DexScreener
- **Documentation:** See `GMGN_API_RESEARCH.md`

## What This Means

### For Missed Transactions
- ✅ **Better detection:** Bot will catch transactions from last 30 minutes (was 10 minutes)
- ✅ **Better recovery:** If bot was down for 15-20 minutes, it can still catch trades
- ⚠️ **Signal age guard still applies:** Transactions > 3 minutes old will still be skipped (by design)

### Example: KITTYCASH Transaction
- **Transaction age:** 19-20 minutes ago
- **Old backfill window:** 10 minutes → ❌ Would miss it
- **New backfill window:** 30 minutes → ✅ Will detect it
- **Signal age guard:** 3 minutes → ⚠️ Will still skip it (too old to trade)

## Why Keep Signal Age Guard at 3 Minutes?

Even though we detect 30-minute-old transactions, we still skip trading on them because:
1. **Price has moved:** 20-minute-old signal means price likely changed significantly
2. **Alpha may have sold:** Alpha already sold their position (we saw 4 sells)
3. **Risk management:** Trading on stale signals = entering at worse prices

## Current Data Sources

1. **Solana RPC (Primary)**
   - Real-time transaction monitoring via `onLogs()`
   - Polling backup every 15 seconds (last 30 seconds)

2. **Birdeye API (Secondary)**
   - Startup backfill: Last 30 minutes
   - Validation: Cross-check RPC signals
   - Requires: Paid plan ($99/mo Starter or higher)

3. **DexScreener API (Price/Liquidity)**
   - Token price and liquidity data
   - Free tier available

4. **GMGN.ai (Manual Research Only)**
   - Web interface for wallet analysis
   - No API available
   - Use for manual research, not automation

## Next Steps

1. ✅ **Monitor bot logs** - Check if 30-minute backfill catches more transactions
2. ✅ **Keep signal age guard at 3 minutes** - Only trade on fresh signals
3. ⚠️ **Consider periodic Birdeye checks** - Not just on startup, but every 5-10 minutes

---

**Last Updated:** 2025-11-16

