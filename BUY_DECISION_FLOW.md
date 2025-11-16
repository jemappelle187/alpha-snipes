# Bot Buy Decision Flow - Complete Analysis

## Overview

This document explains **exactly** how the bot decides to buy a token based on alpha wallet activity.

---

## Step-by-Step Buy Decision Process

### Step 1: Alpha Wallet Monitoring ✅

**Requirement:** Alpha wallet must be in `ACTIVE_ALPHAS` list

**Monitoring Methods:**
1. **onLogs() subscription** - Real-time transaction monitoring (primary)
2. **Polling backup** - Every 15 seconds, checks last 30 seconds
3. **Birdeye backfill** - On startup, checks last 30 minutes

**Current Status for `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp`:**
- ✅ In active list
- ❌ Last Seen: Never (no signals detected)

---

### Step 2: Transaction Detection 🔍

**When alpha wallet makes a transaction:**

1. **Bot receives transaction via `onLogs()` or polling**
2. **Calls `handleAlphaTransaction(sig, alpha, label)`**
3. **Fetches parsed transaction data**
4. **Calls `classifyAlphaSignals(tx, alpha, sig)`**

---

### Step 3: Signal Classification 📊

**Function:** `classifyAlphaSignals()`

#### Check 1: Alpha in Account Keys?

**If YES (Alpha is direct signer):**
- ✅ Check SOL balance change: `preLamports - postLamports`
- ✅ Calculate `solSpent = (preLamports - postLamports) / 1e9`
- ✅ Check if `solSpent >= DUST_SOL_SPENT` (0.001 SOL)
- ❌ If `solSpent < 0.001 SOL` → **REJECT** (too small, likely transfer)

**If NO (Alpha not in account keys - DEX aggregator):**
- ⚠️ Can't check SOL spent directly
- ✅ Proceed to token balance checking
- ✅ Birdeye will provide SOL spent later (if API key configured)

#### Check 2: Token Balance Changes

**For each token in post-balances:**
1. Find pre-balance for same mint
2. Calculate `delta = postAmount - preAmount`
3. **Requirement:** `delta > 0` (token balance increased)
4. **Requirement:** `postAmount >= MIN_ALPHA_TOKEN_BALANCE` (1000 tokens)
5. **If preAmount > 0:** Check `delta / preAmount >= MIN_SIZE_INCREASE_RATIO` (0.1x)

**If all pass:** Create `AlphaSignal` object

---

### Step 4: Execute Copy Trade 🚀

**Function:** `executeCopyTradeFromSignal()`

#### Guard 1: Time Window ⏰

**Check:** `signal.signalAgeSec <= MAX_SIGNAL_AGE_SEC`

- **Current:** `MAX_SIGNAL_AGE_SEC = 180` (3 minutes)
- **If age > 180s:** ❌ **REJECT** - "Signal too old"
- **If age <= 180s:** ✅ **PASS**

#### Guard 2: Liquidity 💧

**Check:** `liquidityUsd >= MIN_LIQUIDITY_USD`

- **Current:** `MIN_LIQUIDITY_USD = 10000` ($10,000)
- **If liquidity < $10,000:** ❌ **REJECT** - "Liquidity too low"
- **If liquidity >= $10,000:** ✅ **PASS**
- **Note:** If rejected, token added to watchlist (if enabled)

#### Guard 3: Rug Checks 🛡️

**Checks:**
- ✅ Mint authority revoked (if `REQUIRE_AUTH_REVOKED = true`)
- ✅ Freeze authority revoked
- ✅ Tax rate < `MAX_TAX_BPS` (default: 500 bps = 5%)
- ✅ Price impact < `MAX_PRICE_IMPACT_BPS` (default: 5000 bps = 50%)
- ✅ Valid swap route exists

**If any fail:** ❌ **REJECT** - Reason provided (e.g., "authority not revoked")

#### Guard 4: Price Guard 💰 (DISABLED)

**Status:** ✅ **REMOVED** - Bot enters regardless of price vs alpha entry

**Previous behavior (now disabled):**
- **Was:** `MAX_ALPHA_ENTRY_MULTIPLIER = 2` (2x limit)
- **If price > 2x alpha entry:** ❌ **REJECT** - "Price too high vs alpha entry"

**Current behavior:**
- ✅ **No price limit** - Bot will enter even if price is 5x, 10x, or higher than alpha entry
- ✅ **Logs ratio for monitoring** but doesn't block entries
- ✅ **Allows catching tokens** when alpha enters very early and price moves quickly

**Example:**
- Alpha enters at: 0.000001 SOL/token
- Bot detects signal, current price: 0.000005 SOL/token
- Ratio: 5x → ✅ **ENTERS** (no limit blocking)

**Note:** If alpha entry price unavailable, bot proceeds without price comparison

#### Guard 5: Position Sizing 📏

**Function:** `computePositionSize()`

**Factors:**
- Base buy size: `BUY_SOL` (0.01 SOL)
- Liquidity: Higher liquidity = larger size
- Signal age: Older signals = smaller size
- Alpha conviction: Based on alpha's SOL spent

**Output:** Final buy size (between `MIN_BUY_SOL` and `MAX_BUY_SOL`)

---

### Step 5: Execute Buy 💸

**If all guards pass:**

1. **Execute swap:** `swapSOLforToken(mint, buySol)`
2. **Calculate entry price:** `buySol / tokensReceived`
3. **Create position:** Store in `openPositions`
4. **Start exit manager:** Monitor for +50% gain or max loss
5. **Send notification:** Telegram alert with entry details

---

## Complete Decision Tree

```
Alpha Transaction Detected
    ↓
Is alpha in ACTIVE_ALPHAS? → NO → ❌ Ignore
    ↓ YES
Parse Transaction
    ↓
Is alpha in account keys?
    ├─ YES → Check SOL spent >= 0.001 SOL
    └─ NO → Check token balances
    ↓
Token balance increased?
    ├─ NO → ❌ Reject (SELL or no change)
    └─ YES → Check postAmount >= 1000 tokens
    ↓
Signal age <= 180s?
    ├─ NO → ❌ Reject ("Signal too old")
    └─ YES → Check liquidity >= $10,000
    ↓
Liquidity >= $10,000?
    ├─ NO → ❌ Reject ("Liquidity too low") + Add to watchlist
    └─ YES → Run rug checks
    ↓
Rug checks pass?
    ├─ NO → ❌ Reject (reason: authority, tax, impact, etc.)
    └─ YES → Check price <= 2x alpha entry
    ↓
Price <= 2x alpha entry?
    ├─ NO → ❌ Reject ("Price too high")
    └─ YES → Calculate position size
    ↓
Execute swap
    ↓
✅ BUY SUCCESSFUL
```

---

## Current Configuration Values

| Setting | Value | Purpose |
|---------|-------|---------|
| `DUST_SOL_SPENT` | 0.001 SOL | Minimum SOL spent to trigger BUY |
| `MIN_ALPHA_TOKEN_BALANCE` | 1000 tokens | Minimum token balance after BUY |
| `MIN_SIZE_INCREASE_RATIO` | 0.1x | Minimum size increase if existing position |
| `MAX_SIGNAL_AGE_SEC` | 180s (3 min) | Maximum signal age to trade |
| `MIN_LIQUIDITY_USD` | $10,000 | Minimum liquidity to trade |
| `MAX_ALPHA_ENTRY_MULTIPLIER` | 2x | Max price vs alpha entry |
| `BUY_SOL` | 0.01 SOL | Base buy size |
| `REQUIRE_AUTH_REVOKED` | true | Require mint authority revoked |
| `MAX_TAX_BPS` | 500 (5%) | Maximum tax rate |
| `MAX_PRICE_IMPACT_BPS` | 5000 (50%) | Maximum price impact |

---

## Why BUY Detection Might Fail

### Reason 1: Signal Too Old
- **Symptom:** "Signal too old (XXXs > 180s)"
- **Cause:** Transaction detected after 3 minutes
- **Fix:** Increase `MAX_SIGNAL_AGE_SEC` or improve detection speed

### Reason 2: Liquidity Too Low
- **Symptom:** "Liquidity $X < $10,000"
- **Cause:** Token doesn't have enough liquidity
- **Fix:** Lower `MIN_LIQUIDITY_USD` or use watchlist

### Reason 3: Rug Checks Failed
- **Symptom:** "authority not revoked", "tax too high", etc.
- **Cause:** Token fails safety checks
- **Fix:** This is intentional - protects from rugs

### Reason 4: Price Too High
- **Symptom:** "Price X.XXx higher than alpha entry"
- **Cause:** Price moved up > 2x since alpha bought
- **Fix:** Increase `MAX_ALPHA_ENTRY_MULTIPLIER` or improve detection speed

### Reason 5: Alpha Not Detected
- **Symptom:** "Last Seen: Never"
- **Cause:** Transaction not detected by onLogs() or polling
- **Fix:** Improve detection reliability, check RPC connection

### Reason 6: Token Balance Filter
- **Symptom:** "post-balance < 1000 tokens"
- **Cause:** Token amount too small
- **Fix:** Lower `MIN_ALPHA_TOKEN_BALANCE`

---

## Testing the Decision Flow

Use the test tool to verify each step:

```bash
node tools/test_buy_detection.mjs <tx_signature> <alpha_wallet>
```

This will show:
- ✅/❌ Each check in the decision flow
- Exact values and thresholds
- Why a transaction would be accepted or rejected

---

**Last Updated:** 2025-11-16

