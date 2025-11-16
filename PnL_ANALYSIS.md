# PnL Analysis: Critical Issues Identified

## Current Statistics (from Alpha Filter Bot)

- **Buys:** 128
- **Sells:** 11
- **Win Rate:** 9% (extremely low)
- **Realized PnL:** -$8.84 (-0.06 SOL)
- **Open Positions:** ~117 (128 - 11 = 117)

## Critical Problems

### 1. **Massive Buy/Sell Imbalance**

**Problem:** 128 buys but only 11 sells means **117 positions are still open**.

**Why this is bad:**
- Most positions are not being closed
- Exit strategies (TP, trailing stop, max loss) aren't working
- Positions are likely stuck or dead tokens

**Expected behavior:**
- Buys and sells should be roughly equal (or more sells if positions are being closed)
- If bot is working correctly, most positions should exit within minutes/hours

### 2. **Extremely Low Win Rate (9%)**

**Problem:** Only 1 out of 11 sells was profitable.

**Why this is bad:**
- 91% of closed positions are losses
- Bot is entering bad trades
- Exit strategies are not protecting capital

**Expected behavior:**
- Win rate should be 30-50%+ for a good sniping bot
- Early exits should prevent large losses

### 3. **Negative Realized PnL**

**Problem:** -$8.84 realized loss, but this doesn't include the 117 open positions.

**Why this is bad:**
- If those 117 positions are all down (likely), unrealized losses could be massive
- Bot is holding onto losing positions instead of cutting losses

## Root Causes

### 1. **Exit Strategies Not Working**

Based on the code, the bot has:
- ✅ Max loss protection (-10%)
- ✅ Early TP (+30%)
- ✅ Trailing stop (20%)
- ✅ Liquidity drop detection
- ✅ Crashed token detection

**But:** These aren't triggering because:
- Jupiter API rate limits (429 errors) preventing exits
- Positions stuck in retry loops
- Price fetching failures preventing exit calculations

### 2. **Rate Limit Issues**

From logs, we see:
- "Max loss exit failed" messages
- "429/400 backoff" errors
- Positions can't be sold due to Jupiter rate limits

**Impact:** Positions that should be closed are stuck open.

### 3. **Dead Token Problem**

Many positions are likely:
- Dead tokens (no liquidity)
- Can't be sold (Jupiter can't find route)
- Stuck in "max loss" state but can't exit

## Recommendations

### Immediate Actions

1. **Force Close Stuck Positions**
   ```bash
   # Check open positions
   /open
   
   # Force exit dead positions
   /force_exit <mint>
   ```

2. **Review Exit Strategy Settings**
   - Max loss might be too tight (-10%)
   - Early TP might be too high (+30%)
   - Trailing stop might not be triggering

3. **Check Jupiter Rate Limits**
   - Bot is hitting rate limits too frequently
   - Need to reduce quote requests
   - Consider using DexScreener for price checks instead

### Long-term Fixes

1. **Improve Exit Reliability**
   - Add DEX fallback for exits (Orca, Raydium)
   - Better rate limit handling
   - Dead token detection before buying

2. **Tighten Entry Criteria**
   - 9% win rate suggests bad entries
   - Need stricter filters
   - Better alpha signal validation

3. **Position Management**
   - Auto-close positions older than 24h
   - Force exit if price unavailable for >10 minutes
   - Better dead token detection

## Expected vs Actual

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Buy/Sell Ratio | ~1:1 | 128:11 | ❌ Critical |
| Win Rate | 30-50% | 9% | ❌ Critical |
| Open Positions | <10 | 117 | ❌ Critical |
| Realized PnL | Positive | -$8.84 | ❌ Bad |

## Conclusion

The bot is **buying too much and selling too little**. This is causing:
- Massive unrealized losses (117 open positions)
- Low win rate (9%)
- Negative realized PnL

**Primary issue:** Exit strategies aren't working due to Jupiter rate limits and dead tokens.

**Action required:** Fix exit reliability and force close stuck positions.

