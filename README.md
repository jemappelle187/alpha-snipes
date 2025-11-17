# 🎯 Alpha Snipes

💎 **Enterprise-grade Solana alpha copy-trading bot with smart exits, partial TPs, and full monitoring.**

Automatically copy trades from successful "alpha wallets" with comprehensive safety checks, intelligent exit strategies, and professional operational monitoring.

---

## 🚀 Quick Start

### For Operators

**Run and operate the bot** → [📖 Operator Guide](docs/OPERATOR_GUIDE.md)

```bash
# Install
npm install

# Configure
cp env.template .env
nano .env

# Test in paper mode
npm start
```

### For Deployment

**Deploy to VPS** → [☁️ Oracle Cloud Guide](docs/ORACLE_DEPLOY.md)

```bash
# One-time setup
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## ✨ Key Features

### Trading & Risk Management
- 🔍 **Alpha Tracking**: Monitor multiple successful wallets with auto-scoring
- 🛡️ **Rug Checks**: Validate authorities, taxes, liquidity before every trade
- 📈 **Smart Exits**: Early TP, partial profit-taking, trailing stops
- 🚨 **Sentry System**: Emergency exit on rapid drawdown (first 2 minutes)

### Analytics & Monitoring
- 💰 **PnL Tracking**: Realized and unrealized profit reports
- 📊 **Trade Ledger**: Persistent JSONL storage for all trades
- 💓 **Heartbeat**: Periodic health updates every 15 minutes
- 🔔 **Silent Watchdog**: Alert when no signals for 60+ minutes
- 📅 **Daily Recap**: Midnight summary of previous day's performance

### User Experience
- 💬 **Telegram Bot**: Full command interface with inline buttons
- 🔗 **One-Tap Links**: Solscan mint/alpha/TX buttons
- 💵 **USD Equivalents**: Dollar values for all trades and PnL
- 📝 **Human Explanations**: Plain English skip reasons

### API Resilience
- 🔄 **Multi-Endpoint Fallback**: Automatic Jupiter API failover
- ⏸️ **Failure Cooldowns**: Smart backoff for 429/400 errors
- 🌐 **DNS Override**: Force reliable resolvers for stability
- 🛡️ **Rate Limiting**: Conservative limits prevent API abuse

---

## 📚 Complete Documentation

| Guide | For | Topics |
|-------|-----|--------|
| [**Operator Guide**](docs/OPERATOR_GUIDE.md) | Traders | Setup, commands, monitoring, going live |
| [**Developer Guide**](docs/DEVELOPER_GUIDE.md) | Engineers | Architecture, data flows, extending |
| [**Config Reference**](docs/CONFIG_REFERENCE.md) | Everyone | All environment variables explained |
| [**Troubleshooting**](docs/TROUBLESHOOTING.md) | Support | Common issues and solutions |
| [**Oracle Deploy**](docs/ORACLE_DEPLOY.md) | DevOps | VPS deployment step-by-step |
| [**Verification Checklist**](VERIFICATION_CHECKLIST.md) | Operators | Post-deployment verification guide |
| [**Changelog**](docs/CHANGELOG.md) | Everyone | Version history and updates |
| [**Security Notes**](docs/SECURITY_NOTES.md) | Operators | Wallet safety and risk disclosure |

**Start here:** [docs/README.md](docs/README.md)

---

## 🧭 Telegram Commands

### Position & Performance
```
/pnl              All-time realized PnL
/pnl 24h          Last 24 hours
/pnl today        Today only (since midnight)
/open             Unrealized PnL on open positions
/force_exit <mint> Manually close position (paper only)
```

### Alpha Management
```
/add <wallet>      Add candidate (auto-scored)
/addactive <wallet> Add directly to active list
/list              Show all alphas
/promote <wallet>  Promote candidate to active
/remove <wallet>   Remove from tracking
```

### Bot Health
```
/status            Show bot health and recent activity
/health            Alias for /status
/debug             Toggle debug mode
/help              Command menu
```

---

## ⚡ Quick Example

### Paper Mode Flow

**1. Detection**
```
[PAPER] 👀 Alpha touched new mint EPjFWd…Dt1v

[🪙 Mint] [👤 Alpha] [🔗 TX]
```

**2. Buy (after checks pass)**
```
[PAPER] ✅ Bought 0.01 SOL ($2.38) of EPjFWd…Dt1v
Entry: 0.0000012345 SOL/token (~$0.0003)

[🪙 Mint] [👤 Alpha] [🔗 TX]
```

**3. Early TP with Partial Profit**
```
[PAPER] 💡 Partial TP: Sold $1.19 | +$0.19 (+17.0%)

[PAPER] 🎯 Early TP hit for EPjFWd…Dt1v
Switching to trailing stop...
```

**4. Trailing Stop Exit**
```
[PAPER] 🛑 Trailing stop exit: EPjFWd…Dt1v
Exit: 0.00000144 SOL (~$0.0003)

[🪙 Mint] [👤 Alpha] [🔗 TX]

💡 Bought $2.38 → Sold $2.78 | +$0.40 (+17.0%)
```

---

## ⚙️ Core Configuration

**Minimal `.env` for paper mode:**
```env
TELEGRAM_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TRADE_MODE=paper
BUY_SOL=0.01
```

**For live mode, add:**
```env
TRADE_MODE=live
WALLET_PRIVATE_KEY=your_base58_key
```

**See [CONFIG_REFERENCE.md](docs/CONFIG_REFERENCE.md) for all options.**

---

## 🛠️ Technical Stack

- **TypeScript + Node.js 20**: Modern ES2022 modules
- **Solana Web3.js**: Blockchain interaction
- **Jupiter Aggregator**: Token swaps and quotes
- **Telegram Bot API**: Alerts and commands
- **PM2**: Process management for 24/7 operation

---

## 📖 Getting Started

### 1. Read the Operator Guide
Start with [docs/OPERATOR_GUIDE.md](docs/OPERATOR_GUIDE.md) for complete setup instructions.

### 2. Test in Paper Mode
Run for 48+ hours in paper mode to understand the bot behavior.

### 3. Monitor Performance
Use `/pnl 24h` and `/open` to track results.

### 4. Deploy to VPS
Follow [docs/ORACLE_DEPLOY.md](docs/ORACLE_DEPLOY.md) for 24/7 operation.

### 5. Go Live (Optional)
Only after paper mode success and understanding all features.

---

## ✅ Smoke Test & Verification

After deployment or updates, verify all bot functionality is working correctly.

### Quick Verification

Run the automated verification script:

```bash
# On your VPS
cd ~/Alpha\ Snipes
./tools/verify_bot.sh alpha-snipes-paper 500
```

This checks:
- ✅ Config & startup sanity
- ✅ Entry paths (alpha, watchlist, force-buy)
- ✅ Entry-price robustness (no zero prices)
- ✅ Liquidity triangulation
- ✅ Exit behavior (+20% TP, max loss, etc.)
- ✅ Error & regression checks

### Manual Verification

For detailed manual checks, see **[VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md)**.

**Quick manual checks:**
```bash
# 1. Check config on startup
pm2 logs alpha-snipes-paper --lines 50 | grep -E "\[CONFIG\]|Bot Started"

# 2. Check recent entries (should show non-zero entry prices)
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[ENTRY\]\[OPEN\]|Entry Price:"

# 3. Check for errors
pm2 logs alpha-snipes-paper --lines 500 | grep -E "\[ENTRY\]\[PRICE\]\[FATAL\]|Cannot access|Entry: 0 SOL"

# 4. Check exits
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[EXIT\].*Position closed"
```

**Expected results:**
- ✅ No "Entry: 0 SOL" messages
- ✅ All entry prices calculated from swap amounts
- ✅ No "Cannot access 'priceRatio'" errors
- ✅ Exit logs show proper reasons (hard_profit_20pct, max_loss, etc.)

---

## 🔐 Security

- ✅ Use **dedicated wallet** with minimal funds (1-2 SOL)
- ✅ **Test in paper mode** first (48+ hours)
- ✅ Store private key in `.env` only (chmod 600)
- ✅ Set `ADMIN_USER_ID` to YOUR Telegram ID
- ✅ Enable rug checks (`REQUIRE_AUTHORITY_REVOKED=true`)
- ✅ Use exit management (never disable TP/trailing stop)

**See [SECURITY_NOTES.md](docs/SECURITY_NOTES.md) for detailed guidance.**

---

## 📊 Example Results

**Paper mode performance (example, not guaranteed):**
```
📊 PnL Summary — Last 24h

Buys: 15 | Sells: 12
Win rate: 58%

Realized PnL:
$145.23 (0.0612 SOL)

Biggest: +$28.50 (EPjFWd…Dt1v)
```

**⚠️ Past performance does not guarantee future results.**

---

## 🆘 Need Help?

| Issue | See |
|-------|-----|
| **Setup problems** | [OPERATOR_GUIDE.md](docs/OPERATOR_GUIDE.md) |
| **Bot not working** | [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| **Config questions** | [CONFIG_REFERENCE.md](docs/CONFIG_REFERENCE.md) |
| **Technical deep-dive** | [DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) |

---

## 🎁 What's New

**Recent updates:**
- ✅ Partial Take-Profit (configurable splits)
- ✅ Trade Ledger (persistent JSONL)
- ✅ Heartbeat & Watchdog (health monitoring)
- ✅ Inline Telegram Buttons (one-tap links)
- ✅ USD Equivalents (dollar values)
- ✅ Failure Cooldowns (429/400 backoff)
- ✅ Comprehensive documentation in `/docs`

**See [CHANGELOG.md](docs/CHANGELOG.md) for full history.**

---

## ⚖️ Disclaimer

**Alpha Snipes is provided "as is" without warranty.**

- ❌ No guarantee of profit
- ❌ No liability for losses  
- ❌ Not financial advice

**Trading crypto carries significant risk. Only trade with funds you can afford to lose.**

---

## 📝 License

MIT License - See LICENSE file for details.

---

**Built with 💎 for the Solana trading community**

⚡ **Fast. Safe. Automated.** ⚡

---

## 🔗 Quick Links for Operators

```bash
# Test in paper mode
./docs/OPERATOR_GUIDE.md → Section: Paper Mode Setup

# Deploy to VPS
./docs/ORACLE_DEPLOY.md

# Understand all settings
./docs/CONFIG_REFERENCE.md

# Bot not working?
./docs/TROUBLESHOOTING.md

# Learn architecture
./docs/DEVELOPER_GUIDE.md
```

**Start here:** [docs/README.md](docs/README.md) 📚
