# Optimal Filter Configuration for Alpha Wallet (8zkJme...)

## Problem

The alpha wallet `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp` is being watched, but transactions are being filtered out with:
```
ignored tx XXX: no qualifying BUY signals
```

## Root Cause

The current filters are **too strict** for this wallet's trading patterns:
- Many transactions are classified as "OTHER" (not BUY/SELL)
- Small buys (< 0.001 SOL) are filtered by DUST threshold
- Token transfers (not swaps) are filtered
- Small position increases (< 25%) are filtered

## Recommended Configuration

### Option 1: Relaxed Filters (Recommended)

**Best for:** Catching more transactions, including small buys and transfers

```env
# === Alpha Signal Discipline (RELAXED for 8zkJme wallet) ===
DUST_SOL_SPENT=0.0001                    # Lowered from 0.001 (10x more sensitive)
MIN_ALPHA_TOKEN_BALANCE=0.0000001        # Lowered from 0.000001 (10x more sensitive)
MIN_SIZE_INCREASE_RATIO=0.1              # Lowered from 0.25 (catches 10%+ increases)
MAX_SIGNAL_AGE_SEC=60                    # Keep at 60 seconds
MAX_ALPHA_ENTRY_MULTIPLIER=2             # Keep at 2x
MIN_LIQUIDITY_USD=5000                   # Lowered from 10000 (catch smaller tokens)
```

**What this catches:**
- ✅ Small buys (≥ 0.0001 SOL instead of ≥ 0.001 SOL)
- ✅ Tiny token amounts (≥ 0.0000001 instead of ≥ 0.000001)
- ✅ Small top-ups (≥ 10% increase instead of ≥ 25%)
- ✅ Lower liquidity tokens (≥ $5k instead of ≥ $10k)

**Trade-off:**
- ⚠️ May catch more false positives (transfers, spam)
- ⚠️ Need to monitor for unwanted transactions

---

### Option 2: Very Relaxed Filters (Maximum Catch Rate)

**Best for:** Catching everything, including transfers and airdrops

```env
# === Alpha Signal Discipline (VERY RELAXED) ===
DUST_SOL_SPENT=0.00001                   # Very low threshold
MIN_ALPHA_TOKEN_BALANCE=0.00000001       # Very low threshold
MIN_SIZE_INCREASE_RATIO=0.05             # Catch 5%+ increases
MAX_SIGNAL_AGE_SEC=120                   # Longer window (2 minutes)
MAX_ALPHA_ENTRY_MULTIPLIER=3             # Allow 3x entry price
MIN_LIQUIDITY_USD=1000                   # Very low liquidity threshold
```

**What this catches:**
- ✅ Very small buys (≥ 0.00001 SOL)
- ✅ Tiny token amounts (≥ 0.00000001)
- ✅ Minimal top-ups (≥ 5% increase)
- ✅ Very low liquidity tokens (≥ $1k)
- ✅ Longer time window (2 minutes)

**Trade-off:**
- ⚠️ High false positive rate
- ⚠️ May catch unwanted transactions
- ⚠️ Need active monitoring

---

### Option 3: Balanced Filters (Recommended Starting Point)

**Best for:** Balance between catch rate and false positives

```env
# === Alpha Signal Discipline (BALANCED) ===
DUST_SOL_SPENT=0.0005                    # 2x lower than default
MIN_ALPHA_TOKEN_BALANCE=0.0000005        # 2x lower than default
MIN_SIZE_INCREASE_RATIO=0.15             # 15% increase threshold
MAX_SIGNAL_AGE_SEC=60                    # Keep at 60 seconds
MAX_ALPHA_ENTRY_MULTIPLIER=2             # Keep at 2x
MIN_LIQUIDITY_USD=7500                   # Slightly lower
```

**What this catches:**
- ✅ Medium-sized buys (≥ 0.0005 SOL)
- ✅ Reasonable token amounts
- ✅ Moderate top-ups (≥ 15% increase)
- ✅ Medium liquidity tokens (≥ $7.5k)

**Trade-off:**
- ✅ Good balance between catch rate and false positives
- ✅ Recommended starting point

---

## How to Apply

### Step 1: Update .env File

```bash
# On VM
cd ~/Alpha\ Snipes
nano .env

# Add or update these lines:
DUST_SOL_SPENT=0.0001
MIN_ALPHA_TOKEN_BALANCE=0.0000001
MIN_SIZE_INCREASE_RATIO=0.1
MIN_LIQUIDITY_USD=5000
```

### Step 2: Enable Debug Logging

```bash
# Add to .env
DEBUG_TX=true
DEBUG_TO_TELEGRAM=false  # Set to true if you want debug logs in Telegram
```

### Step 3: Restart Bot

```bash
pm2 restart alpha-snipes-paper --update-env
```

### Step 4: Monitor Logs

```bash
# Watch for classification details
pm2 logs alpha-snipes-paper --lines 100 | grep -E '(CLASSIFY|8zkJme)'

# Or watch all logs
pm2 logs alpha-snipes-paper
```

---

## Expected Results

After applying relaxed filters, you should see:

1. **More BUY signals detected:**
   ```
   [CLASSIFY] BUY | source=rpc | Alpha: 8zkJme... | Mint: XXX | solSpent=0.0005 | ...
   ```

2. **Detailed skip reasons:**
   ```
   [CLASSIFY] skip tx XXX: solSpent=0.00005 < dust 0.0001 (likely transfer/other, not swap)
   [CLASSIFY] skip tx XXX: found 1 token balance(s) but none qualified (filtered by MIN_BALANCE or MIN_SIZE_INCREASE_RATIO)
   ```

3. **Telegram alerts:**
   - "Alpha touched new mint" messages
   - Buy confirmations
   - Trade executions

---

## Troubleshooting

### If Still Not Seeing Transactions

1. **Check if wallet is active:**
   ```bash
   pm2 logs alpha-snipes-paper | grep "Watching active"
   ```
   Should show: `👀 Watching active: 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp`

2. **Check recent transactions:**
   ```bash
   cd ~/Alpha\ Snipes
   node tools/check_alpha_tx_helius.js 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp
   ```

3. **Check classification logs:**
   ```bash
   pm2 logs alpha-snipes-paper --lines 500 | grep -E '(CLASSIFY.*skip|CLASSIFY.*BUY|8zkJme)'
   ```

4. **Verify DEBUG_TX is enabled:**
   ```bash
   grep DEBUG_TX .env
   ```

### If Too Many False Positives

Gradually increase thresholds:
- `DUST_SOL_SPENT=0.0005` (from 0.0001)
- `MIN_ALPHA_TOKEN_BALANCE=0.0000005` (from 0.0000001)
- `MIN_SIZE_INCREASE_RATIO=0.15` (from 0.1)

---

## Recommended Starting Configuration

**For the 8zkJme wallet, start with Option 1 (Relaxed Filters):**

```env
DUST_SOL_SPENT=0.0001
MIN_ALPHA_TOKEN_BALANCE=0.0000001
MIN_SIZE_INCREASE_RATIO=0.1
MIN_LIQUIDITY_USD=5000
DEBUG_TX=true
```

This should catch most legitimate buys while filtering out obvious spam. Monitor for 24-48 hours and adjust based on results.

