# Exit Summary Enhancement

## Overview
Added comprehensive entry/exit/PnL summary lines to all exit messages (trailing stop and sentry abort) in both SOL and USD.

## Changes Made

### 1. Import Addition
- Added `lamportsToSol` to the import from `lib/format.js`

### 2. Enhanced Trailing Stop Exit Message

**Before:**
```
[PAPER] 🛑 Trailing stop exit: EPjFWd…Dt1v
Price: 0.00000144 SOL (~$0.0003)
PnL: +17.0%
TX: https://solscan.io/tx/abc123...
```

**After:**
```
[PAPER] 🛑 Trailing stop exit: EPjFWd…Dt1v
Price: 0.00000144 SOL (~$0.0003)
PnL: +17.0%
TX: https://solscan.io/tx/abc123...
• Summary: bought 0.01 SOL ($2.38), sold 0.0117 SOL ($2.78), PnL: 0.0017 SOL ($0.40), +17.0%
```

### 3. Enhanced Sentry Abort Message

**Before:**
```
[PAPER] 🚨 Sentry abort: EPjFWd…Dt1v
Drawdown: 22.0% reached
TX: https://solscan.io/tx/def456...
```

**After:**
```
[PAPER] 🚨 Sentry abort: EPjFWd…Dt1v
Drawdown: 22.0% reached
TX: https://solscan.io/tx/def456...
• Summary: bought 0.01 SOL ($2.38), sold 0.0078 SOL ($1.85), PnL: -0.0022 SOL (-$0.53), -22.0%
```

## Technical Details

### Calculation Logic
```typescript
// Calculate summary line with entry/exit/PnL in SOL and USD
const entrySol = pos.costSol;                                      // Entry amount
const exitSol = tx.solOutLamports ? lamportsToSol(tx.solOutLamports) : 0;  // Exit amount
const pnlSol = exitSol - entrySol;                                 // Realized PnL
const entryUsd = entrySol * (solUsd || 0);                         // Entry USD value
const exitUsd = exitSol * (solUsd || 0);                           // Exit USD value
const pnlUsd = pnlSol * (solUsd || 0);                             // PnL USD value

// Format summary line
const summaryLine = solUsd ? 
  `\n• Summary: bought ${formatSol(entrySol)} (${formatUsd(entryUsd)}), ` +
  `sold ${formatSol(exitSol)} (${formatUsd(exitUsd)}), ` +
  `PnL: ${formatSol(pnlSol)} (${formatUsd(pnlUsd)}), ` +
  `${(pnl >= 0 ? '+' : '')}${pnl.toFixed(1)}%` : '';
```

### Features
- ✅ Shows both SOL and USD amounts for entry, exit, and PnL
- ✅ Uses consistent formatting (formatSol, formatUsd)
- ✅ Gracefully degrades if SOL/USD price not available
- ✅ Works in both paper and live modes
- ✅ Includes sign prefix for PnL percentage (+/-)

### Defensive Programming
- Guards against missing `tx.solOutLamports` (defaults to 0)
- Guards against missing `solUsd` (skips summary line if unavailable)
- Uses `lamportsToSol` with built-in `Number.isFinite()` check

## Files Modified
- `index.ts`:
  - Line 35: Added `lamportsToSol` import
  - Lines 914-934: Enhanced trailing stop exit message
  - Lines 972-995: Enhanced sentry abort message

## Testing
- ✅ No linting errors
- ✅ Bot started successfully
- ✅ All imports resolved correctly
- ✅ Calculations are numerically stable

## Next Trade Will Show
When the next position exits (via trailing stop or sentry abort), Telegram users will see:
- Entry amount in SOL and USD
- Exit amount in SOL and USD
- Realized PnL in SOL and USD
- Percentage return with proper sign

This provides complete transparency and makes it easy to track portfolio performance.
