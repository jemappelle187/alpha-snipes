# Rate Limit Tuning

> **📚 This content has moved to organized documentation.**  
> See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for rate limiting architecture and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for 429 error handling.  
> Also see: [docs/CONFIG_REFERENCE.md](docs/CONFIG_REFERENCE.md), [docs/CHANGELOG.md](docs/CHANGELOG.md)

---

**Date:** November 10, 2025  
**Status:** ✅ Applied - More conservative settings

---

## 🎯 Changes Applied

### 1. **Reduced Global Burst Limit**
```typescript
// Before
const GLOBAL_MAX_CALLS = 8;  // 8 quotes/sec

// After  
const GLOBAL_MAX_CALLS = 6;  // 6 quotes/sec (25% reduction)
```

**Impact:**
- Lower peak burst rate
- Less likely to trigger Jupiter's rate limiter
- Still sufficient for normal operation

---

### 2. **Increased Per-Key Cooldown**
```typescript
// Before
const PER_KEY_MIN_GAP_MS = 1500;  // 1.5s cooldown

// After
const PER_KEY_MIN_GAP_MS = 2200;  // 2.2s cooldown (47% increase)
```

**Impact:**
- Longer gap between identical quote requests
- Reduces redundant API calls
- Better protection against accidental spam

---

### 3. **Added 429 Jittered Backoff**
```typescript
if (resp.status === 429) {
  // Wait 300-700ms before trying next base
  await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
}
```

**Impact:**
- Graceful handling of rate limit errors
- Randomized delay reduces thundering herd
- Allows cooldown before next endpoint

---

## 📊 Rate Limit Comparison

### Old Settings (Before)
```
Global:  8 calls/sec (1000ms window)
Per-Key: 1.5s minimum gap
429 Handling: None (immediate retry on next base)
```

**Characteristics:**
- Aggressive burst capability
- Quick retry on failures
- Higher 429 risk during high activity

### New Settings (After)
```
Global:  6 calls/sec (1000ms window)  ↓ 25%
Per-Key: 2.2s minimum gap              ↑ 47%
429 Handling: 300-700ms jittered sleep ✨ NEW
```

**Characteristics:**
- Conservative burst capability
- Measured retry with backoff
- Lower 429 risk, better API citizenship

---

## 🎯 When These Limits Activate

### Scenarios
1. **Multiple new mints discovered simultaneously**
   - Each mint triggers rug checks (3-5 quotes)
   - Global limit prevents overwhelming API

2. **Multiple positions in exit management**
   - Each position checks price every 5s
   - Per-key cooldown prevents redundant checks

3. **Burst activity from alpha wallet**
   - Rapid transactions trigger many evaluations
   - Both limits work together to smooth traffic

---

## 📈 Expected Behavior

### Normal Operation
- Most quote calls go through immediately
- Rate limits rarely triggered
- Transparent to user

### High Activity Periods
- Some calls may hit per-key cooldown
- Returns `quote-skipped-rate-limit` error
- Caller handles gracefully (skips or waits)

### During 429 Response
1. Receive 429 from Jupiter
2. Wait 300-700ms (jittered)
3. Try next fallback endpoint
4. Continue until success or exhausted

---

## 🔧 Tuning Guidelines

### If Still Seeing 429 Errors

**Further reduce burst:**
```typescript
const GLOBAL_MAX_CALLS = 4;  // Even more conservative
```

**Increase cooldown:**
```typescript
const PER_KEY_MIN_GAP_MS = 3000;  // 3 second gap
```

**Add longer 429 backoff:**
```typescript
if (resp.status === 429) {
  await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));  // 0.5-1.5s
}
```

---

### If Quotes Too Slow

**Slightly increase burst:**
```typescript
const GLOBAL_MAX_CALLS = 7;  // Middle ground
```

**Reduce cooldown slightly:**
```typescript
const PER_KEY_MIN_GAP_MS = 1800;  // 1.8s gap
```

---

## 🎯 Integration with Other Features

### Works With
- ✅ **Sanitized base URLs** - Only tries valid endpoints
- ✅ **Fallback system** - Tries multiple endpoints on failure
- ✅ **DNS override** - Stable DNS resolution
- ✅ **Retry logic** - Exponential backoff between attempts
- ✅ **Alpha Impact Integration** - Future PnL and rate limit dashboards will correlate quote volume with alpha wallet performance

### Rate Limit Flow
```
Request
  ↓
Check Per-Key (2.2s) → SKIP if too soon
  ↓
Check Global (6/sec) → SKIP if burst limit
  ↓
Try Endpoint #1
  ↓ (if 429)
Wait 300-700ms
  ↓
Try Endpoint #2
  ↓
Try Endpoint #3
  ↓
Return result or error
  ↓
Log attribution → alpha + quote base
```

---

## 📊 Performance Impact

### Latency
- **Normal calls:** No change (0ms overhead)
- **Rate-limited:** Fast fail (<1ms)
- **429 backoff:** +300-700ms per 429

### Throughput
- **Before:** Up to 8 quotes/sec burst
- **After:** Up to 6 quotes/sec burst
- **Sustained:** ~3-4 quotes/sec typical

### Success Rate
- **Expected improvement:** 20-30% fewer 429 errors
- **Trade-off:** Slightly lower burst capability
- **Overall:** Better reliability

---

## 🚨 Monitoring

### Check Rate Limit Activity
```bash
# See rate-limited calls (if any)
pm2 logs alpha-snipes-paper --nostream | grep "rate-limit"

# See 429 errors
pm2 logs alpha-snipes-paper --nostream | grep "429"
```

### Debug Mode
```bash
# Enable detailed quote logging
DEBUG_QUOTE=1 pm2 restart alpha-snipes-paper --update-env
```

---

## ✅ Verification

### Startup
```
✅ Bot restarted successfully
✅ No errors during initialization
✅ Rate limits applied automatically
```

### Current Status
```
Process:    alpha-snipes-paper
Status:     online
Restarts:   29
Rate Limit: 6 calls/sec, 2.2s cooldown
429 Handler: Active with jittered backoff
```

---

## 💡 Best Practices

### For Developers

1. **Don't bypass rate limits** - They protect the API
2. **Use cache when possible** - `getSolUsd()` has 60s cache
3. **Handle rate-limit errors gracefully** - Skip or wait, don't retry immediately
4. **Monitor 429 frequency** - Tune if needed

### For Production

1. **Start conservative** - Current settings are good baseline
2. **Monitor for 2-3 days** - Collect data on 429 frequency
3. **Tune gradually** - Small adjustments, measure impact
4. **Document changes** - Track what works
5. **Coordinate with PnL Analytics** - Use /pnl and /open trends to identify which alphas cause most API load versus profit contribution.

---

## 🧠 Error Transparency Improvements
To help users understand skipped or failed quotes, human-readable explanations have been integrated across all Jupiter-related errors.

**Error Categories:**
- **authority_not_revoked:** Mint authority is still active (token unsafe to trade).
- **no_route_buy:** Jupiter found no liquidity route for this pair (illiquid or disabled).
- **rate_limited:** Temporary Jupiter API throttling — retrying after cooldown.
- **bad_request (HTTP 400):** Temporary endpoint issue; pair unavailable.
- **invalid_url:** Invalid or empty base URL; automatically sanitized and skipped.

**Example Telegram Skip Message:**
```
[PAPER] ⛔️ Skipping EPjFWdd5Aufq... due to: no_route_buy — Jupiter API could not find a valid liquidity route.
```

These explanations now appear automatically in Telegram skip notifications and logs, providing better diagnostic clarity for the user.

---

## 🔄 Rollback (If Needed)

If these settings cause issues, revert:

```typescript
// lib/quote_client.ts
const GLOBAL_MAX_CALLS = 8;
const PER_KEY_MIN_GAP_MS = 1500;

// Remove 429 handling (or comment out)
if (resp.status === 429) {
  // await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
}
```

Then restart:
```bash
pm2 restart alpha-snipes-paper --update-env
```

---

## 📈 Future Enhancements

### Adaptive Rate Limiting (v2)
- Track 429 frequency over time
- Auto-adjust limits based on success rate
- Increase during low activity, decrease during 429s

### Priority Queue (v2)
- Critical quotes (rug checks) get priority
- Monitoring quotes (exit manager) can wait
- Separate limits for each priority

### Per-Endpoint Limits (v2)
- Track success rate per endpoint
- Route around problematic endpoints
- Maintain per-endpoint cooldowns

### Alpha-Aware Throttling (v3)
- Dynamically adjusts rate limits based on alpha wallet reliability
- More trusted alphas receive higher priority and faster quote throughput
- Helps prevent good signal starvation during network congestion

### Alpha Attribution Analytics (v3)
- Aggregate rate-limit and performance data per alpha wallet
- Identify which alphas trigger most quote volume vs. highest profits
- Integrate with `/pnl alpha` command for detailed insights
- Potential to automatically deprioritize noisy alphas or reward profitable ones
- Visual dashboard planned in `data/analytics/` for long-term tracking
- Include correlation between skip reasons (authority_not_revoked, rate_limited, etc.) and alpha performance to assess alpha reliability under real trading pressure.

---

✅ **Rate Limits Tuned!** Your bot now has more conservative settings that should reduce 429 errors while maintaining good responsiveness.

✅ Skip messages are now human-readable and educational, helping users understand root causes like liquidity gaps, authority locks, or rate limits in real time.
