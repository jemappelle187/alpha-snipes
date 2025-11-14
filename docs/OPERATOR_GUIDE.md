# 🎯 Alpha Snipes Operator Guide

**For traders and bot operators** - Complete guide to setup, operation, and monitoring.

---

## 📋 Prerequisites

### Required
- **Node.js 20+** (check: `node --version`)
- **npm** (comes with Node.js)
- **Telegram account** with bot token and chat ID
- **Solana RPC endpoint** (free or premium like Helius)

### Optional (Recommended)
- **PM2** for 24/7 operation (`npm install -g pm2`)
- **Premium RPC** (Helius/QuickNode) for better reliability

---

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
# Fix npm cache (macOS/Linux, one-time)
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"

# Install packages
cd "/path/to/Alpha Snipes"
npm install
```

### 2. Configure

```bash
# Copy template
cp env.template .env

# Edit configuration
nano .env
```

**Minimal paper mode setup:**
```env
TELEGRAM_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TRADE_MODE=paper
ALPHA_WALLET=wallet_to_copy
BUY_SOL=0.01
```

See [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md) for all options.

### 3. Run

```bash
# Foreground (testing)
npm start

# Background (24/7 with PM2)
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs alpha-snipes-paper
```

---

## 📄 Paper Mode Walkthrough

### What is Paper Mode?

**Zero-risk simulation** using live market data. No blockchain transactions, no wallet key required.

**Features:**
- ✅ Real-time alpha wallet monitoring
- ✅ Live Jupiter quotes for pricing
- ✅ Full rug check validation
- ✅ Simulated position tracking
- ✅ Exit management (TP/trailing stop)
- ✅ PnL reporting with `/pnl` and `/open`
- ✅ Trade ledger (`data/trades.jsonl`)
- ✅ Heartbeat monitoring every 15 minutes
- ✅ All Telegram alerts tagged with `[PAPER]`

### Complete Trade Flow Example

#### 1. Alpha Detection
```
[PAPER] 👀 Alpha touched new mint EPjFWd…Dt1v
Alpha: 97vkwMX4…bWor

[🪙 Mint] [👤 Alpha] [🔗 TX]  ← clickable inline buttons
```

#### 2. Safety Checks
**If checks fail:**
```
⛔️ Skipping EPjFWd…Dt1v due to: mint authority not revoked
• Creator can still mint more tokens (rug risk) — skipped by safety rule.
```

**If checks pass:**
```
[PAPER] ✅ Bought 0.01 SOL ($2.38) of EPjFWd…Dt1v
Entry: 0.0000012345 SOL/token (~$0.0003)

[🪙 Mint] [👤 Alpha] [🔗 TX]
```

#### 3. Sentry Monitoring
```
🛡️ Sentry monitoring EPjFWd… for 120s...
```

Early drawdown protection (default: -22% triggers emergency exit).

#### 4. Early Take-Profit

**Without Partial TP (default):**
```
[PAPER] 🎯 Early TP hit for EPjFWd…Dt1v
Price: 0.00000156 SOL (~$0.0004)
Target: 0.00000156 SOL
(no partial TP configured)
Switching to trailing stop...
```

**With Partial TP (PARTIAL_TP_PCT=0.5):**
```
[PAPER] 💡 Partial TP: Sold $1.19 | +$0.19 (+17.0%)

[PAPER] 🎯 Early TP hit for EPjFWd…Dt1v
Price: 0.00000156 SOL (~$0.0004)
Target: 0.00000156 SOL
Partial: 50% sold above
Switching to trailing stop...
```

#### 5. Trailing Stop Exit
```
[PAPER] 🛑 Trailing stop exit: EPjFWd…Dt1v
Exit: 0.00000144 SOL (~$0.0003)

[🪙 Mint] [👤 Alpha] [🔗 TX]

💡 Bought $2.38 → Sold $2.78 | +$0.40 (+17.0%)
```

**With Partial TP, final exit shows remainder:**
```
💡 Bought $1.19 → Sold $1.47 | +$0.28 (+23.5%)

Total: +$0.47 profit across 2 exits
```

---

## 🧭 Telegram Commands

### Position & Performance

```
/pnl              Show all-time realized PnL
/pnl 24h          Last 24 hours only
/pnl today        Today only (since midnight)
/open             Unrealized PnL on open positions
/force_exit <mint> Manually close position (paper only)
```

**Example `/pnl` output:**
```
📊 PnL Summary — Last 24h

Buys: 15 | Sells: 12
Win rate: 58%

Realized PnL:
$145.23 (0.0612 SOL)

💡 Use /pnl 24h or /pnl today for filtered results
```

**Example `/open` output:**
```
📂 Open positions:

EPjFWd…Dt1v  +17.3%  |  +$0.41
  Entry: 0.0000012 SOL  |  Now: 0.0000014 SOL
  🎯 TRAILING  |  8m

HU3Knq…8XBh  +5.2%  |  +$0.12
  Entry: 0.0000035 SOL  |  Now: 0.0000037 SOL
  ⏳ EARLY TP  |  3m
```

### Alpha Management

```
/add <wallet>      Add candidate (auto-scored)
/addactive <wallet> Add directly to active list
/list              Show all alphas
/promote <wallet>  Promote candidate to active
/remove <wallet>   Remove from tracking
```

### Bot Health & Monitoring

```
/status            Show bot health and recent activity
/health            Alias for /status
/debug             Toggle debug mode
/help              Command menu
```

**Example `/status` output:**
```
[BOT] 💓 Heartbeat
• Watching: 3 active, 4 candidates
• Last activity: 2m
• Last signal: 8m
• Last trade: 45m

📊 Market pulse (latest 5):
✅ 2m | buy   | EPjFWd…Dt1v for 0.010 SOL ($2.38)
👀 8m | touch | HU3Knq…8XBh by 97vkwM…bWor
⛔ 12m | skip  | mint authority not revoked
🛑 45m | exit  | Gfg3im…FmzU9 +$0.40 (+17.0%)
💡 46m | pTP   | Gfg3im…FmzU9 $1.19 (+15.0%)
```

---

## 💓 Monitoring & Health

### Automatic Heartbeat

**Every 15 minutes (default)**, the bot sends a status update:

```
[BOT] 💓 Heartbeat
• Watching: X active, Y candidates
• Last activity: Nm
• Last signal: Nm
• Last trade: Nm

📊 Market pulse (latest 5):
[recent events...]
```

**Configuration:**
```env
HEARTBEAT_EVERY_MIN=15    # 0 to disable
```

### Silent Watchdog

**After 60 minutes of no signals**, the bot alerts you:

```
[BOT] 🤫 Silent period
No new signals for 62 minutes.

• Watching 3 active, 4 candidates
• Tip: increase alpha list or relax filters if desired.
```

**Configuration:**
```env
SILENT_ALERT_MIN=60
```

### On-Demand Status

```
/status   → Immediate heartbeat
```

Use anytime to verify bot health!

---

## 📊 Trade Ledger

All trades are automatically saved to `data/trades.jsonl` in JSONL format (one JSON object per line).

### View Ledger

```bash
# Last 10 trades
tail -10 data/trades.jsonl

# All buys
grep '"kind":"buy"' data/trades.jsonl

# All profitable exits
grep '"kind":"sell"' data/trades.jsonl | grep '"pnlUsd":[0-9]'
```

### Ledger Format

**Buy entry:**
```json
{
  "t": 1699651234567,
  "kind": "buy",
  "mode": "paper",
  "mint": "EPjFWdd5...",
  "alpha": "97vkwMX4...",
  "sizeSol": 0.01,
  "entryPriceSol": 0.0000012345,
  "entryUsd": 2.38,
  "tx": "abc123..."
}
```

**Sell entry:**
```json
{
  "t": 1699651345678,
  "kind": "sell",
  "mode": "paper",
  "mint": "EPjFWdd5...",
  "alpha": "97vkwMX4...",
  "exitPriceSol": 0.0000014455,
  "exitUsd": 2.78,
  "pnlSol": 0.0008,
  "pnlUsd": 0.40,
  "pnlPct": 17.0,
  "durationSec": 245,
  "tx": "def456..."
}
```

### Analyze in Excel/Sheets

1. Copy `data/trades.jsonl` to your computer
2. Use online JSON-to-CSV converter
3. Import to spreadsheet
4. Pivot tables for alpha performance, hourly stats, etc.

---

## 🎯 Operational Best Practices

### Testing Phase (Paper Mode)

1. **Start with small size**: `BUY_SOL=0.001`
2. **Watch for 24-48 hours**: Observe skip reasons and win rate
3. **Check `/pnl 24h`**: Verify positive expectation
4. **Test commands**: `/open`, `/status`, `/force_exit`
5. **Review `data/trades.jsonl`**: Validate PnL calculations

### Going Live

1. **Verify paper success**: 60%+ win rate over 50+ trades
2. **Set realistic size**: `BUY_SOL=0.01` (adjustable later)
3. **Use premium RPC**: Helius/QuickNode for reliability
4. **Fund wallet**: 1-2 SOL to start (~50-100 trades at 0.01 SOL each)
5. **Update .env**:
   ```env
   TRADE_MODE=live
   WALLET_PRIVATE_KEY=your_base58_key
   ```
6. **Restart with PM2**:
   ```bash
   pm2 restart alpha-snipes-paper --update-env
   pm2 logs alpha-snipes-paper
   ```

### Live Mode Monitoring

- **Check `/open`** every hour
- **Review `/pnl 24h`** daily
- **Watch heartbeats** for health
- **React to silent alerts** (inactive alphas?)
- **Monitor `pm2 logs`** for errors

### When to Adjust Settings

**Too many skips (authority issues)?**
```env
REQUIRE_AUTHORITY_REVOKED=false  # Riskier but more trades
```

**Not enough trades?**
- Add more alpha wallets with `/add <wallet>`
- Increase `MAX_PRICE_IMPACT_BPS` (allows less liquid tokens)
- Check if alphas are still active (Solscan)

**Too many losses?**
- Increase `SENTRY_MAX_DRAWDOWN_PCT` → tighter emergency exit
- Decrease `EARLY_TP_PCT` → take profits sooner
- Enable partial TP to lock in early gains

**Want more frequent updates?**
```env
HEARTBEAT_EVERY_MIN=5     # More frequent
SILENT_ALERT_MIN=30       # Earlier warning
```

---

## 🔄 Partial Take-Profit Strategy

### How It Works

**Scenario: Entry at $2.38, Early TP triggers at +30%**

**With `PARTIAL_TP_PCT=0.5` (50% partial):**
1. **At +30% (Early TP):**
   - Sell 50% immediately → Lock in $0.19 profit
   - Record to ledger
   - Continue trailing with remaining 50%

2. **Trailing stop triggers at +23.5%:**
   - Sell remaining 50% → Additional $0.28 profit
   - Record to ledger
   - **Total: +$0.47** across 2 exits

**Benefits:**
- ✅ Lock in profits early
- ✅ Keep upside potential
- ✅ Reduce risk if price reverses
- ✅ Configurable (0.33 = 33%, 0.5 = 50%, etc.)

**Configuration:**
```env
PARTIAL_TP_PCT=0          # Default: disabled (100% trails)
PARTIAL_TP_PCT=0.5        # Sell 50% at Early TP
PARTIAL_TP_PCT=0.33       # Sell 33% at Early TP
```

**Trade-offs:**
- More exits = more ledger entries = easier analysis
- Less size trailing = less profit if price continues up
- Best for volatile tokens where securing profits is critical

---

## 🛡️ Safety & Risk Management

### Rug Check Defaults

```env
REQUIRE_AUTHORITY_REVOKED=true   # Skip if creator can mint/freeze
MAX_TAX_BPS=500                  # Max 5% tax
MAX_PRICE_IMPACT_BPS=3000        # Max 30% slippage
```

**When token is skipped, you'll see:**
```
⛔️ Skipping EPjFWd…Dt1v due to: mint authority not revoked
• Creator can still mint more tokens (rug risk) — skipped by safety rule.
```

### Sentry System

**First 2 minutes after buy:**
```env
SENTRY_WINDOW_SEC=120           # 2-minute window
SENTRY_MAX_DRAWDOWN_PCT=0.22    # Exit at -22%
```

If price drops 22% in first 2 minutes → emergency exit:
```
[PAPER] 🚨 Sentry abort: EPjFWd…Dt1v  |  DD: 22.0%

[🪙 Mint] [👤 Alpha] [🔗 TX]

💡 Bought $2.38 → Sold $1.85 | -$0.53 (-22.0%)
```

### Exit Strategy

```env
EARLY_TP_PCT=0.3       # Take profit at +30%
TRAIL_STOP_PCT=0.2     # Stop at -20% from high
PARTIAL_TP_PCT=0       # Optional partial exit
```

**Exit phases:**
1. **⏳ EARLY TP**: Waiting for +30% to trigger
2. **🎯 TRAILING**: Stop loss following price -20% from peak

Check phase with `/open`:
```
EPjFWd…Dt1v  +17.3%  |  +$0.41
  Entry: 0.0000012 SOL  |  Now: 0.0000014 SOL
  🎯 TRAILING  |  8m
```

---

## 📊 Reading the Ledger

### Quick Stats

```bash
# Total trades
wc -l data/trades.jsonl

# Buys vs sells
grep -c '"kind":"buy"' data/trades.jsonl
grep -c '"kind":"sell"' data/trades.jsonl

# Winning trades (profitable exits)
grep '"kind":"sell"' data/trades.jsonl | grep -c '"pnlUsd":[0-9]'

# Biggest win
grep '"kind":"sell"' data/trades.jsonl | grep '"pnlUsd"' | sort -t: -k10 -rn | head -1
```

### Export to CSV

```bash
# Install jq (JSON processor)
brew install jq  # macOS
sudo apt install jq  # Linux

# Convert to CSV
jq -r '[.t, .kind, .mint, .pnlUsd, .pnlPct] | @csv' data/trades.jsonl > trades.csv
```

---

## 🚦 What to Watch

### Startup Banner

**Verify these lines appear:**
```
🚀 Alpha Snipes Bot Starting... 📄 PAPER MODE
🔧 SOLANA_RPC_URL: https://mainnet.helius-rpc.com/...
📍 Wallet: <address>
💰 Buy size: 0.01 SOL
🎯 Early TP: 30%
🛑 Trailing stop: 20%
🔁 JUP_QUOTE_BASE override: https://lite-api.jup.ag/swap/v1/quote
🔁 JUP_SWAP_BASE override: https://lite-api.jup.ag/swap/v1/swap
```

### Periodic Heartbeat (Every 15 min)

```
[BOT] 💓 Heartbeat
• Watching: 3 active, 4 candidates
• Last activity: 2m
• Last signal: 8m

📊 Market pulse (latest 5):
[event list]
```

**If you don't see heartbeats**, check `HEARTBEAT_EVERY_MIN` in `.env`.

### Silent Alert (After 60 min of no signals)

```
[BOT] 🤫 Silent period
No new signals for 62 minutes.
```

**Action:** Check if alpha wallets are still trading (Solscan).

### Rate Limit Protection

**In logs, you may see:**
```
[PAPER][DBG] quote skipped (rate-limit)
[DBG][QUOTE] skip cooldown <mint> until <time>
```

**This is normal!** The bot conservatively rate-limits to prevent 429 errors:
- 5 calls/sec global
- 3 second per-mint cooldown
- 20 second cooldown after 429
- 60 second cooldown after 400

---

## 🔧 Common Adjustments

### Increase Trade Frequency

**More trades = more alpha wallets:**
```bash
# In Telegram
/add 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
/add H8fbGMcJrtTpztW9eUdcwHqcmoXs5XjHwsc1pQzoLP5G
```

**Relax filters:**
```env
MAX_PRICE_IMPACT_BPS=5000      # Allow higher impact (less liquid OK)
MAX_TAX_BPS=1000               # Allow up to 10% tax
```

### Reduce Risk

**Tighter stops:**
```env
EARLY_TP_PCT=0.2               # Take profit at +20%
TRAIL_STOP_PCT=0.15            # Stop at -15% from high
SENTRY_MAX_DRAWDOWN_PCT=0.15   # Emergency exit at -15%
```

**Enable partial TP:**
```env
PARTIAL_TP_PCT=0.5             # Lock 50% at Early TP
```

### Increase Position Size

**After confident with paper:**
```env
BUY_SOL=0.02                   # 2x size
# or
BUY_SOL=0.05                   # 5x size
```

**Remember:** Larger sizes need higher `MAX_PRICE_IMPACT_BPS`.

---

## 📞 Getting Help

**Commands not working?**
- Verify `ADMIN_USER_ID` in `.env` matches your Telegram user ID
- Check bot logs: `pm2 logs alpha-snipes-paper`

**No trades appearing?**
- Verify alpha wallet is active (check Solscan for recent transactions)
- Use `/status` to see last signal time
- Check if all trades are being skipped (review skip reasons)

**Too many skips?**
- Read skip explanations (they tell you why)
- Consider relaxing `REQUIRE_AUTHORITY_REVOKED` or `MAX_TAX_BPS`
- Add more diverse alpha wallets

**Bot seems offline?**
- Check `pm2 status`
- Use `/status` command
- Review `pm2 logs` for errors
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 🎯 Paper → Live Transition

### Validation Checklist

Before going live, verify in paper mode:

- [ ] Bot runs for 48+ hours without crashes
- [ ] Win rate > 60% over 50+ trades
- [ ] `/pnl 24h` shows positive expectation
- [ ] Heartbeats appear every 15 minutes
- [ ] `/open` correctly shows positions
- [ ] Skip reasons make sense
- [ ] No unexpected behaviors in logs

### Going Live

**1. Backup current `.env`:**
```bash
cp .env .env.backup
```

**2. Add wallet key:**
```env
TRADE_MODE=live
WALLET_PRIVATE_KEY=your_base58_private_key_here
```

**3. Fund wallet:**
- Transfer 1-2 SOL to bot wallet address
- Keep only what you're willing to risk

**4. Restart:**
```bash
pm2 restart alpha-snipes-paper --update-env
pm2 logs alpha-snipes-paper --lines 50
```

**5. Verify banner shows:**
```
🚀 Alpha Snipes Bot Starting... 💰 LIVE MODE
```

**6. Monitor closely:**
- Check `/open` every 30 minutes for first few hours
- Verify actual on-chain transactions appear
- Compare executed vs quoted prices

### Live Mode Differences

**What's different:**
- ✅ Real on-chain transactions
- ✅ Actual gas costs (~0.005 SOL per trade)
- ✅ Priority fees affect fill speed
- ✅ Real slippage (may differ from quotes)
- ✅ MEV exposure (front-running, sandwich attacks)
- ❌ No more `[PAPER]` tags

**PnL will include:**
- Gas costs (reduces profit)
- Real slippage (may be worse than quote)
- Priority fees (set via `CU_UNIT_PRICE_MICROLAMPORTS`)

---

## 🔐 Security

- **Never commit `.env`** to git (already in `.gitignore`)
- **Use dedicated wallet** for bot (not your main wallet)
- **Keep only needed funds** in bot wallet
- **Backup private key** securely (encrypted, offline)
- **Monitor via `/open`** and `/pnl` regularly

See [SECURITY_NOTES.md](SECURITY_NOTES.md) for more details.

---

## 📈 Performance Optimization

### For Better Fill Rates

```env
CU_UNIT_PRICE_MICROLAMPORTS=10000   # Higher priority (costs more)
```

### For Lower Costs

```env
CU_UNIT_PRICE_MICROLAMPORTS=2000    # Lower priority (may be slower)
```

### For Better API Stability

```env
# Use premium RPC
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Force stable DNS
DNS_OVERRIDE=1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4
```

### For More Conservative Rate Limiting

The bot already uses:
- 5 global calls/sec
- 3s per-mint cooldown
- 20s cooldown after 429
- 60s cooldown after 400

These are hardcoded for stability and should not need adjustment.

---

## 📝 Daily Routine

### Morning Checklist

```bash
# Check overnight performance
/pnl today

# Check open positions
/open

# Verify bot health
/status

# Review PM2 status
pm2 status
```

### Daily Recap (Automatic)

**At midnight (00:00-00:10), the bot sends:**
```
📅 Daily Recap — 11/10/2025

Buys: 12 | Sells: 10
Win rate: 70%

Realized PnL:
$145.23 (0.0612 SOL)

Biggest: +$28.50 (EPjFWd…Dt1v)
```

---

## 🚀 Advanced: PM2 Management

### Essential Commands

```bash
# Start bot
pm2 start ecosystem.config.cjs

# Restart with new env
pm2 restart alpha-snipes-paper --update-env

# Stop bot
pm2 stop alpha-snipes-paper

# View logs (live)
pm2 logs alpha-snipes-paper

# View logs (last 100 lines)
pm2 logs alpha-snipes-paper --lines 100 --nostream

# Clear old logs
pm2 flush alpha-snipes-paper

# Auto-start on reboot
pm2 startup
pm2 save
```

### Log Management

```bash
# Check log files directly
tail -f logs/out.log
tail -f logs/err.log

# Rotate logs (if large)
pm2 flush alpha-snipes-paper
```

---

## 📖 Further Reading

- [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md) - All environment variables
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - Technical architecture
- [SECURITY_NOTES.md](SECURITY_NOTES.md) - Wallet safety
- [ORACLE_DEPLOY.md](ORACLE_DEPLOY.md) - VPS deployment

---

**Happy trading! 💎✨**




