# Liquidity Fix Summary - "liquidityUsd is not defined" Error

**Date:** 2025-11-16  
**Issue:** Runtime error `liquidityUsd is not defined` crashing copy trades  
**Status:** ✅ **FIXED**

---

## Root Cause

The variable `liquidityUsd` was only defined inside the `if (liq.ok && typeof liq.liquidityUsd === 'number')` block, but was referenced outside that block on line 2354:

```typescript
// ❌ BEFORE (BROKEN)
if (liq.ok && typeof liq.liquidityUsd === 'number') {
  const liquidityUsd = liq.liquidityUsd; // Only defined here
  // ... guard logic ...
} else {
  // liquidityUsd not defined here!
}

// Later, outside the if/else:
const entryLiquidity = liquidityUsd; // ❌ ERROR: liquidityUsd is not defined
```

When liquidity was unknown (provider error: rate_limit, timeout, network), `liquidityUsd` was undefined in the outer scope, causing the error.

---

## Fix Applied

### 1. Define `liquidityUsd` in Outer Scope

**File:** `index.ts` (lines 2212-2240)

```typescript
// ✅ AFTER (FIXED)
// Extract liquidityUsd - handle both known (number) and unknown (undefined) cases
const liquidityUsd: number | undefined = liq.ok && typeof liq.liquidityUsd === 'number' ? liq.liquidityUsd : undefined;

if (typeof liquidityUsd === 'number') {
  // Known liquidity value (including 0 = known low liquidity)
  const liqPass = liquidityUsd >= minLiq;
  // ... guard logic ...
} else {
  // Provider failed → fail OPEN
  dbg(`[GUARD] Liquidity | liquidity=unknown | reason=${liq.errorTag ?? 'unknown'} | FAIL_OPEN`);
}
```

### 2. Fix Position Sizing

**File:** `index.ts` (lines 2295-2304)

```typescript
const sizing = computePositionSize({
  // ...
  liquidityUsd: typeof liquidityUsd === 'number' ? liquidityUsd : 0, // Use 0 if unknown (will apply penalty)
  liquidityPenalty: typeof liquidityUsd === 'number' ? undefined : 0.5, // 0.5x size when liquidity unknown
});
```

### 3. Fix Entry Liquidity Storage

**File:** `index.ts` (lines 2355-2366)

```typescript
// Store entry liquidity for monitoring (use 0 if unknown - we'll skip liquidity drop detection in that case)
const entryLiquidity = typeof liquidityUsd === 'number' ? liquidityUsd : 0;

openPositions[mintStr] = {
  // ...
  entryLiquidityUsd: entryLiquidity, // Store for liquidity drop detection (0 = unknown, skip detection)
};
```

### 4. Fix Watchlist Liquidity Check

**File:** `index.ts` (lines 2459-2469)

```typescript
const liquidity = await getLiquidityResilient(entry.mint);
const liquidityUsd = liquidity.ok && typeof liquidity.liquidityUsd === 'number' ? liquidity.liquidityUsd : 0;

// Check liquidity threshold - skip if unknown (provider error) or below minimum
if (!liquidity.ok || typeof liquidity.liquidityUsd !== 'number' || liquidityUsd < WATCHLIST_MIN_LIQUIDITY_USD) {
  const liqDisplay = typeof liquidity.liquidityUsd === 'number' ? `$${liquidityUsd.toFixed(0)}` : 'unknown';
  dbg(`[WATCHLIST] waiting ${short(entry.mint)} | liquidity=${liqDisplay} | min=${WATCHLIST_MIN_LIQUIDITY_USD}`);
  continue;
}
```

---

## Expected Behavior After Fix

### Scenario 1: Known High Liquidity

```
[LIQ] DexScreener: $37021 liquidity for 2LMn2p...
[GUARD] Liquidity | liquidity=$37021 | min=$3000 | source=dexscreener | ✅ PASS
[SWAP] Buy swap completed | Size: 0.01 SOL
```

### Scenario 2: Known Low Liquidity

```
[LIQ] DexScreener: $500 liquidity for Ch1zFd...
[GUARD] Liquidity | liquidity=$500 | min=$3000 | source=dexscreener | ❌ FAIL
⛔️ Skipping Ch1zFd...: Liquidity $500 < $3,000
```

### Scenario 3: Unknown Liquidity (Provider Error)

```
[LIQ] DexScreener failed: HTTP 429 (rate limit) for Ch1zFd... - retrying...
[LIQ] Birdeye fallback: $37021 liquidity for Ch1zFd...
[GUARD] Liquidity | liquidity=$37021 | min=$3000 | source=birdeye | ✅ PASS
```

**OR if both fail:**

```
[LIQ] DexScreener failed after retries for Ch1zFd...: dexscreener-429 | errorTag=rate_limit
[LIQ] Birdeye fallback: no liquidity data for Ch1zFd...
[GUARD] Liquidity | liquidity=unknown | reason=rate_limit | FAIL_OPEN (proceeding with reduced size)
[SWAP] Buy swap completed | Size: 0.005 SOL (▼×0.50) [with liquidity penalty]
```

### Scenario 4: Watchlist Auto-Buy

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
```

---

## Code Changes Summary

| File | Lines | Change |
|------|-------|--------|
| `index.ts` | 2212-2240 | Define `liquidityUsd` in outer scope, handle `undefined` |
| `index.ts` | 2295-2304 | Use `typeof` check for position sizing |
| `index.ts` | 2355-2366 | Store entry liquidity as 0 when unknown |
| `index.ts` | 2459-2469 | Fix watchlist liquidity check |

---

## Testing Checklist

- [x] Known high liquidity → ✅ PASS guard → Buy executes
- [x] Known low liquidity → ❌ FAIL guard → Skip with message
- [x] Unknown liquidity (rate_limit) → FAIL_OPEN → Buy with 0.5x penalty
- [x] Unknown liquidity (timeout) → FAIL_OPEN → Buy with 0.5x penalty
- [x] Unknown liquidity (network) → FAIL_OPEN → Buy with 0.5x penalty
- [x] Watchlist with known liquidity → Auto-buy executes
- [x] Watchlist with unknown liquidity → Skip (wait for next check)

---

## Verification

**Error fixed:** ✅ `liquidityUsd is not defined` can no longer occur

**Reason:** `liquidityUsd` is now always defined in the outer scope as `number | undefined`, and all references use `typeof` checks to handle both cases safely.

**Fail-open behavior:** ✅ When liquidity is unknown, bot proceeds with reduced size (0.5x) instead of crashing.

---

**Status:** ✅ **FIXED AND COMMITTED**

