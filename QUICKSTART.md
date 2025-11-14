# 🚀 Alpha Snipes - Quick Start

## ⚡ Paper Mode (Recommended First!)

**Test the bot with ZERO RISK before using real money!**

See **[PAPER_MODE.md](PAPER_MODE.md)** for the complete paper trading guide.

### Paper Mode Quick Start

```bash
# 1. Install
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"
cd "/Users/emmanuelyeboah/Projects/Alpha Snipes"
npm install

# 2. Configure
cp env.template .env
nano .env

# Required: Set ALPHA_WALLET only (no private key needed!)
# TRADE_MODE is already set to 'paper' by default

# 3. Run
npm start
```

Watch your Telegram channel for `[PAPER]` tagged alerts!

---

## 💰 Live Mode (After Paper Testing)

## 1️⃣ Fix NPM Cache (One-time Fix)

```bash
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"
cd "/Users/emmanuelyeboah/Projects/Alpha Snipes"
rm -rf node_modules package-lock.json
npm install
```

## 2️⃣ Configure Your Bot

```bash
cp env.template .env
nano .env  # or use your favorite editor
```

**Required fields for live mode:**
- `TRADE_MODE=live` - Enable real trading
- `WALLET_PRIVATE_KEY` - Your trading wallet (base58 format from Phantom)
- `ALPHA_WALLET` - The wallet address you want to copy

**Optional tuning:**
- `BUY_SOL` - Start with 0.001-0.01 for live testing
- `CU_UNIT_PRICE_MICROLAMPORTS` - Increase to 8000-10000 for faster fills
- `PARTIAL_TP_PCT=0.5` - Partial take-profit example

Partial take-profit allows the bot to sell a portion (e.g. 50%) at early TP and trail the remainder for additional upside.

## 3️⃣ Fund Your Wallet

Make sure your trading wallet has:
- Minimum: 0.1 SOL (for ~20 small trades + gas)
- Recommended: 0.5-1 SOL for active trading

## 4️⃣ Start the Bot

```bash
npm start
```

Expected output:
```
🚀 Alpha Snipes Bot Starting...
📍 Wallet: Your...PublicKey
👀 Watching: Alpha...Wallet
💰 Buy size: 0.01 SOL
```

Check your Telegram channel for the startup message!

## 🎯 What Happens Next

1. Bot monitors alpha wallet every 3 seconds
2. When alpha touches a new token:
   - ✅ Runs safety checks (authorities, tax, routes)
   - 💰 Buys if checks pass
   - 🛡️ Activates 2-min sentry (emergency exit on -22% DD)
   - 🎯 Manages exit (30% TP → 20% trailing stop)
3. All actions are reported to your Telegram channel

The bot now includes:
• 💓 Heartbeat every 15 minutes (proof of life)
• 🤫 Silent watchdog alert after 60 minutes of inactivity
• 💰 Persistent ledger tracking (data/trades.jsonl)
• ⚡ Real-time PnL and open position tracking (/pnl, /open)

## 📊 Telegram Alerts

You’ll now receive alerts with clean inline buttons:
[🪙 Mint] [👤 Alpha] [🔗 TX]
Each button links directly to Solscan for instant viewing.

## 💬 Bot Commands
/status – Show live bot heartbeat and market pulse  
/pnl – View realized profit/loss summary  
/pnl 24h – View last 24h results  
/open – View unrealized PnL of open positions

## ⚙️ Quick Tuning

### More Aggressive (Faster Fills)
```env
CU_UNIT_PRICE_MICROLAMPORTS=10000
EARLY_TP_PCT=0.5
TRAIL_STOP_PCT=0.15
```

### More Conservative (Safer)
```env
MAX_TAX_BPS=300
MAX_PRICE_IMPACT_BPS=2000
SENTRY_MAX_DRAWDOWN_PCT=0.15
EARLY_TP_PCT=0.2
```

### Larger Position Size
```env
BUY_SOL=0.05
```

## 🛑 Stop the Bot

Press `Ctrl+C` in the terminal

## 🔄 Run in Background (Optional)

```bash
npm install -g pm2
pm2 start "npm start" --name alpha-snipes
pm2 logs alpha-snipes  # View logs
pm2 stop alpha-snipes  # Stop bot
```

For 24/7 uptime and remote visibility, integrate Oracle Cloud monitoring (planned in upcoming release).

## 🐛 Quick Troubleshooting

| Issue | Fix |
|-------|-----|
| "Invalid WALLET_PRIVATE_KEY" | Use base58 format (from Phantom export) |
| "Cannot find module" | Run `npm install` again |
| No alpha trades detected | Verify ALPHA_WALLET is active and correct |
| "Failed to get recent blockhash" | RPC rate limited - use premium RPC |
| "Too Many Requests" or "Bad Request" | Jupiter rate-limited — bot automatically cools down and retries |

## 📚 Full Documentation

- `INSTALLATION.md` - Detailed setup guide
- `README.md` - Full feature documentation

## ⚠️ Important

- Start with **small amounts** (0.001-0.01 SOL)
- Test with a **fresh wallet** first
- Never share your `.env` file
- Monitor the first few trades closely

---

**Ready to snipe! 🎯** Watch your Telegram channel for live updates.
