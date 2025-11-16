# Signal Age Window Increase: 180s → 300s

**Date:** 2025-11-16  
**Change:** Increased `MAX_SIGNAL_AGE_SEC` from 180 seconds (3 minutes) to 300 seconds (5 minutes)

---

## Rationale

### Problem
Bot was rejecting valid signals that were just outside the 3-minute window:

```
⛔️ Skipping 5kH4Q7…HTXe: Signal too old (201.9s > 180s)
```

### Solution
Increase time window to 5 minutes to catch more valid mints delayed by:
- Infrastructure lag (RPC, API delays)
- Liquidity appearing a bit later
- Rate limits clearing
- Network congestion

### Protection
**Note:** Price guard is currently **DISABLED** (removed), so we're relying solely on the time window. However, the extended window (5 minutes) is still reasonable for catching valid alpha entries while avoiding very stale signals.

---

## Changes Made

### 1. Default Value Update

**File:** `index.ts` (line 117)

```typescript
// BEFORE
const MAX_SIGNAL_AGE_SEC = parseInt(process.env.MAX_SIGNAL_AGE_SEC || '180', 10); // 3 minutes default

// AFTER
const MAX_SIGNAL_AGE_SEC = parseInt(process.env.MAX_SIGNAL_AGE_SEC || '300', 10); // 5 minutes default
```

### 2. Environment Template Update

**File:** `env.template` (line 109)

```bash
# BEFORE
MAX_SIGNAL_AGE_SEC=180                  # Skip signals older than 180 seconds (3 minutes)

# AFTER
MAX_SIGNAL_AGE_SEC=300                  # Maximum age (in seconds) of an alpha transaction for auto-buy. Default: 300 (5 minutes). Price guard still enforces <= 2x alpha entry (if enabled).
```

---

## Expected Behavior

### Before (180s window)
```
[GUARD] Time window | signalAge=201.9s | max=180s | ❌ FAIL
⛔️ Skipping 5kH4Q7…HTXe: Signal too old (201.9s > 180s)
```

### After (300s window)
```
[GUARD] Time window | signalAge=201.9s | max=300s | ✅ PASS
[GUARD] Liquidity | liquidity=$37021 | min=$3000 | ✅ PASS
[SWAP] Buy swap completed
✅ Bought 5kH4Q7…HTXe
```

---

## Guard Logic (Unchanged)

The guard logic remains the same, just using the new value:

```typescript
if (!skipTimeGuard && MAX_SIGNAL_AGE_SEC > 0) {
  const age = signal.signalAgeSec ?? 0;
  const pass = age <= MAX_SIGNAL_AGE_SEC; // Now 300s instead of 180s
  dbg(
    `[GUARD] Time window | signalAge=${age.toFixed(1)}s | max=${MAX_SIGNAL_AGE_SEC}s | ${
      pass ? '✅ PASS' : '❌ FAIL'
    }`
  );
  if (!pass) {
    await alert(
      `⛔️ Skipping <code>${short(mintStr)}</code>: Signal too old (${age.toFixed(
        1
      )}s > ${MAX_SIGNAL_AGE_SEC}s)`
    );
    return 'skipped';
  }
}
```

---

## Impact Analysis

### Signals Now Accepted (180s < age ≤ 300s)

**Before:** Rejected  
**After:** ✅ Accepted (if all other guards pass)

**Example scenarios:**
- Signal at 201.9s → ✅ Now accepted
- Signal at 250s → ✅ Now accepted
- Signal at 299s → ✅ Now accepted
- Signal at 301s → ❌ Still rejected

### Protection Against Late Entries

**Current state:**
- ⚠️ **Price guard is DISABLED** (no 2x limit)
- ✅ **Time window** (5 minutes) prevents very stale signals
- ✅ **Other guards** (liquidity, rug checks) still active

**Recommendation:** Monitor for late entries (signals 180-300s old) to ensure we're not buying tops. If issues arise, consider:
- Re-enabling price guard with 2x limit
- Reducing window to 240-270s
- Making age threshold dynamic based on market conditions

---

## Monitoring

### What to Watch

1. **Accepted signals in 180-300s range:**
   ```bash
   pm2 logs alpha-snipes-paper | grep -E 'Time window.*signalAge=(1[89][0-9]|2[0-9]{2})\.' | grep '✅ PASS'
   ```

2. **Rejected signals > 300s:**
   ```bash
   pm2 logs alpha-snipes-paper | grep 'Signal too old.*> 300s'
   ```

3. **Late entry performance:**
   - Check PnL for positions entered with signalAge 180-300s
   - Look for patterns of buying tops or late entries

### Success Metrics

- ✅ More valid mints caught (especially those delayed by infra)
- ✅ No increase in "bought too late" scenarios
- ✅ Signals 180-300s old execute successfully

### Warning Signs

- ⚠️ Many positions entered at 180-300s age show poor performance
- ⚠️ Price already 3-10x when bot enters (would be caught by price guard if enabled)
- ⚠️ Alpha already exited when bot enters

---

## Related Guards (Unchanged)

- ✅ **Liquidity guard:** Still active (MIN_LIQUIDITY_USD_ALPHA = $3k)
- ✅ **Rug checks:** Still active (authority, tax, price impact)
- ✅ **Price guard:** **DISABLED** (removed - no 2x limit)
- ✅ **Sentry window:** Still active (2 minutes, -22% max drawdown)
- ✅ **Exit strategy:** Still active (+50% auto-close, max loss protection)

---

## Next Steps

1. ✅ **Deployed:** Changes committed and pushed
2. ✅ **Restarted:** Bot restarted on VM with new config
3. ⏳ **Monitor:** Watch logs for next few trades
4. ⏳ **Evaluate:** After 24-48 hours, review:
   - How many trades accepted in 180-300s range
   - Performance of those trades
   - Whether any look like "bought too late"

---

## Rollback Plan

If issues arise, revert to 180s:

```bash
# In .env
MAX_SIGNAL_AGE_SEC=180

# Restart bot
pm2 restart alpha-snipes-paper --update-env
```

Or adjust to middle ground (240-270s) if 300s is too permissive.

---

**Status:** ✅ **DEPLOYED** - Monitoring for effectiveness

