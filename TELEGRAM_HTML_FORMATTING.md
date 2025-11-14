# Telegram HTML Hyperlink Formatting

> **📚 This content has moved to organized documentation.**  
> See [docs/OPERATOR_GUIDE.md](docs/OPERATOR_GUIDE.md) for Telegram UX features and [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for `lib/telegram_helpers.ts` implementation.

---

## Overview
Updated all Telegram messages to use clean HTML hyperlinks instead of displaying full URLs, making messages more readable and professional.

## Changes Made

### 1. Format Helper Functions Updated (`lib/format.ts`)

**Before:**
```typescript
export function solscanTx(sig: string){ 
  return `https://solscan.io/tx/${sig}`; 
}
export function solscanMint(mint: string){ 
  return `https://solscan.io/address/${mint}`; 
}
export function solscanWallet(w: string){ 
  return `https://solscan.io/address/${w}`; 
}
```

**After:**
```typescript
export function solscanTx(sig: string){ 
  return `<a href="https://solscan.io/tx/${sig}">🔗 TX</a>`; 
}
export function solscanMint(mint: string){ 
  return `<a href="https://solscan.io/address/${mint}">🪙 Mint</a>`; 
}
export function solscanWallet(w: string){ 
  return `<a href="https://solscan.io/address/${w}">👤 View</a>`; 
}
```

### 2. Alpha Touched New Mint

**Before:**
```
[PAPER] 👀 Alpha touched new mint EPjFWd…Dt1v
Mint: https://solscan.io/address/EPjFWdd5...
Alpha: 97vkwMX4…bWor (https://solscan.io/address/97vkwMX4...)
TX: 5GHV9EeE…i2HyTU (https://solscan.io/tx/5GHV9EeE...)
```

**After:**
```
[PAPER] 👀 Alpha touched new mint EPjFWd…Dt1v
🪙 Mint | Alpha: 97vkwMX4…bWor 👤 View | 🔗 TX
```
*All underlined text is clickable in Telegram*

### 3. Buy Confirmation

**Before:**
```
[PAPER] ✅ Bought 0.01 SOL ($2.38) of EPjFWd…Dt1v (checks passed)
Mint: https://solscan.io/address/EPjFWdd5...
Alpha: 97vkwMX4…bWor (https://solscan.io/address/97vkwMX4...)
TX: https://solscan.io/tx/abc123...
Ref price ~ 0.0000012345 SOL/token  |  ~$0.0003/token
```

**After:**
```
[PAPER] ✅ Bought 0.01 SOL ($2.38) of EPjFWd…Dt1v
🪙 Mint | Alpha: 97vkwMX4…bWor 👤 View | 🔗 TX
Entry: 0.0000012345 SOL/token (~$0.0003)
```
*All underlined text is clickable*

### 4. Trailing Stop Exit

**Before:**
```
[PAPER] 🛑 Trailing stop exit: EPjFWd…Dt1v
Price: 0.00000144 SOL (~$0.0003)
PnL: +17.0%
TX: https://solscan.io/tx/abc123...
• Summary: bought 0.01 SOL ($2.38), sold 0.0117 SOL ($2.78), PnL: 0.0017 SOL ($0.40), +17.0%
```

**After:**
```
[PAPER] 🛑 Trailing stop exit: EPjFWd…Dt1v
Exit: 0.00000144 SOL (~$0.0003)  |  🔗 TX
💡 Bought $2.38 → Sold $2.78  |  $0.40 (+17.0%)
```
*🔗 TX is clickable*

### 5. Sentry Abort

**Before:**
```
[PAPER] 🚨 Sentry abort: EPjFWd…Dt1v
Drawdown: 22.0% reached
TX: https://solscan.io/tx/def456...
• Summary: bought 0.01 SOL ($2.38), sold 0.0078 SOL ($1.85), PnL: -0.0022 SOL (-$0.53), -22.0%
```

**After:**
```
[PAPER] 🚨 Sentry abort: EPjFWd…Dt1v  |  DD: 22.0%
🔗 TX
💡 Bought $2.38 → Sold $1.85  |  -$0.53 (-22.0%)
```
*🔗 TX is clickable*

## Technical Details

### HTML Parse Mode
Already enabled in `index.ts`:
```typescript
await bot.sendMessage(TELEGRAM_CHAT_ID, fullText, {
  parse_mode: 'HTML',
  disable_web_page_preview: true,
});
```

### Inline Keyboard Integration (Optional)
For even cleaner alerts, replace hyperlinks with Telegram inline keyboard buttons:

```typescript
import { buildInlineButtons } from './lib/telegram_helpers';

await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
  parse_mode: 'HTML',
  reply_markup: { inline_keyboard: buildInlineButtons(mint, alpha, tx) },
  disable_web_page_preview: true,
});
```

*Result: buttons below each message instead of inline links.*

### Compact Exit Summary Format
- **Focus on USD**: Primary amounts in USD (easier for humans)
- **Arrow notation**: `→` shows flow from entry to exit
- **Pipe separator**: `|` for clean visual separation
- **Single line**: All critical info in one compact line

### Example with Inline Buttons and Compact Summary
```
[PAPER] ✅ Bought 0.01 SOL ($2.38) of EPjFWd…Dt1v
Entry: 0.0000012345 SOL/token (~$0.0003)

[🪙 Mint] [👤 Alpha] [🔗 TX]

💡 Bought $2.38 → Sold $2.78  |  +$0.40 (+17.0%)
```

### Benefits
✅ **Cleaner UI**: No long URLs cluttering the message  
✅ **More Readable**: Focus on data, not addresses  
✅ **Professional**: Clean, modern messaging format  
✅ **Still Clickable**: All links work in Telegram  
✅ **Compact Summaries**: Critical info at a glance  
✅ **USD-Focused**: Easier portfolio tracking  
✅ **Inline Buttons Ready**: Future updates can use Telegram inline keyboards ([🪙 Mint] [👤 Alpha] [🔗 TX]) for an even cleaner look.  

### Error Transparency Integration
All skip messages and failure alerts now include clear, human-readable reasons directly in Telegram.

**Examples:**
```
[PAPER] ⛔ Skipping EPjFWdd5Aufq... due to: no_route_buy — Jupiter API could not find a valid liquidity route.
[PAPER] ⛔ Skipping 6NxiPkwaqZAA... due to: authority_not_revoked — Mint authority still active, trade skipped for safety.
[PAPER] ⛔ Skipping GRaSvXt2KRsw... due to: rate_limited — Temporary Jupiter throttling, retrying after cooldown.
```

These short explanations help you quickly understand why trades were skipped without checking logs.

## Files Modified
- `lib/format.ts`: Updated hyperlink helper functions
- `index.ts`: Updated all alert messages to use new format

## Example in Telegram

When you tap on any underlined text or inline button in Telegram:
- **🪙 Mint** → Opens Solscan token page
- **👤 View** → Opens Solscan wallet page  
- **🔗 TX** → Opens Solscan transaction page

All links open in-app browser on mobile or new tab on desktop.

## Testing
✅ No linting errors  
✅ Bot started successfully  
✅ HTML parse mode already enabled  
✅ All hyperlinks formatted correctly  

The next trade will display the new clean format! 🎨

✅ Enhanced Telegram transparency: skip reasons are now concise and human-readable, improving situational awareness directly in chat.
