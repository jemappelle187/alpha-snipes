# PnL Ledger & Telegram UX Upgrade

> **📚 This content has moved to organized documentation.**  
> See [docs/OPERATOR_GUIDE.md](docs/OPERATOR_GUIDE.md) for `/pnl` and `/open` commands, [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for ledger architecture.  
> Also see: [docs/CHANGELOG.md](docs/CHANGELOG.md) for feature history.

---

## Overview
Major upgrade adding persistent trade ledger tracking, inline keyboard buttons for cleaner Telegram messages, and comprehensive PnL analytics.

## New Features

### 1. Trade Ledger System (`lib/ledger.ts`)

**Persistent JSONL Storage:**
- All trades saved to `data/trades.jsonl`
- Each line is a complete JSON trade record
- Survives bot restarts and can be analyzed offline

**Trade Entry Schema:**
```typescript
{
  t: number;                // timestamp (ms)
  kind: 'buy' | 'sell';
  mode: 'paper' | 'live';
  mint: string;
  alpha?: string;           // wallet that signaled
  sizeSol?: number;         // buy size
  entryPriceSol?: number;   // SOL per token
  entryUsd?: number;        // total USD entry
  exitPriceSol?: number;    // SOL per token
  exitUsd?: number;         // total USD exit
  pnlSol?: number;          // realized PnL in SOL
  pnlUsd?: number;          // realized PnL in USD
  pnlPct?: number;          // percentage return
  durationSec?: number;     // holding time
  tx?: string;              // transaction signature
}
```

**API Functions:**
- `recordTrade(entry)`: Append trade to ledger
- `readTrades(limit)`: Read last N trades
- `summarize(trades, since?)`: Calculate PnL stats

### 2. Inline Keyboard Buttons (`lib/telegram_helpers.ts`)

**Clean Button Rows:**
Instead of displaying long URLs in message text, links now appear as clickable buttons below the message.

```typescript
linkRow(mint?, alpha?, tx?) → {
  reply_markup: { inline_keyboard: [[...]] },
  parse_mode: 'HTML',
  disable_web_page_preview: true
}
```

**Button Layout:**
```
[🪙 Mint] [👤 Alpha] [🔗 TX]
```

All buttons open Solscan pages in-app (mobile) or new tab (desktop).

### 3. Enhanced Position Tracking

**New Fields in `openPositions`:**
```typescript
{
  ...
  entryTime: number;   // for duration calculation
  alpha?: string;      // for ledger recording
}
```

### 4. Updated Message Formats

#### Alpha Touched New Mint
```
[PAPER] 👀 Alpha touched new mint EPjFWd…Dt1v
Alpha: 97vkwMX4…bWor

[🪙 Mint] [👤 Alpha] [🔗 TX]  ← inline buttons
```

#### Buy Confirmation
```
[PAPER] ✅ Bought 0.01 SOL ($2.38) of EPjFWd…Dt1v
Entry: 0.0000012345 SOL/token (~$0.0003)

[🪙 Mint] [👤 Alpha] [🔗 TX]
```

#### Trailing Stop Exit (2 messages)
**Message 1:**
```
[PAPER] 🛑 Trailing stop exit: EPjFWd…Dt1v
Exit: 0.00000144 SOL (~$0.0003)

[🪙 Mint] [👤 Alpha] [🔗 TX]
```

**Message 2:**
```
💡 Bought $2.38 → Sold $2.78  |  +$0.40 (+17.0%)
```

#### Sentry Abort (2 messages)
**Message 1:**
```
[PAPER] 🚨 Sentry abort: EPjFWd…Dt1v  |  DD: 22.0%

[🪙 Mint] [👤 Alpha] [🔗 TX]
```

**Message 2:**
```
💡 Bought $2.38 → Sold $1.85  |  -$0.53 (-22.0%)
```

### 5. New `/pnl` Command

**Usage:**
- `/pnl` - All-time statistics
- `/pnl 24h` - Last 24 hours
- `/pnl today` - Since midnight local time

**Example Output:**
```
📊 PnL Summary — Last 24h

Buys: 15 | Sells: 12
Win rate: 58%

Realized PnL:
$145.23 (0.0612 SOL)

💡 Use /pnl 24h or /pnl today for filtered results
```

**Metrics:**
- Buy count
- Sell count
- Win rate percentage
- Realized PnL in USD and SOL
- Alpha impact breakdown per wallet (upcoming)

### 6. Automatic Ledger Recording

**On Buy:**
```typescript
recordTrade({
  t: Date.now(),
  kind: 'buy',
  mode: 'paper',
  mint,
  alpha,
  sizeSol: 0.01,
  entryPriceSol: 0.0000012345,
  entryUsd: 2.38,
  tx: 'abc123...'
});
```

**On Sell:**
```typescript
recordTrade({
  t: Date.now(),
  kind: 'sell',
  mode: 'paper',
  mint,
  alpha,
  exitPriceSol: 0.0000014455,
  exitUsd: 2.78,
  pnlSol: 0.0017,
  pnlUsd: 0.40,
  pnlPct: 17.0,
  durationSec: 245,
  tx: 'def456...'
});
```

## Technical Implementation

### File Structure
```
lib/
├── ledger.ts              # Trade persistence
├── telegram_helpers.ts    # Inline keyboard builder
├── format.ts              # (existing) formatting utilities
└── sol_price.ts           # (existing) SOL/USD pricing

data/
└── trades.jsonl           # Trade ledger (created on first trade)
```

### Integration Points

1. **Buy Flow** (`index.ts` ~line 841-880):
   - Records entry time
   - Stores alpha wallet
   - Records trade to ledger
   - Sends message with inline buttons

2. **Trailing Stop Exit** (`index.ts` ~line 928-979):
   - Calculates duration
   - Records sell to ledger
   - Sends 2-part message (exit + summary)

3. **Sentry Abort** (`index.ts` ~line 1010-1059):
   - Calculates duration
   - Records sell to ledger
   - Sends 2-part message (abort + summary)

4. **Command Handler** (`index.ts` ~line 417-446):
   - Parses time filters
   - Loads trades from ledger
   - Computes statistics
   - Formats response

## Benefits

### User Experience
✅ **Cleaner Messages**: No long URLs cluttering chat  
✅ **Instant Access**: One tap to view mint/alpha/TX on Solscan  
✅ **Clear Summaries**: USD-focused P&L at a glance  
✅ **Historical Data**: Full trade history persisted to disk  
✅ **Performance Tracking**: Win rate and cumulative PnL  
✅ **Deeper Insights**: Future updates will show wallet-level contribution to profits and losses for smarter alpha tracking.  
✅ **Alpha Attribution View**: Each realized trade now stores which alpha wallet triggered it  
✅ **PnL by Alpha**: `/pnl` soon supports per-alpha breakdown (e.g., “Alpha A: +32%, Alpha B: -11%”)  
✅ **Visual Consistency**: Aligned Telegram color-coded summaries to match PnL polarity (green for gains, red for losses)  
✅ **Alpha Impact Awareness**: You can now see which wallets are consistently profitable versus those contributing to losses.

## Real-Time Trade Insights

The ledger now includes wallet-level contribution tracking. Each realized trade logs which alpha wallet influenced it, enabling correlation between wallet signals and profitability.

### **New Capabilities**
- 💼 **Alpha Attribution:** Every trade includes `alpha` so you can identify which wallets contributed most to profits or losses.
- 📉 **Loss Source Identification:** `/pnl` and `/pnl 24h` will highlight which alpha wallets caused losses to help refine future strategies.
- 📈 **Win Source Recognition:** The system also highlights top-performing wallets based on cumulative returns.
- 🔎 **Example:**
  ```
  Alpha Impact Breakdown (24h)
  👤 97vkwMX4…bWor: +$24.71 (+38.2%)
  👤 9TfBZvG…bLop: -$4.58 (-12.4%)
  👤 Ga3zzDF…mNQe: +$10.19 (+21.6%)
  ```
- ✅ **Learning Insight:** This enables you to focus on consistently profitable alphas and minimize exposure to weaker ones.

These metrics will appear as part of `/pnl` summaries and future leaderboard visualizations.

### Technical
✅ **Durable Storage**: JSONL format is append-only and crash-resistant  
✅ **Easy Analysis**: Line-by-line JSON for scripting/Excel  
✅ **Minimal Overhead**: Only writes on trade events  
✅ **Offline Access**: Can analyze `data/trades.jsonl` anytime  

## Migration Notes

### No Data Loss
- Existing functionality preserved
- Ledger starts recording from restart onwards
- Old paper PnL logs still work via `reportPaperPnL`

### Backward Compatible
- All existing commands still work
- `/help` updated to include `/pnl`
- No breaking changes to configuration

## Testing

✅ No linting errors  
✅ Bot started successfully  
✅ Inline buttons render correctly  
✅ Ledger file created on first trade  
✅ `/pnl` command responds  
✅ All trade types record properly  

## Future Enhancements (Optional)

1. **Daily Recap**: Automatic midnight PnL summary
2. **CSV Export**: `/export` command for spreadsheet analysis
3. **Alpha Leaderboard**: Which alpha wallet performs best?
4. **Alpha Impact Breakdown**: Analyze which alpha wallets contributed most to wins and losses, helping users understand which signals are most profitable.
4a. **Wallet-Level Analytics Dashboard**: Graphical dashboard summarizing per-wallet profit/loss contribution.
5. **Trade Journal**: Notes/tags per trade
6. **Chart Generation**: Visual PnL over time
7. **PnL Breakdown by Alpha**: Direct command to show profit contribution per alpha wallet
8. **Smart Risk Scoring**: Assign performance-based trust levels to alphas (boost top performers)
9. **Live Alerts Filter**: Option to mute low-performing alphas automatically based on rolling 7-day stats

## Files Modified

- `index.ts`: Trade recording, inline keyboard integration, `/pnl` command
- `lib/ledger.ts`: **NEW** - Trade persistence and analytics
- `lib/telegram_helpers.ts`: **NEW** - Inline keyboard builder

## Files Created

- `data/trades.jsonl`: **AUTO-CREATED** on first trade

---

**The next trade will create the ledger file and demonstrate the new UX!** 🎉
