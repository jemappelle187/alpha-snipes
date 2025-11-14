# Format Utilities

> **📚 This content has moved to organized documentation.**  
> See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for format utilities documentation and [docs/OPERATOR_GUIDE.md](docs/OPERATOR_GUIDE.md) for user-facing formatting examples.

---

**File:** `lib/format.ts`  
**Status:** ✅ Production Ready

---

## 📦 Exports

### Number Formatting

#### `lamportsToSol(l: number | string): number`
Convert lamports to SOL.

```typescript
lamportsToSol(1_000_000_000)  // → 1
lamportsToSol('500000000')    // → 0.5
lamportsToSol(10_000_000)     // → 0.01
```

#### `formatSol(n: number): string`
Format SOL amounts with smart trailing zero removal.

```typescript
formatSol(1)          // → "1 SOL"
formatSol(0.12345678) // → "0.12345678 SOL"
formatSol(1.50000000) // → "1.5 SOL" (trailing zeros removed)
formatSol(0.00012300) // → "0.000123 SOL"
```

**Features:**
- Up to 8 decimal places
- Automatically removes trailing zeros
- Always includes " SOL" suffix

#### `formatUsd(n: number): string`
Format USD amounts with currency symbol.

```typescript
formatUsd(100)       // → "$100.00"
formatUsd(237.85)    // → "$237.85"
formatUsd(0.0042)    // → "$0.0042"
formatUsd(10000.57)  // → "$10,000.5700"
```

**Features:**
- Includes $ symbol
- Up to 4 decimal places
- Thousand separators (commas)

---

### String Formatting

#### `short(str: string, left=6, right=4): string`
Shorten long strings (addresses, signatures) with ellipsis.

```typescript
const addr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

short(addr)           // → "EPjFWd…Dt1v"
short(addr, 8, 6)     // → "EPjFWdd5…yTDt1v"
short('abc')          // → "abc" (unchanged if short)
short('')             // → ""
```

**Parameters:**
- `left`: Number of characters to keep from start (default: 6)
- `right`: Number of characters to keep from end (default: 4)

---

### URL Generators

⚙️ **Note:** These URL functions now return **HTML hyperlinks** when used in Telegram messages with HTML parse mode. This keeps messages clean and readable.

#### `solscanTx(sig: string): string`
Generate Solscan transaction URL.

```typescript
solscanTx('5GHV9EeEsdThNr1XyZ...')
// → "<a href=\"https://solscan.io/tx/5GHV9EeEsdThNr1XyZ...\">🔗 TX</a>"
```

#### `solscanMint(mint: string): string`
Generate Solscan token/mint URL.

```typescript
solscanMint('So11111111111111111111111111111111111111112')
// → "<a href=\"https://solscan.io/address/So11111111111111111111111111111111111111112\">🪙 Mint</a>"
```

#### `solscanWallet(w: string): string`
Generate Solscan wallet URL.

```typescript
solscanWallet('4rNgv2QXwyfWh9QJaJg8YJ6qjpqqaXRHBJVUXTAUUHrA')
// → "<a href=\"https://solscan.io/address/4rNgv2QXwyfWh9QJaJg8YJ6qjpqqaXRHBJVUXTAUUHrA\">👤 View</a>"
```

---

## 🎯 Usage Examples

### Basic Telegram Alert (Before)
```typescript
await alert(
  `✅ Bought 0.01 SOL of ${mint.slice(0, 8)}...\n` +
  `TX: https://solscan.io/tx/${txid}`
);
```

### Enhanced Telegram Alert (After)
```typescript
import { formatSol, formatUsd, short, solscanTx } from './lib/format.js';
import { getSolUsd } from './lib/sol_price.js';

const solPrice = await getSolUsd();
const usdValue = 0.01 * solPrice;

await alert(
  `✅ Bought ${formatSol(0.01)} (${formatUsd(usdValue)}) of <code>${short(mint)}</code>\n` +
  `TX: ${solscanTx(txid)}`
);
```

**Output:**
```
✅ Bought 0.01 SOL ($2.38) of EPjFWd…Dt1v
TX: https://solscan.io/tx/5GHV9E...
```

---

### PnL Report Enhancement

**Before:**
```typescript
await alert(
  `📊 PnL for ${mintStr.slice(0, 8)}...\n` +
  `Entry: ${entrySol.toFixed(4)} SOL\n` +
  `Exit: ${exitSol.toFixed(4)} SOL\n` +
  `Profit: ${pnl.toFixed(4)} SOL (${pct.toFixed(1)}%)`
);
```

**After:**
```typescript
import { formatSol, formatUsd, short } from './lib/format.js';
import { getSolUsd } from './lib/sol_price.js';

const solPrice = await getSolUsd();
const emoji = pnl >= 0 ? '📈' : '📉';

await alert(
  `${emoji} PnL for <code>${short(mintStr)}</code>\n` +
  `Entry: ${formatSol(entrySol)} (${formatUsd(entrySol * solPrice)})\n` +
  `Exit: ${formatSol(exitSol)} (${formatUsd(exitSol * solPrice)})\n` +
  `Profit: ${formatSol(pnl)} (${formatUsd(pnl * solPrice)}) • ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
);
```

**Output:**
```
📈 PnL for EPjFWd…Dt1v
Entry: 0.01 SOL ($2.38)
Exit: 0.013 SOL ($3.09)
Profit: 0.003 SOL ($0.71) • +30.0%
```

---

### Position Summary

```typescript
import { formatSol, formatUsd, short } from './lib/format.js';
import { getSolUsd } from './lib/sol_price.js';

const positions = Object.entries(openPositions);
const solPrice = await getSolUsd();

const summary = positions.map(([mint, pos]) => {
  const usdValue = pos.costSol * solPrice;
  return `• <code>${short(mint)}</code>: ${formatSol(pos.costSol)} (${formatUsd(usdValue)})`;
}).join('\n');

const totalSol = positions.reduce((sum, [, p]) => sum + p.costSol, 0);
const totalUsd = totalSol * solPrice;

await alert(
  `📊 Open Positions (${positions.length})\n\n` +
  summary + '\n\n' +
  `Total: ${formatSol(totalSol)} (${formatUsd(totalUsd)})`
);
```

**Output:**
```
📊 Open Positions (3)

• EPjFWd…Dt1v: 0.01 SOL ($2.38)
• GG3KqaC…pump: 0.01 SOL ($2.38)
• 2dhswr…pump: 0.01 SOL ($2.38)

Total: 0.03 SOL ($7.14)
```

---

### HTML Hyperlink Version (Telegram-Optimized)

When used in Telegram with HTML parse mode, you can build messages like this:

```typescript
import { solscanTx, solscanMint, solscanWallet } from './lib/format.js';

await alert(
  `✅ Trade Executed\n` +
  `${solscanMint(mint)} | ${solscanWallet(wallet)} | ${solscanTx(txid)}`
);
```

**Output:**
```
✅ Trade Executed  
🪙 Mint | 👤 View | 🔗 TX
```

---

### Transaction Links

```typescript
import { short, solscanTx, solscanMint } from './lib/format.js';

await alert(
  `👀 Alpha touched new mint\n` +
  `Mint: <a href="${solscanMint(mint)}">${short(mint)}</a>\n` +
  `TX: <a href="${solscanTx(sig)}">${short(sig, 8, 8)}</a>`
);
```

**Output (with HTML links in Telegram):**
```
👀 Alpha touched new mint
Mint: EPjFWd…Dt1v (clickable)
TX: 5GHV9EeE…RZi2HyTU (clickable)
```

---

## 🎨 Design Principles

### 1. **Readability First**
- Removes unnecessary trailing zeros
- Smart decimal precision
- Consistent formatting

### 2. **Space Efficiency**
- Short addresses/signatures save message space
- Preserves enough context for identification

### 3. **User-Friendly**
- Dollar amounts include currency symbol
- SOL amounts clearly labeled
- Thousand separators for large numbers

### 4. **Telegram-Optimized**
- Works with HTML parse mode
- Compatible with `<code>` and `<a>` tags
- Clickable Solscan links

---

## 🔧 Configuration

### Customize Decimal Precision

**For SOL amounts:**
```typescript
const nf = new Intl.NumberFormat('en-US', { 
  maximumFractionDigits: 8  // Up to 8 decimals
});
```

**For USD amounts:**
```typescript
const nfUsd = new Intl.NumberFormat('en-US', { 
  style: 'currency', 
  currency: 'USD', 
  maximumFractionDigits: 4  // Up to 4 decimals
});
```

### Customize Address Shortening

Default: `short(addr)` → 6 chars + … + 4 chars

Custom lengths:
```typescript
short(addr, 8, 6)  // → 8 chars + … + 6 chars
short(addr, 4, 4)  // → 4 chars + … + 4 chars (ultra compact)
short(addr, 12, 8) // → 12 chars + … + 8 chars (more context)
```

---

## 📊 Integration Checklist

### Essential Changes

- [ ] Update buy alerts to use `formatSol()` and `formatUsd()`
- [ ] Update sell/exit alerts with enhanced formatting
- [ ] Update PnL reports with USD equivalents
- [ ] Replace `.slice(0, 8)` with `short()`
- [ ] Add Solscan links using helper functions
- [ ] Switch to HTML hyperlinks (Mint/View/TX) for cleaner Telegram messages

### Optional Enhancements

- [ ] Add position summary command
- [ ] Create daily PnL report
- [ ] Add wallet balance display
- [ ] Show SOL price in startup message

---

## ✅ Testing

**Test Script:** `tools/test_format.ts`

**Run:**
```bash
npx tsx tools/test_format.ts
```

**Expected:**
```
✅ All format utilities working!
```

---

## 🚀 Production Ready

All utilities are:
- ✅ Tested and working
- ✅ Type-safe (TypeScript)
- ✅ Efficient (no heavy dependencies)
- ✅ Telegram-compatible
- ✅ Internationalization-ready (Intl API)

**Import anywhere:**
```typescript
import { 
  lamportsToSol, 
  formatSol, 
  formatUsd, 
  short,
  solscanTx,
  solscanMint,
  solscanWallet
} from './lib/format.js';
```

---

✅ **Format Utilities Ready!** Use these to create professional, readable Telegram alerts and logs.


