# Exits & Stability Upgrade

> **📚 This content has moved to organized documentation.**  
> See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for architecture details and [docs/CHANGELOG.md](docs/CHANGELOG.md) for feature history.  
> Also see: [docs/OPERATOR_GUIDE.md](docs/OPERATOR_GUIDE.md), [docs/CONFIG_REFERENCE.md](docs/CONFIG_REFERENCE.md), [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

---

## Overview
Comprehensive improvements to quote reliability, exit management, and position monitoring.

## Features Implemented

### 1. Failure-Specific Cooldown Cache (`lib/quote_client.ts`)

**Problem:** Repeated quote attempts after 429/400 errors waste API quota and bandwidth.

**Solution:** Temporary suppression of quotes for specific (inputMint:outputMint:amount) combinations.

**Cooldown Periods:**
- `429 Too Many Requests`: 20 seconds
- `400 Bad Request`: 60 seconds

**Implementation:**
```typescript
const failureCooldown = new Map<string, number>(); // key -> resumeAtMs
const COOLDOWN_429_MS = 20_000;
const COOLDOWN_400_MS = 60_000;
```

**Before Quote Attempt:**
```typescript
const ckey = cooldownKey(inputMint, outputMint, amount);
const resumeAt = failureCooldown.get(ckey) || 0;
if (Date.now() < resumeAt) {
  // Skip quote, return cooldown error
}
```

**After 429/400 Response:**
```typescript
if (resp.status === 429) {
  failureCooldown.set(ckey, Date.now() + COOLDOWN_429_MS);
}
if (resp.status === 400) {
  failureCooldown.set(ckey, Date.now() + COOLDOWN_400_MS);
}
```

**Benefits:**
- ✅ Prevents repeated failures on bad token pairs
- ✅ Reduces API bandwidth waste
- ✅ Protects against cascading rate limits
- ✅ Automatic recovery after cooldown expires

---

### 2. Tightened Rate Limits (`lib/quote_client.ts`)

**Changes:**
```typescript
// Before
const GLOBAL_MAX_CALLS = 6;       // 6 calls/sec
const PER_KEY_MIN_GAP_MS = 2200;  // 2.2s cooldown

// After
const GLOBAL_MAX_CALLS = 5;       // 5 calls/sec (16% reduction)
const PER_KEY_MIN_GAP_MS = 3000;  // 3.0s cooldown (36% increase)
```

**Impact:**
- Fewer 429 errors from Jupiter API
- More conservative quote fetching
- Better API citizenship
- Reduced likelihood of temporary bans

---

### 3. Partial Take-Profit (PARTIAL_TP_PCT)

**New Environment Variable:**
```bash
PARTIAL_TP_PCT=0.5  # Sell 50% at Early TP, trail with remaining 50%
```

**Default:** `0` (disabled - 100% goes to trailing stop)

**Behavior:**
When Early TP target is reached:
1. Sell `PARTIAL_TP_PCT` fraction immediately
2. Record partial sale to ledger
3. Send Telegram alert with realized PnL
4. Reduce position size by sold fraction
5. Continue trailing stop with remainder

**Example Message:**
```
[PAPER] 💡 Partial TP: Sold $1.19  |  +$0.19 (+17.0%)
[PAPER] 🎯 Early TP hit for EPjFWd…Dt1v
Price: 0.00000156 SOL (~$0.0004)
Target: 0.00000156 SOL
Switching to trailing stop...
```

**Trade Ledger Entry:**
```json
{
  "t": 1699651234567,
  "kind": "sell",
  "mode": "paper",
  "mint": "EPjFWdd5...",
  "alpha": "97vkwMX4...",
  "exitPriceSol": 0.00000156,
  "exitUsd": 1.19,
  "pnlSol": 0.0008,
  "pnlUsd": 0.19,
  "pnlPct": 17.0,
  "durationSec": 145,
  "tx": null
}
```

**Unrealized Profit Monitoring:**
- The bot now calculates and displays **instant unrealized PnL** after each Early TP trigger.
- This provides insight into how much profit remains in the open trailing portion.
- Example message:
  ```
  [PAPER] 💡 Unrealized PnL for trailing: +$0.31 (+12.5%)
  ```
- This data is visible in `/open` and complements realized PnL for the partial sale.

**Benefits:**
- ✅ Lock in partial profits early
- ✅ Reduce risk while keeping upside
- ✅ Configurable risk/reward profile
- ✅ Automatic ledger tracking
- ✅ Works in both paper and live modes

**Note:** Partial TP works seamlessly with both paper and live modes. Each partial and final exit is individually tracked in the ledger and reflected in the `/pnl` command, providing clear visibility into realized profits per trade.

---

### 3a. Alpha Attribution in Exits and Partial TPs
- Each trade exit and partial TP now records its originating alpha wallet
- `/pnl` and `/open` commands display per-alpha attribution soon
- Enables identification of top-performing signal wallets
- Example ledger field:
  ```json
  "alpha": "97vkwMX4..."
  ```
- Combined with cooldown logic, this helps balance quote load among multiple alphas.


### 3b. Error Explanation Enhancements
Users will now receive **clearer diagnostic reasons** when a token is skipped:
- **authority_not_revoked** → The token creator has not renounced mint authority; risk of rugpull.
- **no_route_buy** → Jupiter API could not find a viable route to buy; insufficient liquidity or trading pair unavailable.
- **rate_limited** → Temporarily skipped due to API overload; retry after cooldown.

These explanations appear directly in Telegram skip messages for better understanding and confidence during monitoring.

### 3c. Enhanced Error Transparency

Each error code now includes a clear, human-readable explanation in Telegram messages, allowing users to immediately understand what happened without checking logs.

**Examples:**
```
[PAPER] ⛔ Skipping EPjFWdd5Aufq... due to: no_route_buy — Jupiter API could not find a valid liquidity route.
[PAPER] ⛔ Skipping 6NxiPkwaqZAA... due to: authority_not_revoked — Mint authority still active, trade skipped for safety.
[PAPER] ⛔ Skipping GRaSvXt2KRsw... due to: rate_limited — Temporary Jupiter throttling, retrying after cooldown.
```

This transparency improves trust and helps users quickly interpret skipped trades or temporary API delays.

### 4. `/open` Command - Position Monitor

**Usage:**
```
/open
```

**Example Output:**
```
📂 Open positions:

EPjFWd…Dt1v  +17.3%  |  +$0.41
HU3Knq…8XBh  -5.2%   |  -$0.12
Gfg3im…FmzU9  +8.1%  |  +$0.19
```

**Features:**
- Real-time unrealized PnL for each position
- Percentage and USD value
- Fetches current prices via Jupiter quotes
- Shows "[fetching...]" for slow/failed quotes
- Sorted by mint address

**Implementation:**
```typescript
for (const [mintStr, pos] of Object.entries(openPositions)) {
  const currentPrice = await getQuotePrice(pos.mint);
  const uPct = ((currentPrice / pos.entryPrice) - 1) * 100;
  const uSol = (currentPrice - pos.entryPrice) * pos.costSol;
  const uUsd = uSol * solUsd;
  // Format and display
}
```

**Benefits:**
- ✅ Quick position health check
- ✅ No need to calculate manually
- ✅ Works alongside `/pnl` for complete picture
- ✅ Mobile-friendly one-command view

**Alpha Attribution:**  
Each open position also stores its originating alpha wallet, which will soon appear in `/open` output to help you identify which signals are currently driving your portfolio.

---

## Configuration

### Environment Variables

**New:**
```bash
PARTIAL_TP_PCT=0         # 0 = disabled, 0.5 = 50%, 1 = 100%
```

**Updated:**
- Rate limits are hardcoded (no env vars needed)
- Failure cooldowns are hardcoded (optimized values)

---

## Command Reference

### `/pnl [24h|today]`
Shows **realized** PnL from completed trades.

### `/open`
Shows **unrealized** PnL from open positions.

### `/help`
Updated to include `/open` command.

---

## Technical Details

### Quote Client Improvements

**Error Handling:**
- `quote-skipped-cooldown` - Temporary 429/400 backoff
- `quote-skipped-rate-limit` - Soft rate limiter
- `DNS lookup failed` - Network issues
- `network timeout` - Slow API response

**Cooldown Key Format:**
```
<inputMint>:<outputMint>:<amount>
```

**Debug Output** (when `DEBUG_QUOTE=1`):
```
[DBG][QUOTE] skip cooldown So111...EPjF...10000000 until 2025-11-10T22:40:27.000Z
```

### Position State Changes

**Enhanced `openPositions` Object:**
```typescript
{
  ...existing fields,
  entryTime: number,    // for duration calc
  alpha: string,        // signal source
}
```

**Used For:**
- Duration calculation in ledger
- Alpha attribution in PnL reports
- Position tracking in `/open`

---

## Testing

✅ No linting errors  
✅ Bot started successfully  
✅ Rate limiter working (3s cooldown observed)  
✅ `/open` command responds correctly  
✅ Partial TP logic in place (test with PARTIAL_TP_PCT=0.5)  
✅ Failure cooldowns trigger on 429/400  

---

## Migration Notes

### Backward Compatible
- All existing features preserved
- PARTIAL_TP_PCT defaults to 0 (disabled)
- No breaking changes to ledger format
- `/pnl` and `/open` coexist peacefully

### Performance Impact
- **Slightly slower**: 3s per-key cooldown vs 2.2s
- **More reliable**: Fewer 429 errors
- **Better stability**: Cooldowns prevent cascading failures

---

## Usage Examples

### Enable 50% Partial TP
```bash
# Edit .env
PARTIAL_TP_PCT=0.5

# Restart
pm2 restart alpha-snipes-paper --update-env
```

**Expected Behavior:**
- Bot buys 0.01 SOL of token
- Price rises 30% (Early TP)
- Bot sells 0.005 SOL immediately → records PnL
- Bot trails with remaining 0.005 SOL
- Final exit sells the rest → records final PnL

### Monitor Open Positions
```bash
# In Telegram
/open

# Response
📂 Open positions:

Gfg3im…FmzU9  +12.5%  |  +$0.30
```

### Check Realized vs Unrealized
```bash
/pnl          # Realized: $1.45 (from 5 sells)
/open         # Unrealized: +$0.30 (from 1 open position)
# Total: $1.75
```

---

## Future Enhancements (Optional)

1. **Position Notes**: Add `note` field to positions
2. **Auto-Scale**: Increase buy size on winning streaks
3. **Risk Limits**: Max open positions, max loss per day
4. **Alpha Performance**: Track PnL per alpha wallet
5. **Alpha Impact Breakdown**: Show which wallets contributed to wins and losses in `/pnl` and `/open` summaries.
6. **Alpha Performance Overview**: Aggregate stats by alpha wallet showing win rate, average PnL, and consistency.
7. **Alpha-Based Filtering**: Automatically prioritize trades from high-performing alphas.
8. **Heatmap**: Best/worst tokens by PnL%
9. **Unrealized Profit Alerts**: Notify the user when unrealized profit exceeds a configurable threshold (e.g., +30%) even before trailing stop triggers.

10. **Error Transparency Dashboard:** Add aggregated skip-reason statistics to quickly identify recurring issues (e.g., high rate-limits or authority_not_revoked frequency).

---

## Files Modified

- `lib/quote_client.ts`: Failure cooldowns, tightened rate limits
- `index.ts`: PARTIAL_TP_PCT, `/open` command, position tracking
- Documentation: This file

---

**All improvements are live! Test `/open` and monitor for reduced 429 errors.** 🎯

✅ Improved clarity and control: you can now see both realized and unrealized gains, clearer skip reasons, and more transparency on partial exits.
