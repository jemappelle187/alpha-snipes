# Debug Logging Specification

## Purpose
This spec defines the logging format for every trade and non-trade decision, making it easy to audit bot behavior from logs and Telegram.

**Enable verbose logging:** Set `DEBUG_TX=true` and `DEBUG_TO_TELEGRAM=true` in `.env`

---

## Log Prefixes

All debug logs use these prefixes for easy filtering:

- `[CLASSIFY]` - Alpha signal classification (BUY/SELL/IGNORE)
- `[GUARD]` - Guard decisions (time/price/liquidity/rug)
- `[EXIT]` - Exit management (TP/trailing/sentry/dead/max-loss)
- `[WATCHLIST]` - Watchlist operations
- `[SCAN]` - Startup transaction scanning
- `[SWAP]` - Swap execution (Jupiter/Orca/Raydium)
- `[LIQ]` - Liquidity fetching
- `[PAPER][DBG]` - Paper mode specific debug

---

## 1. Alpha Transaction Classification

### Format
```
[CLASSIFY] <ACTION> | Alpha: <short> | Mint: <short> | <details> | <reason>
```

### Examples

**✅ BUY Signal Detected:**
```
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | solSpent=0.0259 | tokens=6,972.663
```

**❌ SELL Transaction (Ignored):**
```
[CLASSIFY] SELL | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | solReceived=-0.0000 | tokensSold=177,458,778.742
```

**❌ Dust Transaction (Ignored):**
```
[CLASSIFY] skip tx abc12345: solSpent=0.00005 < dust 0.001
```

**❌ Size Increase Too Small (Ignored):**
```
[CLASSIFY] skip mint 5W2o1NZs: size increase 0.10x < min 0.25x
```

**❌ Alpha Not in Account Keys:**
```
[CLASSIFY] alpha 8zkJmeQS not found in account keys for tx abc12345
```

**❌ Classification Failed:**
```
[CLASSIFY] failed for tx abc12345: <error message>
```

---

## 2. Guard Decisions

### Format
```
[GUARD] <Guard Name> | <metrics> | <threshold> | ✅ PASS | ❌ FAIL
```

### Time Window Guard

**✅ Pass:**
```
[GUARD] Time window | signalAge=2.4s | max=60s | ✅ PASS
```

**❌ Fail:**
```
[GUARD] Time window | signalAge=95.2s | max=60s | ❌ FAIL
```

### Price Guard

**✅ Pass:**
```
[GUARD] Price guard | alphaEntry=3.71e-6 | botEntry=3.70e-6 | ratio=1.00x | max=2.0x | ✅ PASS
```

**❌ Fail:**
```
[GUARD] Price guard | alphaEntry=3.71e-6 | botEntry=1.11e-5 | ratio=3.00x | max=2.0x | ❌ FAIL
```

### Liquidity Guard

**✅ Pass:**
```
[GUARD] Liquidity | liquidity=$31575 | min=$10000 | ✅ PASS | source=dexscreener
```

**❌ Fail:**
```
[GUARD] Liquidity | liquidity=$2500 | min=$10000 | ❌ FAIL | source=dexscreener
```

### Rug Checks

Rug checks are logged via Telegram messages, but you can also check:
- `basicRugChecks()` returns `{ ok: false, reasons: [...] }` on failure
- Reasons logged in skip message

---

## 3. Trade Execution

### Buy Execution

**Format:**
```
✅ Bought <size> SOL (<usd>) of <mint>
Entry: <price> SOL/token (~<usd>)
```

**Example:**
```
✅ Bought 0.01 SOL ($0.15) of 5W2o1NZs...
Entry: 3.71e-6 SOL/token (~$0.0004)
```

**With Dynamic Sizing:**
```
✅ Bought 0.015 SOL ($0.23) of 5W2o1NZs...
Entry: 3.71e-6 SOL/token (~$0.0004)
[Position sizing: 1.5x multiplier (liquidity=high, alpha=large)]
```

### Skip Reasons (Telegram)

**Time Guard:**
```
⛔️ Skipping 5W2o1NZs...: Signal too old (95.2s > 60s)
```

**Price Guard:**
```
⛔️ Skipping 5W2o1NZs...: Price 3.00x higher than alpha entry (limit 2.0x)
```

**Liquidity Guard:**
```
⛔️ Skipping 5W2o1NZs...: Liquidity $2,500 < $10,000
```

**Rug Check:**
```
⛔️ Skipping 5W2o1NZs... due to: authority_not_revoked: mint/freeze authority still active
• This means the token's mint authority is still active...
```

**Watchlist Add:**
```
👀 Added 5W2o1NZs... to watchlist (low_liquidity). Monitoring up to 72h for liquidity.
```

---

## 4. Exit Management

### Early TP Hit

**Log:**
```
🎯 Early TP hit for 5W2o1NZs...
Price: 3.71e-6 SOL/token (~$0.0004)
Target: 3.75e-6 SOL/token
(no partial TP configured)
Switching to trailing stop...
```

**With Partial TP:**
```
💡 Partial TP: Sold $0.08  |  +$0.04 (+50.0%)
🎯 Early TP hit for 5W2o1NZs...
Switching to trailing stop...
```

### Trailing Stop Exit

**Log:**
```
🛑 Trailing stop exit: 5W2o1NZs...
Exit: 3.71e-6 SOL (~$0.0004)
💡 Bought $0.15 → Sold $0.18  |  +$0.03 (+20.0%)
```

**Telegram:**
```
🏆 Winner — 5W2o1NZs...
Alpha: 8zkJmeQS...
🟢 Buy: $0.15
🔴 Sell: $0.18
💰 PnL: +$0.03 (+20.0%)
⏱️ Duration: 5m
```

### Sentry Abort

**Log:**
```
🚨 Sentry abort: 5W2o1NZs...  |  DD: 25.0%
💡 Bought $0.15 → Sold $0.11  |  -$0.04 (-25.0%)
```

**Telegram:**
```
🚨 Sentry abort: 5W2o1NZs...  |  DD: 25.0%
💡 Bought $0.15 → Sold $0.11  |  -$0.04 (-25.0%)
```

### Dead Token Exit

**Log:**
```
[EXIT] Dead token detected for 5W2o1NZs... - forcing exit
💀 Dead token auto-exit: 5W2o1NZs...
Price unavailable for >60s. Forcing exit to prevent 100% loss.
```

### Max Loss Protection

**Log:**
```
[EXIT] Max loss protection triggered for 5W2o1NZs...: -25.0%
🛡️ Max loss protection: 5W2o1NZs...
Loss: -25.0% (limit: -20%)
Forcing exit to prevent further losses.
```

---

## 5. Watchlist Operations

### Watchlist Add

**Log:**
```
[WATCHLIST] added 5W2o1NZs... for reason: low_liquidity
```

**Telegram:**
```
👀 Added 5W2o1NZs... to watchlist (low_liquidity). Monitoring up to 72h for liquidity.
```

### Watchlist Check

**Log:**
```
[WATCHLIST] waiting 5W2o1NZs... | liquidity=$2500 | min=4000
```

**When Ready:**
```
👀 Watchlist ready
Mint: 5W2o1NZs...
Liquidity: $15,000
Auto-buying now...
```

### Watchlist Expiry

**Log:**
```
⌛️ Removed 5W2o1NZs... from watchlist (expired)
```

---

## 6. Startup Scanning

### Scan Start

**Log:**
```
🔍 Scanning recent transactions for missed alpha signals...
```

### Scan Processing

**Log:**
```
[SCAN] processing tx abc12345 for alpha 8zkJmeQS
[SCAN] Failed to process abc12345: <error>
```

### Scan Complete

**Log:**
```
✅ Startup scan complete
```

---

## 7. Swap Execution

### Jupiter Swap

**Log:**
```
[SWAP] Jupiter swap successful | txid: <signature>
```

**Fallback:**
```
[SWAP] Jupiter failed: <error>
[SWAP] Attempting Orca swap for 5W2o1NZs...
[SWAP] Orca failed: <error>
[SWAP] Attempting Raydium swap for 5W2o1NZs...
```

---

## 8. Liquidity Fetching

### Success

**Log:**
```
[LIQ] DexScreener: $15,000 liquidity for 5W2o1NZs...
```

### Failure

**Log:**
```
[LIQ] DexScreener failed: HTTP 429
[LIQ] Retrying after 500ms...
```

---

## 9. Position Persistence

### Load

**Log:**
```
[POSITIONS] Loaded 3 positions from disk
```

### Save

**Log:**
```
[POSITIONS] Saved 3 positions to disk
```

---

## 10. Paper Mode Specific

All logs prefixed with `[PAPER][DBG]`:

```
[PAPER][DBG] skip buy: invalid entry price { mint: '5W2o1NZs...', entryPrice: 0 }
[PAPER][DBG] duplicate buy suppressed { key: '5W2o1NZs...:abc12345:alpha' }
```

---

## Log Filtering Commands

### View All Classification Decisions
```bash
grep "\[CLASSIFY\]" logs/bot_*.log
```

### View All Guard Decisions
```bash
grep "\[GUARD\]" logs/bot_*.log
```

### View All Exits
```bash
grep "\[EXIT\]" logs/bot_*.log
```

### View All Watchlist Activity
```bash
grep "\[WATCHLIST\]" logs/bot_*.log
```

### View Failed Trades (Skips)
```bash
grep "⛔️ Skipping" logs/bot_*.log
```

### View Successful Trades
```bash
grep "✅ Bought" logs/bot_*.log
```

### View All Exits
```bash
grep -E "(🛑|🚨|💀|🛡️)" logs/bot_*.log
```

---

## Telegram Debug Mode

When `DEBUG_TO_TELEGRAM=true`, all `[DBG]` logs are also sent to the command chat:

```
<code>[PAPER][DBG] skip buy: invalid entry price</code>
```

This allows real-time monitoring of all decisions.

---

## Audit Trail Example

**Complete trade lifecycle in logs:**

```
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | solSpent=0.0259 | tokens=6,972.663
[GUARD] Time window | signalAge=2.4s | max=60s | ✅ PASS
[GUARD] Liquidity | liquidity=$31575 | min=$10000 | ✅ PASS | source=dexscreener
[GUARD] Price guard | alphaEntry=3.71e-6 | botEntry=3.70e-6 | ratio=1.00x | max=2.0x | ✅ PASS
✅ Bought 0.01 SOL ($0.15) of 5W2o1NZs...
Entry: 3.71e-6 SOL/token (~$0.0004)
🎯 Early TP hit for 5W2o1NZs...
Switching to trailing stop...
🛑 Trailing stop exit: 5W2o1NZs...
💡 Bought $0.15 → Sold $0.18  |  +$0.03 (+20.0%)
```

**Complete skip lifecycle in logs:**

```
[CLASSIFY] BUY | Alpha: 8zkJmeQS | Mint: 5W2o1NZs | solSpent=0.0259 | tokens=6,972.663
[GUARD] Time window | signalAge=2.4s | max=60s | ✅ PASS
[GUARD] Liquidity | liquidity=$2500 | min=$10000 | ❌ FAIL
⛔️ Skipping 5W2o1NZs...: Liquidity $2,500 < $10,000
👀 Added 5W2o1NZs... to watchlist (low_liquidity). Monitoring up to 72h for liquidity.
```

---

## Best Practices

1. **Enable verbose logging during paper testing:**
   ```bash
   DEBUG_TX=true
   DEBUG_TO_TELEGRAM=true
   ```

2. **Review logs daily during testing phase:**
   - Check for unexpected guard failures
   - Verify all exits fire correctly
   - Confirm PnL calculations

3. **Keep logs for at least 7 days:**
   - Allows retrospective analysis
   - Helps identify patterns
   - Useful for debugging issues

4. **Monitor Telegram for real-time decisions:**
   - Watch guard decisions as they happen
   - Catch issues immediately
   - Verify bot behavior matches expectations

5. **Use log filtering to analyze specific scenarios:**
   - Filter by guard type
   - Filter by outcome (pass/fail)
   - Filter by mint address

---

## Summary

Every trade and non-trade decision is logged with:
- **Clear prefix** (`[CLASSIFY]`, `[GUARD]`, `[EXIT]`, etc.)
- **Decision outcome** (✅ PASS / ❌ FAIL)
- **Relevant metrics** (price, liquidity, time, etc.)
- **Reason for skip** (if applicable)

This makes it easy to audit bot behavior and verify it matches your mental model.

