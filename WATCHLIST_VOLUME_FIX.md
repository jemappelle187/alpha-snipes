# Watchlist Auto-Buy Volume Validation Fix

## Problem Identified

The bot triggered a watchlist auto-buy for token `syoucCYrkHx6ZDTPjgWG6ra5EhCA6443iR8JVzgEdwo` at 18:43, but the token had:
- **No recent trading activity** (last transaction was 6 hours ago)
- **Locked liquidity** but **no active trading**
- This is a classic "dead token" scenario - liquidity exists but no one is trading

### Root Cause

The watchlist monitoring was **only checking liquidity**, not trading activity:
- ✅ Liquidity check: `liquidityUsd >= $4,000` → PASSED
- ❌ Volume check: **MISSING** → No validation
- ❌ Activity check: **MISSING** → No validation

**Result:** Bot attempted to buy a token with liquidity but zero trading activity.

## What the URLs Show

Based on the Solscan data you shared:

### Token: `syoucCYrkHx6ZDTPjgWG6ra5EhCA6443iR8JVzgEdwo` (Edwo)

**Transactions Tab:**
- Last activity: **6 hours ago**
- All transactions are old (6+ hours)
- Mix of swaps, liquidity operations, but **no recent activity**

**Transfers Tab:**
- Multiple transfers to address `GfUPwR8xog...`
- All transfers are **6 hours old**
- No recent transfer activity

**Analysis:**
- Token has liquidity locked in pool
- But **no active trading** in the last 6 hours
- This is a **dead/inactive token** despite having liquidity
- DexScreener shows liquidity but doesn't indicate if it's actively traded

## Solution Implemented

### 1. Enhanced Liquidity Data

**Updated `lib/liquidity.ts`:**
- Now fetches `volume24h` from DexScreener API
- Returns `pairCreatedAt` timestamp
- Logs volume alongside liquidity

### 2. Volume Validation

**Added new config:**
```typescript
WATCHLIST_MIN_VOLUME_24H_USD = $1,000  // Require minimum 24h volume
WATCHLIST_MAX_INACTIVE_HOURS = 2       // Skip if inactive >2 hours
```

**Watchlist now checks:**
1. ✅ **Liquidity** >= $4,000 (existing check)
2. ✅ **24h Volume** >= $1,000 (NEW - prevents dead tokens)
3. ✅ **Pair Age + Volume** (NEW - skip old pairs with low volume)

### 3. Enhanced Logging

**Before:**
```
[WATCHLIST] waiting syoucC... | liquidity=$5000 | min=4000
👀 Watchlist ready - Auto-buying now...
```

**After:**
```
[WATCHLIST] waiting syoucC... | liquidity=$5000 | min=4000
[WATCHLIST] skipping syoucC... | volume24h=$0 | min=$1000 (insufficient trading activity)
```

**Alert message now shows:**
```
👀 Watchlist ready
Mint: syoucC...
Liquidity: $5,000
24h Volume: $1,234  ← NEW
Auto-buying now...
```

## How It Works Now

### Watchlist Auto-Buy Flow

1. **Check liquidity** → Must be >= $4,000
2. **Check 24h volume** → Must be >= $1,000 (NEW)
3. **Check pair age** → If >24h old, require 2x volume (NEW)
4. **If all pass** → Proceed with auto-buy
5. **If any fail** → Skip and log reason

### Example Scenarios

**Scenario 1: Active Token (PASS)**
- Liquidity: $10,000 ✅
- 24h Volume: $5,000 ✅
- Result: **Auto-buy proceeds**

**Scenario 2: Dead Token (FAIL)**
- Liquidity: $10,000 ✅
- 24h Volume: $50 ❌
- Result: **Skipped** - "insufficient trading activity"

**Scenario 3: Old Inactive Token (FAIL)**
- Liquidity: $8,000 ✅
- 24h Volume: $1,500 ✅
- Pair Age: 48 hours
- Required Volume: $2,000 (2x threshold)
- Result: **Skipped** - "likely dead token"

## Configuration

Add to `.env` to customize:

```bash
# Minimum 24h volume required for watchlist auto-buy
WATCHLIST_MIN_VOLUME_24H_USD=1000

# Maximum inactive hours (for old pairs)
WATCHLIST_MAX_INACTIVE_HOURS=2
```

## Why This Matters

**Before:** Bot would buy tokens with liquidity but no trading activity → stuck positions, no exit liquidity

**After:** Bot only buys tokens with:
- ✅ Sufficient liquidity
- ✅ Active trading (24h volume)
- ✅ Recent activity indicators

This prevents buying "dead tokens" that have locked liquidity but no active market.

## Testing

After deploying, the bot will:
1. **Skip** tokens like Edwo (liquidity but no volume)
2. **Only auto-buy** tokens with both liquidity AND trading activity
3. **Log clear reasons** for skipping

Monitor logs:
```bash
grep "\[WATCHLIST\]" logs/bot_*.log | grep -E "skipping|ready"
```

## Files Modified

- `lib/liquidity.ts` - Enhanced to fetch volume and pair age
- `index.ts` - Added volume validation to watchlist monitoring
- `env.template` - Added new config options (documentation)

## Next Steps

1. **Deploy to VM** and restart bot
2. **Monitor watchlist behavior** - should skip dead tokens
3. **Adjust thresholds** if needed (via `.env`)
4. **Review logs** to verify volume checks are working

The bot will now be much smarter about which watchlist tokens to actually buy!

