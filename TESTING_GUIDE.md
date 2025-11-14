# Testing & Validation Guide

## 🎯 Goal
Validate all fixes and ensure bot is ready for mainnet deployment.

---

## ✅ Quick Validation (30 minutes)

### Step 1: Verify Current Configuration (5 min)

**Check Helius:**
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 50 | grep -E '(Helius|RPC_URL)' | head -3"
```
Expected: `✅ Helius RPC enabled (API key: a40f7eab...e27d)`

**Check Priority Fees:**
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 50 | grep -E '(Priority|microLamports)' | head -2"
```
Expected: `⚙️  Priority: 5000 microLamports/CU, 800000 CU limit, max 0.00000125 SOL (multiplier: 1x)`

**Check Bot Status:**
```bash
ssh ubuntu@alpha-snipes-vm "pm2 status"
```
Expected: `online` status

---

### Step 2: Test PnL Calculation (10 min)

**Test 1: Force Buy → Force Exit**
1. In "Alpha Control" chat, run:
   ```
   /force_buy <any_valid_mint>
   ```
2. Wait for buy confirmation
3. Immediately run:
   ```
   /force_exit <same_mint>
   ```
4. **Verify:**
   - ✅ Telegram shows correct entry/exit prices
   - ✅ PnL percentage matches USD profit/loss
   - ✅ No "-100.0%" errors

**Test 2: Profit Scenario**
1. Force buy a token
2. Wait a moment (price might move)
3. Force exit
4. **Verify:** If profit, percentage is positive and matches USD

**Test 3: Loss Scenario**
1. Force buy a token
2. Force exit immediately (likely small loss due to slippage)
3. **Verify:** If loss, percentage is negative and matches USD

---

### Step 3: Test Priority Fees (10 min)

**Check Current Configuration:**
```bash
ssh ubuntu@alpha-snipes-vm "cd ~/Alpha\ Snipes && grep -E '(CU_UNIT_PRICE|JITO_PRIORITY|MAX_PRIORITY)' .env"
```

**Monitor a Force Buy:**
1. Run `/force_buy` in Telegram
2. Check logs for priority fee usage:
   ```bash
   ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 100 | grep -E '(SWAP|priority|Jupiter)' | tail -10"
   ```
3. **Verify:**
   - ✅ No errors in swap execution
   - ✅ Transaction completes successfully
   - ✅ Priority fees are reasonable (not excessive)

**Calculate Expected Fee:**
- Typical swap: ~250k CU
- Fee: `(250000 * 5000 * 1.0) / 1e6 = 0.00125 SOL`
- Max cap: `0.05 SOL`
- **Expected:** Fee should be around 0.001-0.002 SOL for normal swaps

---

### Step 4: Test BUY Quote Fallback (5 min)

**Test with a New Token:**
1. Find a very new token (pump.fun, just launched)
2. Run `/force_buy <mint>`
3. Check logs:
   ```bash
   ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 200 | grep -E '(PRICE|BUY quote|SELL quote)' | tail -15"
   ```
4. **Verify:**
   - ✅ If SELL quote fails, BUY quote fallback triggers
   - ✅ Price calculation is reasonable (not 1e-12)
   - ✅ Decimals are handled correctly

---

## 📋 Mainnet Readiness Testing (2-3 hours)

### Phase 1: Alpha Signal Detection

#### Test 1.1: First Buy Detection
**Setup:** Wait for alpha to make first buy of a new token

**Expected:**
- ✅ `[CLASSIFY] BUY` appears in logs
- ✅ `solSpent > DUST_SOL_SPENT` (0.001 SOL)
- ✅ `tokenDelta > 0` (tokens increased)
- ✅ `previousBalance == 0` (first buy)

**Log Check:**
```bash
pm2 logs alpha-snipes-paper | grep -E '\[CLASSIFY\] BUY'
```

#### Test 1.2: Size Increase Detection
**Setup:** Alpha increases position by ≥25%

**Expected:**
- ✅ `[CLASSIFY] BUY` appears
- ✅ `size increase X.XXx >= min 0.25x`

**Log Check:**
```bash
pm2 logs alpha-snipes-paper | grep -E 'size increase|MIN_SIZE_INCREASE'
```

#### Test 1.3: SELL Detection (Should Ignore)
**Setup:** Alpha sells tokens

**Expected:**
- ❌ No `[CLASSIFY] BUY`
- ✅ `[CLASSIFY] SELL` or `delta <= 0`

**Log Check:**
```bash
pm2 logs alpha-snipes-paper | grep -E '\[CLASSIFY\] SELL'
```

---

### Phase 2: Guards Testing

#### Test 2.1: Time Window Guard
**Setup:** Signal age < 60s

**Expected:**
- ✅ `[GUARD] Time window | signalAge=X.Xs | max=60s | ✅ PASS`

**Setup:** Signal age > 60s (stale)

**Expected:**
- ❌ `[GUARD] Time window | signalAge=XX.Xs | max=60s | ❌ FAIL`
- ✅ Telegram: "Signal too old"

#### Test 2.2: Price Guard
**Setup:** Current price within 2x alpha entry

**Expected:**
- ✅ `[GUARD] Price guard | ratio=X.XXx | max=2.0x | ✅ PASS`

**Setup:** Current price > 2x alpha entry

**Expected:**
- ❌ `[GUARD] Price guard | ratio=X.XXx | max=2.0x | ❌ FAIL`
- ✅ Telegram: "Price X.XXx higher than alpha entry"

#### Test 2.3: Liquidity Guard
**Setup:** Liquidity ≥ $10k

**Expected:**
- ✅ `[GUARD] Liquidity | liquidity=$XXXXX | min=$10000 | ✅ PASS`

**Setup:** Liquidity < $10k

**Expected:**
- ❌ `[GUARD] Liquidity | liquidity=$XXXX | min=$10000 | ❌ FAIL`
- ✅ Token added to watchlist
- ✅ Telegram: "Added to watchlist (low_liquidity)"

---

### Phase 3: Exit Management Testing

#### Test 3.1: Early Take-Profit
**Setup:** Position hits +30% (EARLY_TP_PCT)

**Expected:**
- ✅ Telegram: "🎯 Early TP hit"
- ✅ Partial sell if `PARTIAL_TP_PCT > 0`
- ✅ Switches to trailing stop mode

**Log Check:**
```bash
pm2 logs alpha-snipes-paper | grep -E 'Early TP|trailing'
```

#### Test 3.2: Trailing Stop
**Setup:** Price drops 20% from high (TRAIL_STOP_PCT)

**Expected:**
- ✅ Telegram: "🛑 Trailing stop exit"
- ✅ Position closed
- ✅ PnL calculated correctly

#### Test 3.3: Sentry Window
**Setup:** Price drops >22% in first 2 minutes

**Expected:**
- ✅ Telegram: "🚨 Sentry abort"
- ✅ Position closed immediately
- ✅ Drawdown percentage shown

#### Test 3.4: Max Loss Protection
**Setup:** Position down >20% (MAX_LOSS_PCT)

**Expected:**
- ✅ Telegram: "Max loss protection triggered"
- ✅ Position closed
- ✅ Loss percentage shown

---

## 📊 Test Results Template

Create a file `TEST_RESULTS.md` to document:

```markdown
# Test Results - [Date]

## Quick Validation
- [ ] Helius RPC: ✅/❌
- [ ] Priority Fees: ✅/❌
- [ ] PnL Calculation: ✅/❌
- [ ] BUY Quote Fallback: ✅/❌

## Alpha Signal Detection
- [ ] First Buy: ✅/❌
- [ ] Size Increase: ✅/❌
- [ ] SELL Ignored: ✅/❌

## Guards
- [ ] Time Window: ✅/❌
- [ ] Price Guard: ✅/❌
- [ ] Liquidity Guard: ✅/❌

## Exit Management
- [ ] Early TP: ✅/❌
- [ ] Trailing Stop: ✅/❌
- [ ] Sentry Window: ✅/❌
- [ ] Max Loss: ✅/❌

## Issues Found
- [List any issues]

## Notes
[Any observations]
```

---

## 🚀 Getting Started

**Right Now (5 minutes):**
1. Run Step 1 (Verify Configuration)
2. Run Step 2 (Test PnL - one quick cycle)

**Today (1-2 hours):**
3. Complete Quick Validation (Steps 1-4)
4. Start Mainnet Readiness Testing (Phase 1)

**This Week:**
5. Complete all Mainnet Readiness tests
6. Document results
7. Fix any issues found
8. Prepare for mainnet

---

## 💡 Tips

- **Monitor logs in real-time:** `pm2 logs alpha-snipes-paper --lines 0`
- **Filter specific tests:** `grep -E '\[GUARD\]|\[CLASSIFY\]'`
- **Save test results:** Document everything in `TEST_RESULTS.md`
- **Test in paper mode:** All tests should be safe (no real funds)

---

**Ready to start?** Let's begin with Step 1!

