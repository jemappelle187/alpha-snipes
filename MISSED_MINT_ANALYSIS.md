# Missed Mint Analysis: 2LMn2pUdKoHvreQrcYYhcD5CXYXfn7WqYA4SyLSfrNJD

**Date:** 2025-11-16  
**Mint:** `2LMn2pUdKoHvreQrcYYhcD5CXYXfn7WqYA4SyLSfrNJD`  
**Alpha:** `4rNgv2…UHrA`  
**Issue:** Bot detected mint but was too late to capture it

---

## Timeline

### 23:11:36 - First Detection
```
[CLASSIFY] BUY | source=rpc | method=token_balances | Alpha: 4rNgv2…UHrA | Mint: 2LMn2p…rNJD
[HANDLE] Calling executeCopyTradeFromSignal for 2LMn2p…rNJD | Alpha: 4rNgv2…UHrA | TX: 249akxV1
[NOTIFY] Sending "Alpha touched" message for 2LMn2p…rNJD
```

**Status:** ✅ Detected, but no buy executed (no guard logs found)

### 23:14:13 - Watchlist Entry
```
[WATCHLIST] waiting 2LMn2p…rNJD | liquidity=$0 | min=4000
```

**Status:** Added to watchlist (liquidity too low at detection time)

### 23:16:01 - Liquidity Appeared
```
[LIQ] DexScreener: $28966 liquidity, $804 24h volume for 2LMn2pUd...
[WATCHLIST] skipping 2LMn2p…rNJD | volume24h=$804 | min=$1000 (insufficient trading activity)
```

**Status:** ❌ Watchlist rejected - liquidity OK ($28,966) but volume too low ($804 < $1000)

### 23:16:39 - Second Detection (Too Late)
```
[CLASSIFY] BUY | source=rpc | method=token_balances | Alpha: 4rNgv2…UHrA | Mint: 2LMn2p…rNJD
[HANDLE] Calling executeCopyTradeFromSignal for 2LMn2p…rNJD | Alpha: 4rNgv2…UHrA | TX: 249akxV1
```

**Status:** ❌ Same transaction detected again (5+ minutes old) - likely rejected by signal age guard

---

## Root Causes

### 1. Initial Detection Failed (23:11:36)

**Problem:** Bot detected the mint and called `executeCopyTradeFromSignal`, but no buy was executed.

**Possible reasons:**
- ❓ **Liquidity guard failed** - Liquidity was likely $0 or very low at detection time
- ❓ **Signal age guard failed** - Transaction might have been older than 180s when first detected
- ❓ **Rug checks failed** - Authority/tax/route validation might have failed
- ❓ **Price guard failed** - Reference price unavailable

**Missing logs:** No `[GUARD]` logs found for the first execution attempt, which suggests:
- The execution might have failed silently
- Or logs were truncated/not captured

### 2. Watchlist Volume Check Too Strict (23:16:01)

**Problem:** When liquidity appeared ($28,966), watchlist rejected it due to low 24h volume ($804 < $1000).

**Current logic:**
```typescript
if (volume24h < WATCHLIST_MIN_VOLUME_24H_USD) { // $1000
  // Skip - insufficient trading activity
}
```

**Issue:** For newly launched tokens, 24h volume is misleading:
- Token might be < 1 hour old
- 24h volume reflects only a few hours of trading
- $804 volume in first hour is actually good activity

**Fix needed:** Check volume relative to pair age, not absolute 24h volume.

### 3. Signal Age Guard (23:16:39)

**Problem:** Transaction was detected again 5+ minutes after it occurred.

**Current limit:** `MAX_SIGNAL_AGE_SEC = 180` (3 minutes)

**Issue:** By the time the bot detected it the second time, it was already > 5 minutes old, so it was rejected.

**Why detected twice:**
- First: Real-time detection (onLogs or polling)
- Second: Polling backup or startup scan caught it again

---

## Recommendations

### 1. Fix Watchlist Volume Check

**Current:** Absolute 24h volume check
```typescript
if (volume24h < WATCHLIST_MIN_VOLUME_24H_USD) { // $1000
  // Reject
}
```

**Proposed:** Volume relative to pair age
```typescript
const pairAgeHours = pairCreatedAt ? (Date.now() - pairCreatedAt) / (1000 * 60 * 60) : 24;
const volumePerHour = volume24h / Math.max(pairAgeHours, 1);

// For new pairs (< 6 hours), require lower volume
const minVolume = pairAgeHours < 6 
  ? WATCHLIST_MIN_VOLUME_24H_USD * (pairAgeHours / 6) // Scale down for new pairs
  : WATCHLIST_MIN_VOLUME_24H_USD;

if (volume24h < minVolume) {
  // Reject
}
```

**Or:** Remove volume check for pairs < 6 hours old (volume is unreliable for new tokens).

### 2. Improve Initial Detection Logging

**Problem:** No guard logs for first execution attempt.

**Fix:** Ensure all guard failures are logged, even if execution fails early.

### 3. Increase Signal Age Window (Optional)

**Current:** `MAX_SIGNAL_AGE_SEC = 180` (3 minutes)

**Consider:** Increase to 5 minutes (300s) for alpha signals to catch slightly delayed detections.

**Trade-off:** Longer window = more stale signals, but catches more legitimate trades.

### 4. Add Real-Time Detection Monitoring

**Problem:** Transaction detected 5+ minutes late.

**Fix:** 
- Monitor detection latency
- Alert if detection > 60 seconds after transaction
- Investigate why onLogs() missed it

---

## Expected Behavior After Fixes

### Scenario: New Token with Low Initial Volume

1. **23:11:36** - Alpha buys token
2. **23:11:36** - Bot detects (real-time)
3. **23:11:36** - Liquidity check: $0 → Add to watchlist
4. **23:16:01** - Liquidity appears: $28,966
5. **23:16:01** - Volume check: $804 in 1 hour = good activity → ✅ **BUY**

**Result:** Bot buys when liquidity appears, even if 24h volume is low (because token is new).

---

## Immediate Action Items

1. ✅ **Fix watchlist volume check** - Use relative volume for new pairs
2. ✅ **Add detection latency monitoring** - Track time from transaction to detection
3. ✅ **Improve guard logging** - Ensure all failures are logged
4. ⚠️ **Consider increasing signal age** - 180s → 300s for alpha signals

---

**Status:** Analysis complete, fixes ready to implement.

