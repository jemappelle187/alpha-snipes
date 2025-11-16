# Liquidity Fix Verification Guide

**Date:** 2025-11-16  
**Status:** ✅ Fix Applied - Ready for Verification

---

## Quick Verification Commands

### 1. Monitor Liquidity Logs

```bash
# On VM
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 100 | grep -E '\[LIQ\]|\[GUARD\] Liquidity|\[WATCHLIST\]'"
```

### 2. Watch for Copy Trade Executions

```bash
# On VM
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 200 | grep -E 'Copy trade|✅ Bought|❌ Copy trade failed'"
```

### 3. Check for Any Liquidity Errors

```bash
# On VM
ssh ubuntu@alpha-snipes-vm "pm2 logs alpha-snipes-paper --lines 500 | grep -i 'liquidity.*not.*defined\|liquidity.*undefined\|liquidity.*error'"
```

---

## Expected Log Patterns

### ✅ Pattern 1: Known High Liquidity (PASS)

```
[LIQ] DexScreener: $37021 liquidity, $4824 24h volume for 2LMn2p...
[GUARD] Liquidity | liquidity=$37021 | min=$3000 | source=dexscreener | ✅ PASS
[SWAP] Buy swap completed | Size: 0.01 SOL
✅ Bought KITTYCASH 2LMn2p...
```

**Expected:** Trade executes successfully

---

### ✅ Pattern 2: Known Low Liquidity (FAIL - Hard Block)

```
[LIQ] DexScreener: $500 liquidity, $200 24h volume for Ch1zFd...
[GUARD] Liquidity | liquidity=$500 | min=$3000 | source=dexscreener | ❌ FAIL
⛔️ Skipping Ch1zFd...: Liquidity $500 < $3,000
[WATCHLIST] waiting Ch1zFd... | liquidity=$500 | min=4000
```

**Expected:** Trade skipped, added to watchlist

---

### ✅ Pattern 3: Unknown Liquidity - DexScreener 429, Birdeye Success (PASS)

```
[LIQ] DexScreener failed: HTTP 429 (rate limit) for Ch1zFd... - retrying...
[LIQ] Attempting Birdeye fallback for Ch1zFd... (DexScreener rate_limit)
[LIQ] Birdeye fallback: $37021 liquidity for Ch1zFd...
[GUARD] Liquidity | liquidity=$37021 | min=$3000 | source=birdeye | ✅ PASS
[SWAP] Buy swap completed | Size: 0.01 SOL
✅ Bought Ch1zFd...
```

**Expected:** Birdeye fallback succeeds, trade executes

---

### ✅ Pattern 4: Unknown Liquidity - Both Providers Fail (FAIL-OPEN)

```
[LIQ] DexScreener failed after retries for Ch1zFd...: dexscreener-429 | errorTag=rate_limit
[LIQ] Birdeye fallback: no liquidity data for Ch1zFd...
[GUARD] Liquidity | liquidity=unknown | reason=rate_limit | FAIL_OPEN (proceeding with reduced size)
[SWAP] Buy swap completed | Size: 0.005 SOL (▼×0.50) [with liquidity penalty]
✅ Bought Ch1zFd...
```

**Expected:** Trade executes with 0.5x size penalty (reduced risk)

---

### ✅ Pattern 5: Watchlist Auto-Buy (Known Liquidity)

```
[WATCHLIST] waiting 2LMn2p...rNJD | liquidity=$0 | min=4000
[LIQ] DexScreener: $37021 liquidity for 2LMn2p...
[WATCHLIST] New pair detected (0.5h old) | scaling volume threshold: $83 (from $1000)
👀 Watchlist ready
Mint: 2LMn2p...rNJD
Entry Price: 0.005698 SOL
Liquidity: $37,021.13
24h Volume: $4,824.35
Auto-buying now...
[SWAP] Buy swap completed | Size: 0.01 SOL
✅ Bought 2LMn2p...
```

**Expected:** Watchlist auto-buy executes when liquidity appears

---

### ✅ Pattern 6: Watchlist - Unknown Liquidity (Wait)

```
[WATCHLIST] waiting Ch1zFd... | liquidity=unknown | min=4000
```

**Expected:** Watchlist waits (no auto-buy when liquidity is unknown)

---

## ❌ Error Patterns to Watch For (Should NOT Appear)

### ❌ Pattern 1: "liquidityUsd is not defined"

```
❌ Copy trade failed for Ch1zFd...: liquidityUsd is not defined
```

**Status:** Should be FIXED - if you see this, the fix didn't work

---

### ❌ Pattern 2: "Cannot read property 'liquidityUsd' of undefined"

```
❌ Copy trade failed for Ch1zFd...: Cannot read property 'liquidityUsd' of undefined
```

**Status:** Should be FIXED - if you see this, there's another bug

---

### ❌ Pattern 3: "liquidityUsd.toFixed is not a function"

```
❌ Copy trade failed for Ch1zFd...: liquidityUsd.toFixed is not a function
```

**Status:** Should be FIXED - all `.toFixed()` calls are guarded with `typeof` checks

---

## Verification Checklist

- [ ] No "liquidityUsd is not defined" errors in logs
- [ ] Known high liquidity → ✅ PASS → Trade executes
- [ ] Known low liquidity → ❌ FAIL → Trade skipped, watchlist added
- [ ] Unknown liquidity (rate_limit) → FAIL_OPEN → Trade executes with 0.5x penalty
- [ ] Unknown liquidity (timeout) → FAIL_OPEN → Trade executes with 0.5x penalty
- [ ] Unknown liquidity (network) → FAIL_OPEN → Trade executes with 0.5x penalty
- [ ] Watchlist with known liquidity → Auto-buy executes
- [ ] Watchlist with unknown liquidity → Waits (no auto-buy)

---

## What to Report

If you see any of these, capture the full log context:

1. **Any error mentioning "liquidity"** - Full error message + stack trace
2. **Unexpected behavior** - Trade executes when it shouldn't, or vice versa
3. **Missing logs** - Expected `[GUARD] Liquidity` log but didn't see it

**Example report format:**
```
Time: 2025-11-16 23:45:00
Mint: Ch1zFd...
Error: [paste full error]
Log context:
[paste 10 lines before and after]
```

---

## Summary

✅ **Fix Applied:** `liquidityUsd` is now always defined in outer scope  
✅ **Fail-Open Logic:** Unknown liquidity proceeds with 0.5x size penalty  
✅ **Watchlist Safe:** Handles undefined liquidity without crashing  
✅ **All Guards:** Use `typeof` checks to handle both known and unknown cases  

**Next Step:** Monitor logs for the next few trades to confirm the fix works in practice.

---

**Status:** Ready for production testing

