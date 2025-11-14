# Mainnet Readiness Checklist v1.0

## Purpose
This checklist validates that the bot behaves correctly in paper mode before deploying with real funds. **Every item must pass before moving to mainnet.**

---

## Phase 1: Paper Mode Validation (1-2 days)

### ✅ Alpha Signal Detection

- [ ] **Test 1.1:** Alpha first buy (fresh <10s) → Bot copies within 60s
  - Expected: ✅ BUY signal detected, all guards pass, position opened
  - Log check: `[CLASSIFY] BUY` appears, `[GUARD]` all show `✅ PASS`

- [ ] **Test 1.2:** Alpha size increase ≥25% → Bot copies
  - Expected: ✅ BUY signal detected (meets MIN_SIZE_INCREASE_RATIO)
  - Log check: `size increase X.XXx >= min 0.25x`

- [ ] **Test 1.3:** Alpha dust increase <25% → Bot ignores
  - Expected: ❌ No BUY signal (below threshold)
  - Log check: `size increase X.XXx < min 0.25x` or no `[CLASSIFY] BUY`

- [ ] **Test 1.4:** Alpha SELL transaction → Bot ignores
  - Expected: ❌ No BUY signal (SOL increases, tokens decrease)
  - Log check: No `[CLASSIFY] BUY`, or `delta <= 0` in classification

- [ ] **Test 1.5:** Alpha transfer/airdrop (no SOL spent) → Bot ignores
  - Expected: ❌ No BUY signal (solSpent < DUST_SOL_SPENT)
  - Log check: `solSpent=X.XXXXXX < dust 0.001`

- [ ] **Test 1.6:** Alpha dust transaction (<0.001 SOL) → Bot ignores
  - Expected: ❌ No BUY signal
  - Log check: `solSpent=X.XXXXXX < dust 0.001`

---

### ✅ Timing Guard

- [ ] **Test 2.1:** Fresh signal (<10s old) → Bot buys
  - Expected: ✅ Time guard passes
  - Log check: `[GUARD] Time window | signalAge=X.Xs | max=60s | ✅ PASS`

- [ ] **Test 2.2:** Stale signal (>60s old) → Bot skips
  - Expected: ❌ Time guard fails
  - Log check: `[GUARD] Time window | signalAge=XX.Xs | max=60s | ❌ FAIL`
  - Telegram: "Signal too old (XX.Xs > 60s)"

- [ ] **Test 2.3:** Startup scan catches missed signals (within 5min window)
  - Expected: ✅ Bot processes recent alpha transactions on restart
  - Log check: `[SCAN]` entries appear, `✅ Startup scan complete`

---

### ✅ Entry Price Guard

- [ ] **Test 3.1:** Price within 2x alpha entry → Bot buys
  - Expected: ✅ Price guard passes
  - Log check: `[GUARD] Price guard | ratio=X.XXx | max=2.0x | ✅ PASS`

- [ ] **Test 3.2:** Price >2x alpha entry → Bot skips
  - Expected: ❌ Price guard fails
  - Log check: `[GUARD] Price guard | ratio=X.XXx | max=2.0x | ❌ FAIL`
  - Telegram: "Price X.XXx higher than alpha entry (limit 2.0x)"

- [ ] **Test 3.3:** Alpha entry price calculated correctly
  - Expected: `alphaEntryPrice = solSpent / tokenDelta` matches logs
  - Log check: `[CLASSIFY] BUY | solSpent=X.XXXX | tokens=XXXXX`

---

### ✅ Liquidity Guard

- [ ] **Test 4.1:** Sufficient liquidity ($10k+) → Bot buys
  - Expected: ✅ Liquidity guard passes
  - Log check: `[GUARD] Liquidity | liquidity=$XXXXX | min=$10000 | ✅ PASS`

- [ ] **Test 4.2:** Insufficient liquidity (<$10k) → Bot skips + watchlist
  - Expected: ❌ Liquidity guard fails, token added to watchlist
  - Log check: `[GUARD] Liquidity | liquidity=$XXXX | min=$10000 | ❌ FAIL`
  - Telegram: "Added to watchlist (low_liquidity)"
  - Command: `/watchlist` shows the token

- [ ] **Test 4.3:** DexScreener API failure → Bot still trades (fails open)
  - Expected: ✅ Bot proceeds if DexScreener returns 429/500
  - Log check: `[LIQ]` errors appear, but trade continues

---

### ✅ Rug Checks

- [ ] **Test 5.1:** Authority not revoked → Bot skips
  - Expected: ❌ Rug check fails
  - Telegram: "authority_not_revoked: mint/freeze authority still active"

- [ ] **Test 5.2:** High tax token (>5%) → Bot skips
  - Expected: ❌ Rug check fails
  - Telegram: "excessive_tax_XXXbps"

- [ ] **Test 5.3:** No route available → Bot skips + watchlist
  - Expected: ❌ Rug check fails, token added to watchlist
  - Telegram: "no_route_buy" + watchlist notification

- [ ] **Test 5.4:** All rug checks pass → Bot proceeds
  - Expected: ✅ Rug checks pass, trade executes

---

### ✅ Exit Safety Stack

- [ ] **Test 6.1:** Early TP hit (+30%) → Partial sell (if enabled) + trailing mode
  - Expected: ✅ Early TP message, position switches to trailing
  - Log check: `🎯 Early TP hit`, `Switching to trailing stop...`
  - Telegram: Early TP notification

- [ ] **Test 6.2:** Trailing stop trigger (20% from high) → Full exit
  - Expected: ✅ Exit executed when price drops 20% from peak
  - Log check: `🛑 Trailing stop exit`
  - Telegram: Winner/Loser card with correct PnL

- [ ] **Test 6.3:** Sentry abort (-22% within 2min) → Force exit
  - Expected: ✅ Sentry exits position within 120s window
  - Log check: `🚨 Sentry abort: DD: XX.X%`
  - Telegram: Sentry exit notification

- [ ] **Test 6.4:** Dead token detection (>60s no price) → Force exit
  - Expected: ✅ Bot exits when price unavailable for >60s
  - Log check: `[EXIT] Dead token detected - forcing exit`
  - Telegram: "Dead token auto-exit: Price unavailable for >60s"

- [ ] **Test 6.5:** Max loss protection (-20%) → Force exit
  - Expected: ✅ Bot exits at -20% loss threshold
  - Log check: `[EXIT] Max loss protection triggered: -XX.X%`
  - Telegram: "Max loss protection: Loss: -XX.X% (limit: -20%)"

- [ ] **Test 6.6:** PnL calculation accuracy
  - Expected: ✅ PnL % matches USD profit/loss calculation
  - Verification: `pnlPct = (exitUsd - entryUsd) / entryUsd * 100`
  - No more +99,451,772,323% errors

---

### ✅ Watchlist System

- [ ] **Test 7.1:** Illiquid token added to watchlist
  - Expected: ✅ Token appears in watchlist after skip
  - Command: `/watchlist` shows entry with reason

- [ ] **Test 7.2:** Watchlist auto-buy when liquidity appears
  - Expected: ✅ Bot buys token when liquidity reaches threshold
  - Log check: `👀 Watchlist ready`, `🔁 Watchlist auto-buy`
  - Telegram: Watchlist ready notification

- [ ] **Test 7.3:** Watchlist entry expires after 3 days
  - Expected: ✅ Old entries removed automatically
  - Log check: `⌛️ Removed from watchlist (expired)`

---

### ✅ Position Persistence

- [ ] **Test 8.1:** Positions survive bot restart
  - Expected: ✅ Open positions reloaded from `data/positions.json`
  - Verification: Restart bot, check `/open` command shows same positions

- [ ] **Test 8.2:** Positions auto-save on every trade
  - Expected: ✅ `data/positions.json` updated after buy/exit
  - File check: Timestamp updates on disk

---

### ✅ Dynamic Position Sizing

- [ ] **Test 9.1:** Position size adjusts based on liquidity
  - Expected: ✅ Size varies between MIN_BUY_SOL and MAX_BUY_SOL
  - Log check: Buy message shows actual size used
  - Telegram: Shows sized amount, not just base BUY_SOL

- [ ] **Test 9.2:** Watchlist retries use smaller size
  - Expected: ✅ Watchlist auto-buys use 0.5x multiplier
  - Log check: Size is reduced for watchlist source

---

## Phase 2: Go/No-Go Criteria

### ✅ Zero-Tolerance Failures (Must Pass 100%)

Before mainnet, verify **ZERO** occurrences of:

- [ ] Bot buys >2x alpha entry (price guard should block)
- [ ] Bot enters >60s after alpha transaction (time guard should block)
- [ ] Bot ignores clear alpha BUY that passes all guards
- [ ] Sentry/SL should fire but doesn't (exit safety failure)
- [ ] PnL % shows impossible values (>1000% or <-100%)
- [ ] Bot holds dead token >60s without exiting
- [ ] Bot holds position past -20% loss without max-loss exit

### ✅ Log Quality Check

- [ ] Every skip has a clear reason in logs
- [ ] Every guard decision is logged with `[GUARD]` prefix
- [ ] Every exit shows which path fired (TP/trailing/sentry/dead/max-loss)
- [ ] Classification shows `[CLASSIFY] BUY` or `[CLASSIFY] SELL` or reason for ignore

### ✅ Telegram Notification Quality

- [ ] All buy notifications show correct size and entry price
- [ ] All exit notifications show correct PnL (USD + %)
- [ ] Winner/Loser cards are accurate
- [ ] Skip messages explain why clearly

---

## Phase 3: Mainnet Deployment (After Paper Passes)

### Pre-Launch Checklist

- [ ] All Phase 1 tests passed
- [ ] All Phase 2 criteria met (zero failures)
- [ ] `.env` configured with live wallet and RPC
- [ ] `TRADE_MODE=live` set
- [ ] `BUY_SOL` set to small size ($2-5 equivalent)
- [ ] `MIN_BUY_SOL` and `MAX_BUY_SOL` configured appropriately
- [ ] Telegram notifications working
- [ ] PM2 process manager configured
- [ ] Logs directory writable
- [ ] `data/` directory exists and writable

### First Week Mainnet Monitoring

- [ ] Monitor first 10 trades closely
- [ ] Verify all exits fire correctly
- [ ] Check PnL accuracy on every trade
- [ ] Watch for any unexpected behavior
- [ ] Keep verbose logging enabled (`DEBUG_TX=true`)
- [ ] Review logs daily for anomalies

### Scaling Criteria

Only increase position size after:

- [ ] 20+ successful trades in mainnet
- [ ] All exit paths validated in live conditions
- [ ] No unexpected behavior observed
- [ ] PnL tracking accurate
- [ ] Bot handles chain stress (busy hours) correctly

---

## Phase 4: Optional Infrastructure Upgrades

### Multi-RPC Failover

- [ ] Implement RPC rotation on failure
- [ ] Health scoring for RPC endpoints
- [ ] Automatic failover logic

### Jito Bundle Support

- [ ] Integrate Jito bundle submission
- [ ] Test bundle inclusion rates
- [ ] Monitor slippage improvement

### Enhanced Monitoring

- [ ] Add metrics dashboard
- [ ] Set up alerting for critical errors
- [ ] Performance monitoring

---

## Sign-Off

**Paper Testing Completed By:** _________________  
**Date:** _________________  
**Tests Passed:** ___ / ___  
**Zero-Tolerance Failures:** ✅ / ❌  
**Ready for Mainnet:** ✅ / ❌  

**Mainnet Launch Date:** _________________  
**Initial Position Size:** $_____  
**Reviewed By:** _________________

---

## Notes

- Keep this checklist updated as you test
- Add any edge cases discovered during testing
- Document any unexpected behavior for review
- Don't rush to mainnet - thorough testing prevents costly mistakes

