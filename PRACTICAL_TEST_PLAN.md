# Practical Test Plan: Paper Mode Validation

## Overview

This plan focuses on **realistic, actionable testing** you can perform in paper mode. It prioritizes tests that will actually occur with real alpha wallets, and provides clear instructions for synthetic tests when needed.

**Estimated Time:** 3-5 days of active monitoring + 2 days of synthetic testing

---

## Pre-Testing Setup

### 1. Enable Verbose Logging

Edit `.env`:
```bash
DEBUG_TX=true
DEBUG_TO_TELEGRAM=true
```

### 2. Configure Test-Friendly Settings

Edit `.env`:
```bash
# Make guards more visible
MAX_SIGNAL_AGE_SEC=60
MAX_ALPHA_ENTRY_MULTIPLIER=2.0
MIN_LIQUIDITY_USD=4000

# Enable watchlist
ENABLE_WATCHLIST=true
WATCHLIST_MAX_AGE_MS=259200000  # 3 days

# Set small position sizes for testing
MIN_BUY_SOL=0.001
MAX_BUY_SOL=0.01
BUY_SOL=0.005
```

### 3. Prepare Monitoring Tools

**Telegram Commands:**
- `/open` - Check open positions
- `/pnl` - Check PnL summary
- `/watchlist` - Check watchlist entries
- `/alpha_list` - Verify alpha wallets are active

**Log Monitoring:**
```bash
# Watch all classification decisions
tail -f logs/bot_*.log | grep "\[CLASSIFY\]"

# Watch all guard decisions
tail -f logs/bot_*.log | grep "\[GUARD\]"

# Watch all exits
tail -f logs/bot_*.log | grep "\[EXIT\]"
```

---

## Phase 1: Real Alpha Testing (Days 1-3)

### Test 1.1: Alpha First Buy → Bot Copies ✅

**What to Watch For:**
- Alpha wallet buys a new token
- Bot detects BUY signal within seconds
- All guards pass
- Bot executes buy

**Expected Logs:**
```
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | solSpent=0.0259 | tokens=6,972.663
[GUARD] Time window | signalAge=2.4s | max=60s | ✅ PASS
[GUARD] Liquidity | liquidity=$31575 | min=$4000 | ✅ PASS
[GUARD] Price guard | alphaEntry=3.71e-6 | botEntry=3.70e-6 | ratio=1.00x | max=2.0x | ✅ PASS
✅ Bought 0.005 SOL ($0.08) of 5W2o1NZs...
```

**Success Criteria:**
- ✅ BUY signal detected within 10s of alpha transaction
- ✅ All guards show `✅ PASS`
- ✅ Buy message appears in Telegram
- ✅ Position appears in `/open` command

**How Often:** This should happen **multiple times per day** with active alpha wallets.

---

### Test 1.2: Alpha Size Increase → Bot Copies ✅

**What to Watch For:**
- Alpha wallet already holds token, buys more
- Size increase ≥25% (MIN_SIZE_INCREASE_RATIO)
- Bot detects and copies

**Expected Logs:**
```
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | solSpent=0.05 | tokens=15,000
[GUARD] Time window | signalAge=1.2s | max=60s | ✅ PASS
...
✅ Bought 0.005 SOL ($0.08) of 5W2o1NZs...
```

**Success Criteria:**
- ✅ BUY signal detected for existing position
- ✅ Size increase ratio ≥0.25x
- ✅ Bot copies the additional buy

**How Often:** Less common, but should happen **1-2 times per week** with active alphas.

---

### Test 1.3: Alpha Dust Transaction → Bot Ignores ✅

**What to Watch For:**
- Alpha wallet makes tiny transaction (<0.001 SOL)
- Bot detects but ignores due to dust threshold

**Expected Logs:**
```
[CLASSIFY] skip tx abc12345: solSpent=0.00005 < dust 0.001
```

**Success Criteria:**
- ✅ No BUY signal emitted
- ✅ No trade executed
- ✅ Log shows dust skip reason

**How Often:** Should happen **frequently** - most alpha wallets make many small transactions.

---

### Test 1.4: Alpha SELL Transaction → Bot Ignores ⚠️

**What to Watch For:**
- Alpha wallet sells tokens (SOL increases, tokens decrease)
- Bot should NOT treat this as a buy signal

**Expected Behavior:**
- Currently: Bot doesn't detect SELLs (they're filtered out)
- **Gap:** SELLs aren't logged with `[CLASSIFY] SELL` prefix
- **Action:** Monitor that no false BUY signals occur on alpha sells

**Success Criteria:**
- ✅ No BUY signal when alpha sells
- ✅ No trade executed
- ✅ (Future: `[CLASSIFY] SELL` log appears)

**How Often:** Should happen **multiple times per day** - alphas sell frequently.

---

### Test 1.5: Stale Signal (>60s) → Bot Skips ✅

**What to Watch For:**
- Alpha transaction occurred >60s ago
- Bot detects but skips due to time guard

**Expected Logs:**
```
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | ...
[GUARD] Time window | signalAge=95.2s | max=60s | ❌ FAIL
⛔️ Skipping 5W2o1NZs...: Signal too old (95.2s > 60s)
```

**Success Criteria:**
- ✅ Time guard shows `❌ FAIL`
- ✅ Skip message appears in Telegram
- ✅ No trade executed

**How to Trigger:**
- Restart bot after alpha has already traded (startup scan will catch old signals)
- Or wait for a slow RPC response to delay signal detection

**How Often:** Should happen **occasionally** during bot restarts or RPC delays.

---

### Test 1.6: Price >2x Alpha Entry → Bot Skips ✅

**What to Watch For:**
- Token price has moved significantly since alpha bought
- Bot detects price is too high relative to alpha entry

**Expected Logs:**
```
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | ...
[GUARD] Time window | signalAge=2.4s | max=60s | ✅ PASS
[GUARD] Liquidity | liquidity=$31575 | min=$4000 | ✅ PASS
[GUARD] Price guard | alphaEntry=3.71e-6 | botEntry=1.11e-5 | ratio=3.00x | max=2.0x | ❌ FAIL
⛔️ Skipping 5W2o1NZs...: Price 3.00x higher than alpha entry (limit 2.0x)
```

**Success Criteria:**
- ✅ Price guard shows `❌ FAIL`
- ✅ Ratio calculation is correct
- ✅ Skip message explains reason clearly

**How Often:** Should happen **frequently** - tokens often pump before bot can react.

---

### Test 1.7: Low Liquidity → Bot Skips + Watchlist ✅

**What to Watch For:**
- Token has <$4,000 liquidity
- Bot skips and adds to watchlist

**Expected Logs:**
```
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | ...
[GUARD] Time window | signalAge=2.4s | max=60s | ✅ PASS
[GUARD] Liquidity | liquidity=$2500 | min=$4000 | ❌ FAIL
⛔️ Skipping 5W2o1NZs...: Liquidity $2,500 < $4,000
👀 Added 5W2o1NZs... to watchlist (low_liquidity). Monitoring up to 72h for liquidity.
```

**Success Criteria:**
- ✅ Liquidity guard shows `❌ FAIL`
- ✅ Token appears in `/watchlist` command
- ✅ Watchlist entry shows correct reason

**How Often:** Should happen **occasionally** - very early tokens often have low liquidity.

---

### Test 1.8: Rug Check Failure → Bot Skips ✅

**What to Watch For:**
- Token fails rug checks (authority not revoked, high tax, etc.)
- Bot skips with clear explanation

**Expected Logs:**
```
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | ...
[GUARD] Time window | signalAge=2.4s | max=60s | ✅ PASS
[GUARD] Liquidity | liquidity=$31575 | min=$4000 | ✅ PASS
⛔️ Skipping 5W2o1NZs... due to: authority_not_revoked: mint/freeze authority still active
```

**Success Criteria:**
- ✅ Rug check fails with clear reason
- ✅ Skip message explains the risk
- ✅ No trade executed

**How Often:** Should happen **frequently** - many new tokens fail rug checks.

---

### Test 1.9: Early TP Hit → Bot Exits ✅

**What to Watch For:**
- Position reaches +30% gain (EARLY_TP_PCT)
- Bot triggers early TP and switches to trailing mode

**Expected Logs:**
```
🎯 Early TP hit for 5W2o1NZs...
Price: 3.71e-6 SOL/token (~$0.0004)
Target: 3.75e-6 SOL/token
Switching to trailing stop...
```

**Success Criteria:**
- ✅ Early TP message appears in Telegram
- ✅ Position switches to trailing mode (no immediate exit)
- ✅ High price is tracked for trailing stop

**How Often:** Should happen **occasionally** - depends on token performance.

---

### Test 1.10: Trailing Stop → Bot Exits ✅

**What to Watch For:**
- Price drops 20% from high (TRAIL_STOP_PCT)
- Bot exits position

**Expected Logs:**
```
🛑 Trailing stop exit: 5W2o1NZs...
Exit: 3.71e-6 SOL (~$0.0004)
💡 Bought $0.08 → Sold $0.10  |  +$0.02 (+25.0%)
🏆 Winner — 5W2o1NZs...
```

**Success Criteria:**
- ✅ Exit message appears in Telegram
- ✅ Winner/Loser card shows correct PnL
- ✅ Position removed from `/open`
- ✅ Trade appears in `/pnl`

**How Often:** Should happen **frequently** - most positions will exit via trailing stop.

---

### Test 1.11: Sentry Abort → Bot Exits ✅

**What to Watch For:**
- Price drops >22% within first 2 minutes (SENTRY_MAX_DD_PCT)
- Bot force-exits position

**Expected Logs:**
```
🚨 Sentry abort: 5W2o1NZs...  |  DD: 25.0%
💡 Bought $0.08 → Sold $0.06  |  -$0.02 (-25.0%)
```

**Success Criteria:**
- ✅ Sentry exit message appears
- ✅ Exit happens within 120s window
- ✅ Position is closed immediately

**How Often:** Should happen **occasionally** - depends on token volatility.

---

## Phase 2: Synthetic Testing (Days 4-5)

### Test 2.1: Dead Token Exit ⚠️

**Setup:**
1. Use `/force_buy <mint> 0.01` to create a test position
2. Wait 60+ seconds
3. Token price becomes unavailable (or use a test token with no liquidity)

**Expected Logs:**
```
[EXIT] Dead token detected for 5W2o1NZs... - forcing exit
💀 Dead token auto-exit: 5W2o1NZs...
Price unavailable for >60s. Forcing exit to prevent 100% loss.
```

**Success Criteria:**
- ✅ Dead token exit triggers after 60s of price failures
- ✅ Exit message appears
- ✅ Position is closed

**How to Test:**
- Create position with `/force_buy`
- Manually break price fetching (temporarily modify RPC URL)
- Wait 60s and verify exit

---

### Test 2.2: Max Loss Protection ⚠️

**Setup:**
1. Use `/force_buy <mint> 0.01` to create a test position
2. Manually set entry price high in `data/positions.json` (or wait for natural drop)
3. Position should drop to -20% (MAX_LOSS_PCT)

**Expected Logs:**
```
[EXIT] Max loss protection triggered for 5W2o1NZs...: -25.0%
🛡️ Max loss protection: 5W2o1NZs...
Loss: -25.0% (limit: -20%)
Forcing exit to prevent further losses.
```

**Success Criteria:**
- ✅ Max loss exit triggers at -20% threshold
- ✅ Exit message appears
- ✅ Position is closed

**How to Test:**
- Create position with `/force_buy`
- Wait for natural price drop (or use a test token that's dumping)
- Verify exit triggers at -20%

---

### Test 2.3: Position Persistence ✅

**Setup:**
1. Bot has open positions
2. Restart bot (PM2 restart)
3. Positions should reload from disk

**Expected Logs:**
```
[POSITIONS] Loaded 3 positions from disk
```

**Success Criteria:**
- ✅ Positions appear in `/open` after restart
- ✅ Exit management continues for reloaded positions
- ✅ No duplicate positions created

**How to Test:**
1. Let bot open a position naturally
2. Run `pm2 restart alpha-snipes-paper`
3. Check `/open` command - position should still be there
4. Verify exit management continues working

---

### Test 2.4: Watchlist Auto-Buy ⚠️

**Setup:**
1. Token is added to watchlist (low liquidity)
2. Liquidity increases to >$4,000
3. Bot should auto-buy

**Expected Logs:**
```
[WATCHLIST] waiting 5W2o1NZs... | liquidity=$2500 | min=4000
...
👀 Watchlist ready
Mint: 5W2o1NZs...
Liquidity: $15,000
Auto-buying now...
✅ Bought 0.005 SOL ($0.08) of 5W2o1NZs...
```

**Success Criteria:**
- ✅ Watchlist entry monitors liquidity
- ✅ Auto-buy triggers when liquidity threshold met
- ✅ Position is opened automatically

**How to Test:**
- Wait for natural watchlist entry (from Test 1.7)
- Or manually add entry to `data/watchlist.json`
- Wait for liquidity to increase (or use test token)
- Verify auto-buy triggers

---

### Test 2.5: Startup Scan ✅

**Setup:**
1. Bot is stopped
2. Alpha wallet makes a trade
3. Bot is restarted within 5 minutes
4. Bot should catch the missed signal

**Expected Logs:**
```
🔍 Scanning recent transactions for missed alpha signals...
[SCAN] processing tx abc12345 for alpha 8zkJmeQS
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | ...
✅ Startup scan complete
```

**Success Criteria:**
- ✅ Startup scan processes recent transactions
- ✅ Missed BUY signals are caught
- ✅ Bot attempts to copy trade (if guards pass)

**How to Test:**
1. Stop bot: `pm2 stop alpha-snipes-paper`
2. Wait for alpha to trade (monitor on-chain)
3. Restart bot: `pm2 start alpha-snipes-paper`
4. Check logs for scan activity
5. Verify bot processes the missed signal

---

## Phase 3: Edge Case Testing (Days 6-7)

### Test 3.1: Duplicate Buy Attempt ⚠️

**What to Watch For:**
- Alpha buys same token twice
- Bot already has open position
- Bot should skip duplicate (or handle gracefully)

**Expected Behavior:**
- Bot should skip if position already open
- Or handle as size increase if within time window

**Success Criteria:**
- ✅ No duplicate positions created
- ✅ Bot handles gracefully (skip or update)

**How to Test:**
- Monitor for alpha buying same token multiple times
- Verify bot behavior

---

### Test 3.2: RPC Failure During Price Check ⚠️

**Setup:**
1. Bot has open position
2. Temporarily break RPC connection
3. Bot should retry and handle gracefully

**Expected Behavior:**
- Bot retries price fetch
- Dead token exit triggers if failures persist
- No crash or infinite loop

**Success Criteria:**
- ✅ Bot retries on RPC failure
- ✅ Dead token exit triggers after 60s
- ✅ Bot continues operating

**How to Test:**
- Create position with `/force_buy`
- Temporarily modify RPC URL to invalid endpoint
- Wait 60s and verify dead token exit

---

### Test 3.3: Jupiter API 429 Rate Limit ⚠️

**What to Watch For:**
- Jupiter API returns 429 Too Many Requests
- Bot should retry with backoff

**Expected Behavior:**
- Bot retries with exponential backoff
- Trade eventually succeeds or fails gracefully

**Success Criteria:**
- ✅ Bot handles 429 errors gracefully
- ✅ Retries with backoff
- ✅ No infinite retry loop

**How to Test:**
- Trigger many rapid trades (if possible)
- Or monitor during high-activity periods
- Verify retry behavior

---

### Test 3.4: Position Size Clamping ⚠️

**What to Watch For:**
- Dynamic position sizing calculates value outside min/max
- Bot should clamp to MIN_BUY_SOL / MAX_BUY_SOL

**Expected Behavior:**
- Position size is clamped to boundaries
- Log shows actual size used

**Success Criteria:**
- ✅ Size never exceeds MAX_BUY_SOL
- ✅ Size never below MIN_BUY_SOL
- ✅ Buy message shows actual size

**How to Test:**
- Monitor trades with various liquidity/alpha sizes
- Verify sizes are within bounds

---

## Test Execution Checklist

### Daily Monitoring (Days 1-3)

- [ ] Check Telegram for all buy/skip messages
- [ ] Review logs for `[CLASSIFY]` decisions
- [ ] Review logs for `[GUARD]` decisions
- [ ] Verify all exits show correct PnL
- [ ] Check `/open` and `/pnl` commands
- [ ] Verify watchlist entries are correct

### Synthetic Testing (Days 4-5)

- [ ] Test dead token exit (Test 2.1)
- [ ] Test max loss protection (Test 2.2)
- [ ] Test position persistence (Test 2.3)
- [ ] Test watchlist auto-buy (Test 2.4)
- [ ] Test startup scan (Test 2.5)

### Edge Case Testing (Days 6-7)

- [ ] Test duplicate buy handling (Test 3.1)
- [ ] Test RPC failure recovery (Test 3.2)
- [ ] Test Jupiter 429 handling (Test 3.3)
- [ ] Test position size clamping (Test 3.4)

---

## Success Criteria Summary

**Before Moving to Mainnet:**

- [ ] All Phase 1 tests pass (real alpha scenarios)
- [ ] All Phase 2 tests pass (synthetic scenarios)
- [ ] All Phase 3 edge cases handled gracefully
- [ ] Zero unexpected behavior observed
- [ ] All logs match expected format
- [ ] PnL calculations are accurate
- [ ] No crashes or infinite loops
- [ ] Position persistence works correctly

**Go/No-Go Decision:**

- ✅ **GO:** All tests pass, no critical issues
- ❌ **NO-GO:** Any critical failures, unexpected behavior, or missing features

---

## Next Steps After Testing

1. **Fix any issues discovered** during testing
2. **Update checklist** with any new edge cases found
3. **Review logs** for patterns and improvements
4. **Prepare for tiny-size mainnet** ($2-5 per trade)
5. **Set up monitoring** for mainnet deployment

