# 🔧 Troubleshooting Guide

Common issues, causes, and fixes for Alpha Snipes.

---

## 📋 Quick Diagnostics

```bash
# Check bot status
pm2 status

# View recent logs
pm2 logs alpha-snipes-paper --lines 100 --nostream

# Test Telegram connection
/status

# Test Jupiter API
tsx tools/quote_smoke.ts

# Verify environment
pm2 env 0 | grep -E "TRADE_MODE|TELEGRAM|SOLANA_RPC"
```

---

## 🔴 Critical Issues

### Bot Won't Start

**Symptom:**
```
pm2 start ecosystem.config.cjs
[PM2][ERROR] ...
```

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Missing `.env` | `cp env.template .env` and edit |
| Invalid `TELEGRAM_TOKEN` | Verify token from @BotFather |
| Invalid `WALLET_PRIVATE_KEY` (live mode) | Check base58 format |
| Node.js version < 20 | `node --version` and upgrade if needed |
| Missing dependencies | `npm install` |

**Debug:**
```bash
# Try foreground run
npm start
# Watch for specific error message
```

---

### Bot Crashes Immediately

**Symptom:**
```
pm2 status
│ alpha-snipes-paper │ errored │
```

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| RPC unreachable | Test with `curl $SOLANA_RPC_URL` |
| Telegram bot conflict (409) | Kill existing instances: `pkill -f "tsx index.ts"` |
| Invalid Telegram IDs | Use @userinfobot to get correct IDs |
| Missing Telegram permissions | Ensure bot is admin in channel |

**Debug:**
```bash
pm2 logs alpha-snipes-paper --err --lines 50
```

---

## 🌐 Network & API Issues

### "429 Too Many Requests" (Jupiter)

**Symptom:**
```
[DBG][QUOTE] 429 Too Many Requests
[DBG][QUOTE] skip cooldown So111...:EPjF...:10000000 until 2025-11-11T12:34:56Z
```

**Cause:** Hitting Jupiter API rate limits.

**Built-in Protection:**
- ✅ 20-second cooldown activates automatically
- ✅ Per-mint cooldown prevents rapid retries
- ✅ Global rate limit: 5 calls/sec

**Action Required:**
- ✅ **None** - This is normal and self-recovers
- ⚠️ If persistent (>10 min), consider premium RPC

**Long-term Fix:**
```env
# Use premium RPC with higher limits
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=xxx
```

---

### "400 Bad Request" (Jupiter)

**Symptom:**
```
[DBG][QUOTE] 400 Bad Request
```

**Causes:**

| Cause | Explanation | Fix |
|-------|-------------|-----|
| No route available | Token too illiquid or unsupported | 60s cooldown applies automatically |
| Invalid amount | Amount too small or too large | Check `BUY_SOL` value |
| Blacklisted token | Jupiter doesn't support it | Bot skips and records reason |

**Built-in Protection:**
- ✅ 60-second cooldown after 400 errors
- ✅ Skip message with explanation

**Action Required:**
- ✅ **None** - Bot skips and moves on
- If frequent, review alpha wallet trades (may target unsupported tokens)

---

### "Invalid URL" (Jupiter)

**Symptom:**
```
[ERROR] Invalid URL
TypeError: Invalid URL
```

**Cause:** Malformed `JUP_QUOTE_BASE` or `JUP_SWAP_BASE`.

**Fix:**
```bash
# Edit .env
nano .env

# Ensure these are valid URLs (or comment out to use defaults):
JUP_QUOTE_BASE=https://lite-api.jup.ag/swap/v1/quote
JUP_SWAP_BASE=https://lite-api.jup.ag/swap/v1/swap

# Restart with --update-env
pm2 restart alpha-snipes-paper --update-env
```

**Verify:**
```bash
pm2 logs alpha-snipes-paper --lines 30 | grep "🔁 JUP_"
# Should show:
# 🔁 JUP_QUOTE_BASE override: https://...
# 🔁 JUP_SWAP_BASE override: https://...
```

---

### "ENOTFOUND quote-api.jup.ag"

**Symptom:**
```
Error: getaddrinfo ENOTFOUND quote-api.jup.ag
```

**Cause:** DNS resolution failure (ISP or network issue).

**Fix:**
```env
# Force reliable DNS in .env
DNS_OVERRIDE=1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4
```

```bash
# Restart
pm2 restart alpha-snipes-paper --update-env

# Verify
pm2 logs alpha-snipes-paper --lines 10 | grep "DNS override"
```

**Test DNS manually:**
```bash
nslookup quote-api.jup.ag 1.1.1.1
# Should return IP addresses
```

**If still fails:**
- Check firewall/proxy settings
- Try different network (mobile hotspot)
- Verify `curl https://quote-api.jup.ag` works

---

### "Connection Timeout" (RPC)

**Symptom:**
```
Error: Connection timeout
```

**Causes:**

| Cause | Fix |
|-------|-----|
| Public RPC overloaded | Use premium RPC (Helius, QuickNode) |
| Network congestion | Retry or wait |
| Firewall blocking | Check `curl $SOLANA_RPC_URL` |

**Fix:**
```env
# Use premium RPC
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
```

---

## 🤖 Bot Behavior Issues

### No Signals for Long Time

**Symptom:**
```
[BOT] 🤫 Silent period
No new signals for 62 minutes.
```

**Causes & Fixes:**

| Cause | Check | Fix |
|-------|-------|-----|
| Alpha wallet inactive | Solscan: recent txs? | Add more alphas with `/add` |
| Filters too strict | Review skip reasons | Relax `REQUIRE_AUTHORITY_REVOKED` |
| Network down | `pm2 logs` for errors | Check RPC connectivity |
| Bot not watching | `/list` shows alphas? | Verify registry not empty |

**Debug:**
```bash
# Check alpha activity on Solscan
# Visit: https://solscan.io/address/<alpha_wallet>
# Look for recent "Token Account" transactions

# Check bot logs for skips
pm2 logs alpha-snipes-paper | grep "Skipping"
```

---

### All Trades Skipped

**Symptom:**
```
⛔️ Skipping <mint> due to: mint authority not revoked
⛔️ Skipping <mint> due to: no route (400)
```

**Causes & Fixes:**

| Skip Reason | Explanation | Fix |
|-------------|-------------|-----|
| `mint authority not revoked` | Creator can still mint tokens | Set `REQUIRE_AUTHORITY_REVOKED=false` (riskier) |
| `freeze authority active` | Creator can freeze wallets | Set `REQUIRE_FREEZE_REVOKED=false` (riskier) |
| `tax exceeds limit` | Transfer tax > `MAX_TAX_BPS` | Increase `MAX_TAX_BPS` (e.g., 1000 = 10%) |
| `price impact too high` | Slippage > `MAX_PRICE_IMPACT_BPS` | Increase `MAX_PRICE_IMPACT_BPS` or reduce `BUY_SOL` |
| `no route (400)` | Jupiter can't build route | Token unsupported or too illiquid |
| `no route (429)` | Rate limited | Wait for cooldown (automatic) |

**Adjust filters:**
```env
# More permissive (but riskier)
REQUIRE_AUTHORITY_REVOKED=false
MAX_TAX_BPS=1000
MAX_PRICE_IMPACT_BPS=5000
```

**Trade-offs:**
- Lower safety = more trades, higher rug risk
- Higher safety = fewer trades, lower rug risk

---

### Position Not Exiting

**Symptom:**
- Position shows in `/open` for hours
- No Early TP or trailing stop triggered

**Causes & Fixes:**

| Cause | Check | Fix |
|-------|-------|-----|
| Price never hit TP | Check Solscan chart | Wait or adjust `EARLY_TP_PCT` lower |
| Price stalled | Not moving | `/force_exit` (paper) or manual sell |
| Exit loop stopped | `pm2 logs` for errors | Restart bot |
| Invalid entry price | Entry = 0 or NaN | Bot skips TP automatically (bug fix applied) |

**Debug:**
```bash
# Check position details
/open
# Shows:
# - Entry price
# - Current price
# - Phase (EARLY TP or TRAILING)

# Check bot logs
pm2 logs alpha-snipes-paper | grep "TP hit\|Trailing stop"
```

---

### Wrong PnL Calculations

**Symptom:**
- `/pnl` shows incorrect profit
- Ledger has mismatched numbers

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Entry price = 0 | Bot now validates with `isValidPrice()` |
| Quote failed during exit | Use manual calculation from ledger |
| Partial TP not recorded | Check `data/trades.jsonl` for sell entries |
| USD equivalent wrong | SOL price cache stale (refreshes every 60s) |

**Verify ledger:**
```bash
# Find specific trade
grep "mint_address" data/trades.jsonl

# Check buy/sell pairs
jq -r 'select(.mint=="<address>") | [.kind, .pnlUsd] | @csv' data/trades.jsonl
```

---

## 💬 Telegram Issues

### Commands Not Working

**Symptom:**
- `/status` → No response
- `/open` → No response

**Causes & Fixes:**

| Cause | Check | Fix |
|-------|-------|-----|
| Not admin user | Your user ID matches `ADMIN_USER_ID`? | Use @userinfobot to get ID, update `.env` |
| DM vs channel | Sending to correct chat? | Commands work in `COMMAND_CHAT_ID` |
| Bot crashed | `pm2 status` | Restart bot |
| Wrong bot | Talking to correct bot? | Check @BotFather for bot username |

**Verify:**
```bash
# Check admin ID
pm2 env 0 | grep ADMIN_USER_ID

# Test with /help (shows all commands)
```

---

### Formatting Errors (HTML)

**Symptom:**
```
ETELEGRAM: 400 Bad Request: can't parse entities
```

**Cause:** Invalid HTML in message (e.g., `<1m` interpreted as tag).

**Fix:**
- Bot wraps dynamic content in `<code>` tags
- If you modified message templates, ensure HTML entities are escaped

**Built-in Protection:**
```typescript
// Wrapped in <code> to prevent HTML parsing issues
`Last activity: <code>${ago(sinceActivity)}</code>`
```

---

### Inline Buttons Not Appearing

**Symptom:**
- Alert shows plain URLs instead of `[🪙 Mint] [👤 Alpha] [🔗 TX]` buttons

**Cause:** Using old message format or `parse_mode` not set.

**Fix:**
- Ensure `linkRow()` is used:
  ```typescript
  await bot.sendMessage(chatId, message, linkRow({ mint, alpha, tx }));
  ```
- Verify `parse_mode: 'HTML'` is set

---

### Duplicate Bot Alerts (Telegram 409)

**Symptom:**
```
ETELEGRAM: 409 Conflict: terminated by other getUpdates request
```

**Cause:** Multiple bot instances running.

**Fix:**
```bash
# Kill all instances
pkill -f "tsx index.ts"

# Verify none running
ps aux | grep "tsx index.ts"

# Start single instance
pm2 start ecosystem.config.cjs
```

**Prevention:**
- Always use PM2 (manages single instance)
- Never run `npm start` while PM2 is active

---

## 📊 Data & Ledger Issues

### Missing Trades in Ledger

**Symptom:**
- Trade appeared in Telegram
- Not in `data/trades.jsonl`

**Causes:**

| Cause | Fix |
|-------|-----|
| `data/` folder missing | Bot creates automatically; check permissions |
| Write permissions | `chmod 755 data/` |
| Crash during write | Append-only JSONL is crash-resistant; check logs |

**Verify:**
```bash
ls -la data/
# Should show: trades.jsonl
# If missing, bot recreates on next trade
```

---

### Corrupted Registry

**Symptom:**
- Alpha wallets duplicated
- Registry shows wallet as both active AND candidate

**Fix:**
```bash
# Self-heal with cleanup tool
tsx tools/dedupe_registry.ts

# Verify
cat alpha/registry.json | jq .
```

**Prevention:**
- Bot now self-heals on every `readRegistry()` call
- Atomic writes prevent race conditions

---

## 🔐 Security Issues

### Wallet Key Not Loading (Live Mode)

**Symptom:**
```
Error: Invalid private key
```

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Wrong format | Must be base58 (not JSON array) |
| Extra whitespace | Trim in `.env`: `WALLET_PRIVATE_KEY=5J7Wn...` (no quotes) |
| Key in wrong file | Check `.env` (not `env.template`) |

**Test:**
```bash
# Verify key is loaded
pm2 env 0 | grep WALLET_PRIVATE_KEY
# Should show: WALLET_PRIVATE_KEY=5J7Wn...
```

**Convert from JSON array:**
```javascript
// If you have [123, 45, 67, ...]
const bs58 = require('bs58');
const key = bs58.encode(Buffer.from([123, 45, 67, ...]));
console.log(key); // Use this in .env
```

---

### Insufficient Balance (Live Mode)

**Symptom:**
```
Error: Insufficient funds
```

**Causes & Fixes:**

| Cause | Check | Fix |
|-------|-------|-----|
| Wallet empty | Balance on Solscan | Transfer SOL to bot wallet |
| Not enough for gas | Need 0.005 SOL per trade | Keep buffer (0.5+ SOL) |
| Priority fees too high | Check `CU_UNIT_PRICE` | Lower to 2000-5000 |

**Check balance:**
```bash
# Via Solscan
# Visit: https://solscan.io/address/<wallet_address>

# Or add /balance command (see DEVELOPER_GUIDE)
```

---

## 🧪 Testing Issues

### Smoke Test Fails

**Symptom:**
```bash
tsx tools/quote_smoke.ts
❌ SOL→USDC failed
```

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Network down | Check internet connection |
| Jupiter API down | Check https://status.jup.ag |
| DNS issues | Set `DNS_OVERRIDE` in `.env` |
| Wrong endpoints | Verify `JUP_QUOTE_BASE` in `.env` |

**Debug:**
```bash
# Test endpoint directly
curl "https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000&slippageBps=30"
# Should return JSON with outAmount
```

---

### Paper Mode Not Simulating

**Symptom:**
- No `[PAPER]` tags
- Real transactions appearing on chain

**Cause:** `TRADE_MODE=live` set by mistake.

**Fix:**
```bash
# Edit .env
nano .env

# Set:
TRADE_MODE=paper

# Remove or comment out:
# WALLET_PRIVATE_KEY=...

# Restart
pm2 restart alpha-snipes-paper --update-env

# Verify banner
pm2 logs alpha-snipes-paper --lines 20 | grep "PAPER MODE"
```

---

## 📈 Performance Issues

### High Memory Usage

**Symptom:**
```bash
pm2 status
# Shows >500 MB memory
```

**Causes:**

| Cause | Normal? | Fix |
|-------|---------|-----|
| Many open positions | Yes (up to ~200 MB) | Normal operation |
| Large event history | Yes (`RECENT[]` capped at 50) | No action needed |
| Memory leak | No | Restart: `pm2 restart alpha-snipes-paper` |

**Monitor:**
```bash
pm2 monit
# Watch memory over time
```

---

### Slow Quote Fetches

**Symptom:**
- Quotes taking >5 seconds
- Trades missed due to slow pricing

**Causes & Fixes:**

| Cause | Fix |
|-------|-----|
| Public RPC slow | Use premium RPC |
| Network latency | Check `ping api.mainnet-beta.solana.com` |
| Jupiter API slow | Multi-endpoint fallback activates automatically |
| Rate limits | Built-in cooldowns manage this |

**Optimize:**
```env
# Premium RPC
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=xxx

# Force fast DNS
DNS_OVERRIDE=1.1.1.1,1.0.0.1
```

---

## 🔍 Debug Mode

### Enable Full Debug Output

```env
DEBUG_TX=true              # Why txs don't produce signals
DEBUG_TO_TELEGRAM=false    # Keep false to avoid spam
DEBUG_QUOTE=1              # All Jupiter API attempts
```

**Restart:**
```bash
pm2 restart alpha-snipes-paper --update-env
```

**What you'll see:**
```
[DBG] considering tx abc123… (preTokens: 2, postTokens: 3)
[DBG][QUOTE] url = https://lite-api.jup.ag/swap/v1/quote?inputMint=...
[DBG][QUOTE] skip cooldown So111…:EPjF…:10000000 until 2025-11-11T12:34:56Z
[PAPER][DBG] ignored tx def456: no post-token increase (no new mints)
```

---

## 📞 Getting More Help

### Gather Diagnostic Info

```bash
# System info
node --version
npm --version
pm2 --version

# Bot status
pm2 status
pm2 env 0 | grep -E "TRADE_MODE|BUY_SOL|TELEGRAM"

# Recent logs
pm2 logs alpha-snipes-paper --lines 100 --nostream > bot-logs.txt

# Smoke test
tsx tools/quote_smoke.ts > smoke-test.txt

# Registry state
cat alpha/registry.json | jq . > registry.txt
```

### Check Documentation

- [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md) - All settings explained
- [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md) - How to operate the bot
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - Technical details

---

## 🚨 Emergency Procedures

### Stop All Trading (Live Mode)

```bash
# Stop bot immediately
pm2 stop alpha-snipes-paper

# Verify stopped
pm2 status
```

**Then manually close positions** via Solscan or your wallet.

---

### Reset to Default Config

```bash
# Backup current config
cp .env .env.backup

# Copy template
cp env.template .env

# Edit with your credentials only
nano .env
# Set: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, ADMIN_USER_ID

# Restart
pm2 restart alpha-snipes-paper --update-env
```

---

### Clear All State

```bash
# Stop bot
pm2 stop alpha-snipes-paper

# Backup data
cp -r data data.backup
cp -r alpha alpha.backup

# Clear (fresh start)
rm -rf data/ alpha/

# Restart (bot recreates folders)
pm2 restart alpha-snipes-paper
```

---

**Still stuck? Review [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md) or [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md)** 🔍




