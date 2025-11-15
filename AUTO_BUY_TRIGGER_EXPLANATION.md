# Auto-Buy Trigger Explanation

## Question: Will All Wallets Added Via Telegram Trigger Auto-Buys?

**Short Answer:** ❌ **NO** - Not immediately. Wallets need to be **promoted to ACTIVE** first, and then their BUY signals must pass all guards.

---

## Wallet Addition Flow

### Step 1: Add Wallet via Telegram

**Command:** `/alpha_add <wallet>`

**What Happens:**
- Wallet is added as a **CANDIDATE**
- Bot starts monitoring the wallet
- Wallet's BUY signals are **detected and scored**
- **NO auto-buy** - Only alerts are sent

**Example:**
```
/alpha_add 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp
→ 👀 Candidate added: 8zkJme...
→ Bot monitors and scores, but doesn't auto-buy
```

### Step 2: Auto-Promotion to ACTIVE

**Requirements:**
- **2 BUY signals** within **24 hours** (`PROMOTION_THRESHOLD = 2`)
- Signals must pass classification filters
- Wallet is automatically promoted to ACTIVE

**What Happens:**
- Bot sends alert: `✅ AUTO-PROMOTED to active!`
- Wallet moves from `CANDIDATE_ALPHAS` to `ACTIVE_ALPHAS`
- **NOW** BUY signals will trigger copy trades (if they pass guards)

**Example:**
```
Candidate wallet shows 2 BUY signals:
→ 🧪 Candidate BUY signal #1
→ 🧪 Candidate BUY signal #2
→ ✅ AUTO-PROMOTED to active!
→ Now triggers auto-buys
```

### Step 3: Direct Active Addition (Bypass)

**Command:** `/alpha_add_active <wallet>`

**What Happens:**
- Wallet is added **directly as ACTIVE**
- **NO promotion needed**
- BUY signals immediately trigger copy trades (if they pass guards)

**Example:**
```
/alpha_add_active 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp
→ ✅ Wallet added as ACTIVE
→ BUY signals trigger auto-buys immediately
```

---

## Auto-Buy Trigger Conditions

### For ACTIVE Alphas Only

**Only ACTIVE alphas trigger auto-buys.** CANDIDATE alphas only send alerts.

### Guards That Must Pass

Even for ACTIVE alphas, BUY signals must pass **all guards**:

#### 1. **Time Window Guard**
```env
MAX_SIGNAL_AGE_SEC=60  # Signal must be ≤ 60 seconds old
```
- ✅ **PASS:** Signal detected within 60 seconds
- ❌ **FAIL:** Signal older than 60 seconds → Skipped

#### 2. **Liquidity Guard**
```env
MIN_LIQUIDITY_USD=5000  # Token must have ≥ $5k liquidity
```
- ✅ **PASS:** Token has ≥ $5k liquidity
- ❌ **FAIL:** Token has < $5k liquidity → Skipped, added to watchlist

#### 3. **Price Guard**
```env
MAX_ALPHA_ENTRY_MULTIPLIER=2  # Bot entry ≤ 2x alpha entry price
```
- ✅ **PASS:** Current price ≤ 2x alpha entry price
- ❌ **FAIL:** Current price > 2x alpha entry price → Skipped

#### 4. **Rug Checks**
```env
REQUIRE_AUTH_REVOKED=true  # Mint authority must be revoked
```
- ✅ **PASS:** Mint authority revoked, no freeze authority, low tax
- ❌ **FAIL:** Authority not revoked, freeze authority exists, high tax → Skipped

#### 5. **Birdeye Validation** (if configured)
- ✅ **PASS:** Birdeye confirms BUY transaction
- ❌ **FAIL:** Birdeye doesn't confirm → Skipped

---

## Complete Flow Diagram

```
Wallet Added via /alpha_add
    ↓
Added as CANDIDATE
    ↓
BUY Signal Detected
    ↓
Passes Classification Filters?
    ├─ NO → Skipped
    └─ YES → Score Increased
             ↓
        2 BUY Signals in 24h?
            ├─ NO → Still CANDIDATE (alerts only)
            └─ YES → AUTO-PROMOTED to ACTIVE
                     ↓
                 BUY Signal Detected
                     ↓
                 Passes All Guards?
                     ├─ NO → Skipped (with reason)
                     └─ YES → ✅ AUTO-BUY EXECUTED
```

---

## Example Scenarios

### Scenario 1: New Wallet (Candidate)

```
1. /alpha_add Wallet123
   → Added as CANDIDATE
   
2. Wallet123 buys TokenA
   → 🧪 Candidate BUY signal (alert only, no buy)
   
3. Wallet123 buys TokenB
   → 🧪 Candidate BUY signal (alert only, no buy)
   → ✅ AUTO-PROMOTED to active!
   
4. Wallet123 buys TokenC
   → 👀 Alpha touched new mint TokenC
   → ✅ AUTO-BUY EXECUTED (if passes guards)
```

### Scenario 2: Direct Active Addition

```
1. /alpha_add_active Wallet123
   → Added as ACTIVE
   
2. Wallet123 buys TokenA
   → 👀 Alpha touched new mint TokenA
   → ✅ AUTO-BUY EXECUTED (if passes guards)
```

### Scenario 3: Guard Failure

```
1. ACTIVE alpha buys TokenX
   → 👀 Alpha touched new mint TokenX
   
2. Liquidity check: $2k < $5k
   → ❌ FAIL: Liquidity guard
   → ⛔️ Skipping TokenX: Liquidity $2k < $5k
   → Added to watchlist
   
3. NO auto-buy executed
```

---

## Configuration

### Promotion Settings

```env
PROMOTION_THRESHOLD=2        # BUY signals needed to promote
PROMOTION_WINDOW_MS=86400000 # 24 hours window
```

### Guard Settings

```env
MAX_SIGNAL_AGE_SEC=60                    # Time window
MIN_LIQUIDITY_USD=5000                   # Liquidity guard
MAX_ALPHA_ENTRY_MULTIPLIER=2             # Price guard
REQUIRE_AUTH_REVOKED=true                # Rug check
BIRDEYE_API_KEY=xxx                      # Birdeye validation (optional)
```

---

## Summary

**Will all wallets added via Telegram trigger auto-buys?**

**Answer:** ❌ **NO** - Only if:

1. ✅ Wallet is **ACTIVE** (auto-promoted after 2 BUY signals, or directly added via `/alpha_add_active`)
2. ✅ BUY signal passes **all guards**:
   - Time window (≤ 60 seconds)
   - Liquidity (≥ $5k)
   - Price (≤ 2x alpha entry)
   - Rug checks (authority revoked, etc.)
   - Birdeye validation (if configured)

**CANDIDATE wallets:**
- ✅ Detected and scored
- ✅ Send alerts
- ❌ **DO NOT trigger auto-buys**

**ACTIVE wallets:**
- ✅ Detected and scored
- ✅ Send alerts
- ✅ **Trigger auto-buys** (if guards pass)

---

## Recommendation

If you want a wallet to immediately trigger auto-buys:

**Use:** `/alpha_add_active <wallet>`

This bypasses the candidate phase and adds the wallet directly as ACTIVE, so BUY signals will trigger copy trades immediately (if they pass guards).

