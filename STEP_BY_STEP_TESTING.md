# Step-by-Step Testing Guide

## 🎯 Current Status
- ✅ Step 1: Configuration Verified
- ✅ Step 2: PnL Calculation - PASSED
- ⏳ Step 3: Priority Fee Testing - NEXT
- ⏳ Step 4: BUY Quote Fallback - Ready to retest
- ⏳ Mainnet Readiness Testing - After Steps 3-4

---

## 📋 STEP 3: Priority Fee Testing (15 minutes)

### **Goal:** Verify priority fees are working correctly and are reasonable

### **Step 3.1: Check Current Priority Fee Configuration (2 min)**

**Action:** Run this command on your Mac:
```bash
ssh ubuntu@alpha-snipes-vm "cd ~/Alpha\ Snipes && grep -E '(CU_UNIT_PRICE|JITO_PRIORITY|MAX_PRIORITY)' .env"
```

**Expected Output:**
```
CU_UNIT_PRICE_MICROLAMPORTS=5000
CU_LIMIT=800000
JITO_PRIORITY_FEE_MULTIPLIER=1.0
MAX_PRIORITY_FEE_LAMPORTS=50000000
```

**What to Check:**
- ✅ All values are present
- ✅ `CU_UNIT_PRICE_MICROLAMPORTS=5000` (reasonable: 2k-10k range)
- ✅ `MAX_PRIORITY_FEE_LAMPORTS=50000000` (0.05 SOL max - reasonable)

**If values are missing:** Add them to `.env` on VM:
```bash
ssh ubuntu@alpha-snipes-vm "cd ~/Alpha\ Snipes && echo 'JITO_PRIORITY_FEE_MULTIPLIER=1.0' >> .env && echo 'MAX_PRIORITY_FEE_LAMPORTS=50000000' >> .env"
```

---

### **Step 3.2: Calculate Expected Priority Fee (3 min)**

**Action:** Calculate what the priority fee should be:

**Formula:**
```
Typical swap CU usage: 250,000 CU
Fee = (250,000 × CU_UNIT_PRICE × MULTIPLIER) / 1,000,000
Max cap: MAX_PRIORITY_FEE_LAMPORTS / 1,000,000,000 (convert to SOL)
```

**With your current config:**
```
Fee = (250,000 × 5,000 × 1.0) / 1,000,000
    = 1,250,000 microLamports
    = 0.00125 SOL
Max cap: 50,000,000 lamports = 0.05 SOL
```

**Expected Result:**
- ✅ Fee should be around **0.001-0.002 SOL** for normal swaps
- ✅ Never exceed **0.05 SOL** (the cap)

**Document this:** Write down your expected fee range:
```
Expected priority fee: 0.001-0.002 SOL per swap
Max cap: 0.05 SOL
```

---

### **Step 3.3: Monitor a Force Buy for Priority Fee Usage (10 min)**

**Action 1:** Open a terminal to monitor logs in real-time:
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 0"
```
(Keep this terminal open - it will show new logs as they come in)

**Action 2:** In "Alpha Control" Telegram chat, run:
```
/force_buy <any_valid_token_mint>
```
(Use any token you want - doesn't matter which one)

**Action 3:** Watch the terminal for swap-related logs. Look for:
- `[SWAP]` messages
- `[PRICE]` messages
- Any errors

**What to Look For:**
- ✅ `[SWAP] Jupiter swap successful` - swap completed
- ✅ No errors about priority fees
- ✅ Transaction completes successfully
- ⚠️ If you see errors, note them down

**Action 4:** After the buy completes, check for any priority fee information:
```bash
# In a new terminal (or stop the log monitoring with Ctrl+C)
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 200 --nostream | grep -E '(SWAP|priority|Jupiter|txid)' | tail -20"
```

**What to Check:**
- ✅ Swap executed successfully
- ✅ No errors
- ✅ Transaction ID appears (if in live mode, or `[PAPER-BUY]` in paper mode)

**Note:** In paper mode, you won't see actual transaction fees, but you can verify the swap logic is working.

---

### **Step 3.4: Verify Priority Fee Calculation in Code (Optional - 5 min)**

**Action:** Check the startup logs to verify the calculated max fee:
```bash
ssh ubuntu@alpha-snipes-vm "grep -E '(Priority|microLamports|max.*SOL)' ~/.pm2/logs/alpha-snipes-paper-out.log | tail -3"
```

**Expected Output:**
```
⚙️  Priority: 5000 microLamports/CU, 800000 CU limit, max 0.00000125 SOL (multiplier: 1x)
```

**What to Check:**
- ✅ Max fee shown: `0.00000125 SOL` (or similar)
- ✅ This matches your calculation from Step 3.2
- ✅ Multiplier shown: `1x` (or whatever you set)

**If the max fee looks wrong:** Check the calculation:
- Should be: `(250k × 5000 × 1.0) / 1e6 = 0.00125 SOL`
- But it's capped at `MAX_PRIORITY_FEE_LAMPORTS`

---

### **Step 3.5: Document Results**

**Fill in TEST_RESULTS.md:**

```markdown
### Test 3.1: Fee Calculation
- **Status:** ✅/❌
- **Expected:** 0.001-0.002 SOL per swap
- **Actual:** [What you calculated]
- **Notes:** [Any observations]

### Test 3.2: Actual Swap Execution
- **Status:** ✅/❌
- **Swap completed:** ✅/❌
- **Errors:** [List any errors]
- **Notes:** [Any observations]
```

---

## 📋 STEP 4: BUY Quote Fallback Retest (10 minutes)

### **Goal:** Verify the improved BUY quote fallback works correctly

### **Step 4.1: Find a New Token (2 min)**

**Action:** You need a very new token (pump.fun, just launched) that might trigger the BUY quote fallback.

**Option 1:** Use a token you know is very new
**Option 2:** Wait for a new token to appear
**Option 3:** Use the same token from before (GSgszR...pump) - it might still trigger fallback if SELL quote is rate-limited

---

### **Step 4.2: Monitor Logs During Force Buy (5 min)**

**Action 1:** Open log monitoring:
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 0"
```

**Action 2:** In "Alpha Control" Telegram, run:
```
/force_buy <token_mint>
```

**Action 3:** Watch for these log patterns:

**If SELL quote works (normal case):**
```
[PRICE] Fetching SELL quote for ... (1M tokens → SOL)
[PRICE] SELL quote success for ...: X.XXXe-X SOL/token
```

**If SELL quote fails and BUY fallback triggers:**
```
[PRICE] SELL quote failed for ...: [error]
[PRICE] Attempting BUY quote fallback for ... (0.1 SOL → tokens)
[PRICE] BUY quote fallback: raw=..., decimals=..., UI=..., price=...
[PRICE] Price too small (X.XXXe-X) with 9 decimals, trying 0 decimals assumption
[PRICE] BUY quote with 0 decimals: X.XXXe-X SOL/token (more reasonable)
[PRICE] BUY quote fallback success for ...: X.XXXe-X SOL/token
```

**What to Check:**
- ✅ If BUY fallback triggers, it should detect 0 decimals
- ✅ Final price should be reasonable (between 1e-6 and 1e-2 SOL/token)
- ✅ No extremely small prices like `1e-12` or `1e-13`

---

### **Step 4.3: Verify Exit Price is Correct (3 min)**

**Action 1:** After the force buy, immediately run:
```
/force_exit <same_token_mint>
```

**Action 2:** Check the Telegram message for exit price:
- **Good:** Exit price should be reasonable (similar to entry price, maybe slightly different)
- **Bad:** Exit price showing `0.00000066 SOL` or similar extremely small value

**Action 3:** Check logs for the exit:
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 200 --nostream | grep -E '(PRICE.*<token>|BUY quote|SELL quote)' | tail -10"
```

**What to Check:**
- ✅ Exit price in Telegram message is reasonable
- ✅ If BUY fallback was used, it should show correct price
- ✅ PnL calculation is still correct (this should always work)

---

### **Step 4.4: Document Results**

**Fill in TEST_RESULTS.md:**

```markdown
### Test 4.1: SELL Quote Success
- **Status:** ✅/❌
- **Notes:** [Did SELL quote work?]

### Test 4.2: BUY Quote Fallback
- **Status:** ✅/❌
- **Triggered:** ✅/❌ (Did fallback trigger?)
- **Price calculated:** [What price was shown]
- **Reasonable:** ✅/❌ (Was price between 1e-6 and 1e-2?)
- **Notes:** [Any observations]

### Test 4.3: Exit Price Display
- **Status:** ✅/❌
- **Exit price shown:** [What was displayed]
- **Reasonable:** ✅/❌
- **Notes:** [Any issues]
```

---

## 📋 STEP 5: Mainnet Readiness Testing (2-3 hours)

### **Phase 1: Alpha Signal Detection**

#### **Test 5.1: Monitor for Real Alpha BUY Signal (30-60 min)**

**Action 1:** Keep the bot running and monitor logs:
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 0 | grep -E '\[CLASSIFY\]|BUY|SELL'"
```

**Action 2:** Wait for one of your alpha wallets to make a BUY transaction

**What to Look For:**
- `[CLASSIFY] BUY` message appears
- Shows: `solSpent=X.XXXX`, `tokens=XXXXX`, `entryPrice=X.XXX`
- Shows: `previousBalance=0` (first buy) or `size increase X.XXx`

**Action 3:** When a BUY signal appears, check:
- ✅ `solSpent > 0.001` (above dust threshold)
- ✅ `tokenDelta > 0` (tokens increased)
- ✅ `entryPrice` is calculated
- ✅ Signal age is shown

**Document:**
```markdown
### Test 5.1: First Buy Detection
- **Status:** ✅/❌
- **Alpha wallet:** [Which alpha]
- **Token:** [Mint address]
- **solSpent:** [Amount]
- **tokenDelta:** [Amount]
- **entryPrice:** [Price]
- **signalAge:** [Time]
- **Notes:** [Observations]
```

---

#### **Test 5.2: Verify Guards are Checked (10 min)**

**When a BUY signal is detected, check logs for guard checks:**

**Action:** After a BUY signal appears, check:
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 500 --nostream | grep -E '\[GUARD\]|\[CLASSIFY\] BUY' | tail -20"
```

**What to Look For:**
- `[GUARD] Time window | signalAge=X.Xs | max=60s | ✅ PASS` or `❌ FAIL`
- `[GUARD] Price guard | ratio=X.XXx | max=2.0x | ✅ PASS` or `❌ FAIL`
- `[GUARD] Liquidity | liquidity=$XXXXX | min=$10000 | ✅ PASS` or `❌ FAIL`

**Expected:**
- ✅ All guards should show `✅ PASS` for a valid trade
- ❌ If any guard fails, trade should be skipped

**Document:**
```markdown
### Test 5.2: Guard Checks
- **Time window:** ✅/❌ PASS/FAIL
- **Price guard:** ✅/❌ PASS/FAIL
- **Liquidity guard:** ✅/❌ PASS/FAIL
- **All passed:** ✅/❌
- **Trade executed:** ✅/❌
- **Notes:** [Observations]
```

---

#### **Test 5.3: Test SELL Signal is Ignored (10 min)**

**Action:** Wait for an alpha wallet to SELL tokens (or monitor logs for SELL transactions)

**What to Look For:**
- `[CLASSIFY] SELL` message appears
- OR: No `[CLASSIFY] BUY` when alpha's token balance decreases

**Expected:**
- ✅ SELL transactions should NOT trigger BUY signals
- ✅ Bot should ignore SELL transactions
- ✅ No position should be opened

**Document:**
```markdown
### Test 5.3: SELL Ignored
- **Status:** ✅/❌
- **SELL detected:** ✅/❌
- **BUY signal triggered:** ❌ (should be NO)
- **Position opened:** ❌ (should be NO)
- **Notes:** [Observations]
```

---

### **Phase 2: Exit Management Testing**

#### **Test 5.4: Early Take-Profit (30-60 min)**

**Setup:** You need a position that goes up 30% (EARLY_TP_PCT)

**Option 1:** Wait for a real position to hit TP
**Option 2:** Use `/force_buy` on a token, wait for price to go up, then monitor

**Action 1:** Open a position (force buy or real alpha signal)

**Action 2:** Monitor exit management:
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 0 | grep -E 'Early TP|trailing|EXIT|manageExit'"
```

**What to Look For:**
- When price hits +30%, you should see:
  - `🎯 Early TP hit` in Telegram
  - `[EXIT] Early TP triggered` in logs
  - Position partially or fully closed (depending on PARTIAL_TP_PCT)

**Expected:**
- ✅ Early TP triggers at +30%
- ✅ Telegram notification sent
- ✅ Position closed (or partially if PARTIAL_TP_PCT > 0)
- ✅ Switches to trailing stop mode if position remains

**Document:**
```markdown
### Test 5.4: Early Take-Profit
- **Status:** ✅/❌
- **TP triggered at:** [Price/percentage]
- **Telegram notification:** ✅/❌
- **Position closed:** ✅/❌ (fully/partially)
- **Trailing stop activated:** ✅/❌
- **Notes:** [Observations]
```

---

#### **Test 5.5: Trailing Stop (30-60 min)**

**Setup:** Position must be in trailing stop mode (after Early TP or from start)

**Action:** Monitor for trailing stop trigger:
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 0 | grep -E 'Trailing stop|trailTrigger|highPrice'"
```

**What to Look For:**
- When price drops 20% from high (TRAIL_STOP_PCT):
  - `🛑 Trailing stop exit` in Telegram
  - `[EXIT] Trailing stop triggered` in logs
  - Position closed

**Expected:**
- ✅ Trailing stop triggers when price drops 20% from peak
- ✅ Telegram notification sent
- ✅ Position closed
- ✅ PnL calculated correctly

**Document:**
```markdown
### Test 5.5: Trailing Stop
- **Status:** ✅/❌
- **Stop triggered at:** [Price/percentage from high]
- **Telegram notification:** ✅/❌
- **Position closed:** ✅/❌
- **PnL correct:** ✅/❌
- **Notes:** [Observations]
```

---

#### **Test 5.6: Sentry Window (10 min)**

**Setup:** Position must be in sentry window (first 2 minutes)

**Action:** Monitor sentry:
```bash
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 0 | grep -E 'Sentry|sentry|DD|drawdown'"
```

**What to Look For:**
- If price drops >22% in first 2 minutes:
  - `🚨 Sentry abort` in Telegram
  - `[EXIT] Sentry abort` in logs
  - Position closed immediately

**Expected:**
- ✅ Sentry triggers on >22% drawdown in first 2 minutes
- ✅ Telegram notification sent
- ✅ Position closed immediately
- ✅ Drawdown percentage shown

**Document:**
```markdown
### Test 5.6: Sentry Window
- **Status:** ✅/❌
- **Sentry triggered:** ✅/❌
- **Drawdown:** [Percentage]
- **Within 2 minutes:** ✅/❌
- **Telegram notification:** ✅/❌
- **Position closed:** ✅/❌
- **Notes:** [Observations]
```

---

## 📊 Testing Checklist Summary

### Quick Validation (30 min)
- [x] Step 1: Configuration Verified ✅
- [x] Step 2: PnL Calculation ✅
- [ ] Step 3: Priority Fee Testing ⏳ **NEXT**
- [ ] Step 4: BUY Quote Fallback Retest

### Mainnet Readiness (2-3 hours)
- [ ] Test 5.1: First Buy Detection
- [ ] Test 5.2: Guard Checks
- [ ] Test 5.3: SELL Ignored
- [ ] Test 5.4: Early Take-Profit
- [ ] Test 5.5: Trailing Stop
- [ ] Test 5.6: Sentry Window

---

## 🎯 Your Next Action

**Start with Step 3.1** - Check your priority fee configuration:

```bash
ssh ubuntu@alpha-snipes-vm "cd ~/Alpha\ Snipes && grep -E '(CU_UNIT_PRICE|JITO_PRIORITY|MAX_PRIORITY)' .env"
```

**Then proceed through Step 3.2, 3.3, etc.**

**After each step, update TEST_RESULTS.md with your findings.**

---

## 💡 Tips

1. **Keep TEST_RESULTS.md open** - Update it as you go
2. **Use multiple terminals** - One for logs, one for commands
3. **Take screenshots** - Of Telegram messages and log outputs
4. **Don't rush** - Take time to understand what's happening
5. **Ask questions** - If something doesn't make sense, ask!

---

**Ready to start Step 3?** Run the command above and share the results! 🚀

