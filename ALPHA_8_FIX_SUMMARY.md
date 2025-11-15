# Alpha Wallet 8zkJme... - Filter Configuration Applied ✅

## Problem Identified

The alpha wallet `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp` was being watched, but transactions were being filtered out with:
```
ignored tx XXX: no qualifying BUY signals
```

## Root Cause

**Default filters were too strict:**
- `DUST_SOL_SPENT=0.001` - Required alpha to spend ≥ 0.001 SOL
- `MIN_ALPHA_TOKEN_BALANCE=0.000001` - Required alpha to receive ≥ 0.000001 tokens
- `MIN_SIZE_INCREASE_RATIO=0.25` - Required 25%+ position increase
- `MIN_LIQUIDITY_USD=10000` - Required ≥ $10k liquidity

**Why this caused issues:**
- Many meme token buys are very small (< 0.001 SOL)
- Token transfers (not swaps) don't spend SOL
- Small top-ups (< 25% increase) were filtered
- Lower liquidity tokens were skipped

---

## Solution Applied

**Relaxed filter thresholds (10x more sensitive):**

```env
DUST_SOL_SPENT=0.0001                    # Was 0.001 (10x lower)
MIN_ALPHA_TOKEN_BALANCE=0.0000001        # Was 0.000001 (10x lower)
MIN_SIZE_INCREASE_RATIO=0.1              # Was 0.25 (40% lower)
MIN_LIQUIDITY_USD=5000                   # Was 10000 (2x lower)
DEBUG_TX=true                            # Enhanced logging enabled
```

**What this catches now:**
- ✅ Small buys (≥ 0.0001 SOL instead of ≥ 0.001 SOL)
- ✅ Tiny token amounts (≥ 0.0000001 instead of ≥ 0.000001)
- ✅ Small top-ups (≥ 10% increase instead of ≥ 25%)
- ✅ Lower liquidity tokens (≥ $5k instead of ≥ $10k)

---

## What to Expect

### Immediate Changes

1. **More BUY signals detected:**
   ```
   [CLASSIFY] BUY | source=rpc | Alpha: 8zkJme... | Mint: XXX | solSpent=0.0005 | ...
   ```

2. **Detailed skip reasons (if still filtered):**
   ```
   [CLASSIFY] skip tx XXX: solSpent=0.00005 < dust 0.0001 (likely transfer/other, not swap)
   [CLASSIFY] skip tx XXX: found 1 token balance(s) but none qualified (filtered by MIN_BALANCE or MIN_SIZE_INCREASE_RATIO)
   ```

3. **Telegram alerts:**
   - "Alpha touched new mint" messages
   - Buy confirmations
   - Trade executions

### Monitoring

**Watch logs for:**
```bash
pm2 logs alpha-snipes-paper | grep -E '(8zkJme|CLASSIFY.*BUY|Alpha touched)'
```

**Check Telegram:**
- You should see alerts when the alpha wallet buys new tokens
- Buy confirmations with token names and chart links

---

## If Still Not Seeing Transactions

### Step 1: Verify Wallet is Active
```bash
pm2 logs alpha-snipes-paper | grep "Watching active"
```
Should show: `👀 Watching active: 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp`

### Step 2: Check Recent Transactions
```bash
cd ~/Alpha\ Snipes
node tools/check_alpha_tx_helius.js 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp
```

### Step 3: Check Classification Logs
```bash
pm2 logs alpha-snipes-paper --lines 500 | grep -E '(CLASSIFY.*skip|CLASSIFY.*BUY|8zkJme)'
```

### Step 4: Verify Filters Applied
```bash
grep -E '(DUST_SOL_SPENT|MIN_ALPHA_TOKEN_BALANCE|MIN_SIZE_INCREASE_RATIO)' .env
```

Should show:
```
DUST_SOL_SPENT=0.0001
MIN_ALPHA_TOKEN_BALANCE=0.0000001
MIN_SIZE_INCREASE_RATIO=0.1
```

---

## If Too Many False Positives

If you see too many unwanted transactions, gradually increase thresholds:

**Option A: Slightly More Strict**
```env
DUST_SOL_SPENT=0.0005                    # 5x higher than relaxed
MIN_ALPHA_TOKEN_BALANCE=0.0000005        # 5x higher than relaxed
MIN_SIZE_INCREASE_RATIO=0.15             # 15% increase
```

**Option B: Back to Balanced**
```env
DUST_SOL_SPENT=0.0005
MIN_ALPHA_TOKEN_BALANCE=0.0000005
MIN_SIZE_INCREASE_RATIO=0.15
MIN_LIQUIDITY_USD=7500
```

**Option C: Original (Most Strict)**
```env
DUST_SOL_SPENT=0.001
MIN_ALPHA_TOKEN_BALANCE=0.000001
MIN_SIZE_INCREASE_RATIO=0.25
MIN_LIQUIDITY_USD=10000
```

---

## Next Steps

1. **Monitor for 24-48 hours** - See if legitimate buys are caught
2. **Check Telegram** - Verify alerts are appearing
3. **Review logs** - Check for false positives
4. **Adjust if needed** - Fine-tune thresholds based on results

---

## Files Created

- `ALPHA_8_CONFIG.md` - Detailed configuration guide with 3 presets
- `scripts/apply-alpha-8-filters.sh` - Script to easily apply filters
- `ALPHA_8_FIX_SUMMARY.md` - This summary document

---

## Status

✅ **Filters applied and bot restarted**
✅ **Enhanced logging enabled**
✅ **Ready to monitor alpha wallet activity**

The bot should now catch more transactions from the 8zkJme wallet. Monitor Telegram and logs to verify it's working correctly.

