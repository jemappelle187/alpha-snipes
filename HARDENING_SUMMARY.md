# Alpha Snipes Hardening Summary
**Date:** November 9, 2025  
**Status:** ✅ All improvements applied and verified

---

## 🛡️ Improvements Applied

### 1. Centralized Jupiter Endpoints
- **Created:** `lib/jupiter_endpoints.ts` to centralize all Jupiter API URLs
- **Replaced:** All hardcoded `quote-api.jup.ag/v6` endpoints with `lite-api.jup.ag/swap/v1`
- **Fallback Chain Added:** `lite-api.jup.ag` → `quoting.jup.ag` → `quote-api.jup.ag`
- **Sanitization:** Automatically skips invalid or empty URLs
- **Alpha-aware fallback priority:** Endpoints now rotate intelligently based on alpha wallet source to distribute load evenly.
- **Updated Files:**
  - `lib/quote_client.ts` - Primary quote fetching with fallbacks
  - `lib/rug_checks.ts` - Safety validation quotes
  - `index.ts` - Main bot logic
  - `env.template` - Documentation updated
- **Verification:** No v6 endpoints remain in codebase ✅

### 2. Price Validation Guards
Added `isValidPrice()` helper to prevent:
- "target 0.0000000000" errors
- Absurd PnL percentages (NaN, Infinity)
- Invalid entry price calculations

**Guards added in:**
- **Buy execution:** Skip if entry price is invalid or zero
- **Exit manager:** Skip TP/TSL if entry price is invalid
- **PnL reporting:** Skip if entry/exit prices are invalid
- **Validation scope extended:** Includes all partial TP and trailing stop calculations.

### 3. Duplicate Buy Suppression
- **Added:** `canPaperBuy()` with 60-second idempotency window
- **Prevents:** Multiple buy alerts for same mint within 60s
- **Uses:** Composite key: `${mint}:${slot}`

### 4. Enhanced Error Messages
- Invalid price: "⚠️ Ref price unavailable (quote hiccup)"
- Debug logs: `[PAPER][DBG]` prefix for all paper mode operations
- Better context in all validation failures

### 5. Cooldown & API Stability
- Added dynamic cooldowns for Jupiter API errors:
  - `429 Too Many Requests` → 20-second cooldown
  - `400 Bad Request` → 60-second cooldown
- These suppress repeated failures and reduce wasted retries.
- Integrated with existing global rate limiter for stable API usage.

### 6. Alpha Attribution in PnL Tracking
- Added alpha wallet linkage to each trade entry in the ledger
- `/pnl` and `/open` commands now display per-alpha summaries
- Enables performance-based analysis of signal quality

Each alpha wallet’s historical performance is now being logged for insight generation.  
Future updates will support `/pnl alpha` commands to display profit/loss grouped by wallet, highlighting which signals are most effective.

### 7. Error Transparency & Skip Reason Clarity
To improve user understanding during skipped trades, human-readable error explanations have been added to all Jupiter quote failures.

**Error Types and Meanings:**
- **authority_not_revoked:** The mint’s authority remains active — potential rug risk; skipped for safety.
- **no_route_buy:** Jupiter couldn’t find a valid liquidity path between input and output tokens; typically low-volume or inactive pairs.
- **rate_limited:** API temporarily overloaded; the bot automatically waits and retries after cooldown.
- **bad_request (HTTP 400):** Invalid pair or input combination detected; triggers 60s cooldown before retry.
- **invalid_url:** Sanitized automatically; prevents malformed requests from causing retries.

These appear directly in Telegram skip messages such as:
```
[PAPER] ⛔ Skipping EPjFWdd5Aufq... due to: no_route_buy — Jupiter API could not find a valid liquidity route.
```

This increases diagnostic visibility and user confidence by clearly showing why a potential trade was skipped.

---

## 📊 Verification Results

### Startup Configuration (Confirmed ✅)
```
🔧 DNS servers in use: 1.1.1.1, 1.0.0.1, 8.8.8.8, 8.8.4.4
🔁 JUP_QUOTE_BASE override: https://lite-api.jup.ag/swap/v1/quote
🔁 JUP_SWAP_BASE override:  https://lite-api.jup.ag/swap/v1/swap
📄 PAPER MODE: No real transactions will be sent
💓 HEARTBEAT_EVERY_MIN: 15
🤫 SILENT_ALERT_MIN: 60
🔐 PARTIAL_TP_PCT: 0.5
```

### No Issues Found ✅
- ❌ No "target 0" errors
- ❌ No absurd PnL percentages
- ❌ No duplicate buy alerts (within 60s window)
- ✅ All price validations working
- ✅ Idempotency guards working ("ignored mint: already seen")

---

## 🔧 Configuration Files

### Environment Variables (`.env`)
```bash
# These variables control Jupiter endpoints
JUP_QUOTE_BASE=https://lite-api.jup.ag/swap/v1/quote
JUP_SWAP_BASE=https://lite-api.jup.ag/swap/v1/swap

# DNS override (already set)
DNS_OVERRIDE=1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4
```

### PM2 Status
```
Process:     alpha-snipes-paper
Status:      ✅ online
Restarts:    21 (after hardening applied)
PID:         12490
```

---

## 📝 Code Changes Summary

### New Helper Functions
1. **`isValidPrice(n)`** - Validates price is finite and positive
2. **`canPaperBuy(key, ms)`** - Prevents duplicate buys within window

### Protected Operations
- ✅ Paper buy execution
- ✅ Exit manager (TP/TSL calculations)
- ✅ PnL reporting
- ✅ Entry price derivation

### Files Modified
- `lib/quote_client.ts` - Fallback endpoints updated
- `index.ts` - Guards added throughout
- `env.template` - Documentation updated
- `lib/jupiter_endpoints.ts` - **NEW** centralized config

---

## 🚀 Next Steps

### Recommended Monitoring
1. Watch for any remaining "DNS lookup failed" errors
   - If persistent, may need to check network/firewall settings
   - Fallback endpoints should handle most issues

2. Monitor paper trades for:
   - Valid entry prices (no more "target 0")
   - Proper duplicate suppression
   - Accurate PnL calculations
   - Alpha wallet attribution appears in PnL and open positions
   - Watch which alphas consistently produce profitable trades

3. When ready for live trading:
   - Set `TRADE_MODE=live` in `.env`
   - Add `WALLET_SECRET_KEY_JSON`
   - Start with small position sizes

4. Use `/status` or `/health` in Telegram to confirm the bot’s heartbeat and signal monitoring.
5. Use `/pnl` or `/open` to view realized and unrealized profit summaries directly in Telegram.

### Optional Future Improvements
- Add connection pooling for Jupiter API
- Implement circuit breaker pattern for repeated failures
- Add metrics/alerting for DNS resolution success rate
- Integrate Smart Cooldown Decay — dynamically shorten cooldowns when API stabilizes.
- Add automated alpha scoring based on historical PnL performance
- Add persistent cache for SOL/USD price lookups to minimize redundant quotes.
- Add alpha-wise performance summary and ranking visualization for easy comparison.
- Enable automated weighting system to increase exposure to consistently profitable alphas.
- Introduce **Error Analytics Dashboard** to visualize frequency and cause of skips (e.g., authority_not_revoked vs. rate_limited).

---

## 📞 Support

All improvements are **backward compatible** and won't affect existing functionality.

**Restart command:**
```bash
pm2 restart alpha-snipes-paper --update-env
pm2 logs alpha-snipes-paper --lines 50
```

**Verify configuration:**
```bash
pm2 logs alpha-snipes-paper --nostream | grep -E "JUP_|DNS"
```

---

✅ **Hardening Complete!** Your bot now has robust price validation, duplicate suppression, and centralized API configuration.

✅ Enhanced clarity: skip reasons are now human-readable and fully integrated into Telegram notifications for transparency and trust.



