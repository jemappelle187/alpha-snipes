# 🚀 Getting Started with Alpha Snipes

Welcome! This guide will take you from zero to a fully functional alpha copy-trading bot in **3 phases**.

---

## 📋 Phase 1: Paper Trading (Recommended Start)

**Goal:** Test the bot with ZERO RISK to validate it works and learn the system.

### Step 1: Install Dependencies

```bash
# Fix npm cache (one-time)
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"

# Install packages
cd "/Users/emmanuelyeboah/Projects/Alpha Snipes"
npm install
```

### Step 2: Configure for Paper Mode

```bash
# Copy template
cp env.template .env

# Edit config
nano .env
```

**Required settings:**

```env
# Telegram (already configured)
TELEGRAM_TOKEN=7942901226:AAEvyakUM4kK-rzOhDzAkZxQcZpO1RiE2UQ
TELEGRAM_CHAT_ID=-1003291954761

# Paper mode (default)
TRADE_MODE=paper

# Add ONE alpha wallet to start
ALPHA_WALLET=8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp

# Trade settings
BUY_SOL=0.02
```

**NOT needed in paper mode:**
- ❌ `WALLET_PRIVATE_KEY` (leave empty)
- ❌ `COMMAND_CHAT_ID` (optional, for later)
- ❌ `ADMIN_USER_ID` (optional, for later)

### Step 3: Run Paper Trading

```bash
npm start
```

**Expected output:**

```
📄 PAPER MODE: No real transactions will be sent
🚀 Alpha Snipes Bot Starting... 📄 PAPER MODE

⚠️  PAPER MODE ACTIVE - No real transactions will be sent!
```

**Check Telegram:** You should see `[PAPER]` bot started message.

### Step 4: Let It Run (24-48 hours)

Watch your Telegram channel for:
- `[PAPER] 👀 Alpha touched new mint...`
- `[PAPER] ✅ Bought...` or `[PAPER] ⛔️ Skipping...`
- `[PAPER] 🎯 Early TP hit...`
- `[PAPER] 🛑 Trailing stop exit...`
- `[PAPER] 📈 PnL...`

**Analyze results:**
- Win rate (profitable exits / total exits)
- Average PnL per trade
- Which tokens got filtered (rug checks working?)

### Step 5: Tune Settings (if needed)

Based on paper results, adjust in `.env`:

```env
# More conservative
MAX_TAX_BPS=300
SENTRY_MAX_DRAWDOWN_PCT=0.15

# or more aggressive
EARLY_TP_PCT=0.5
TRAIL_STOP_PCT=0.25
```

Then `Ctrl+C` and `npm start` again.

**Read:** [PAPER_MODE.md](PAPER_MODE.md) for complete paper trading guide.

---

## 🔍 Phase 2: Alpha Verifier (Discover Better Alphas)

**Goal:** Use the Alpha Verifier to automatically test and promote candidate wallets.

### Step 1: Get Your Telegram IDs

**A) Get Command Chat ID:**

Send a message to your bot (in your channel or DM), then visit:

```
https://api.telegram.org/bot7942901226:AAEvyakUM4kK-rzOhDzAkZxQcZpO1RiE2UQ/getUpdates
```

Find `"chat":{"id":...}` and copy that ID.

**B) Get Your User ID:**

In the same response, find `"from":{"id":...}` and copy your user ID.

### Step 2: Update .env

```env
# Command Control
COMMAND_CHAT_ID=-1003291954761  # Or your DM chat ID
ADMIN_USER_ID=your_telegram_user_id_here
```

### Step 3: Restart Bot

```bash
# Stop with Ctrl+C
npm start
```

### Step 4: Test Commands

In your Telegram channel (or command chat), send:

```
/help
```

You should get the command list. If not, check your IDs.

### Step 5: Add Alpha Candidates

Found some promising wallets on Twitter? Add them:

```
/alpha_add 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
/alpha_add 9ABcdEfGhIjK1LmN2oPqRsT3UvWxY4Za5bCdE6fGhIjK
/alpha_add 5FgHiJkLmN1oPqR2StU3vWxY4ZaBcD5eF6gHiJ7kLmNo
```

Bot will now:
- Watch these wallets
- Score them when they touch new mints early
- Auto-promote after 2 signals in 24h
- Start trading them automatically

### Step 6: Monitor & Manage

**Check status:**
```
/alpha_list
```

**Remove non-performers:**
```
/alpha_remove <address>
```

**Manually promote:**
```
/alpha_promote <address>
```

**Read:** [ALPHA_VERIFIER.md](ALPHA_VERIFIER.md) for complete verifier guide.

---

## 🔄 Phase 3: Persistent Running with PM2

**Goal:** Keep bot running 24/7, even after closing terminal or server reboot.

### Step 1: Install PM2

```bash
npm install -g pm2
```

### Step 2: Start with PM2

```bash
pm2 start ecosystem.config.js
```

### Step 3: Save & Enable Auto-Start

```bash
pm2 save
pm2 startup
```

The second command prints a `sudo` command - **copy and run it**, then:

```bash
pm2 save
```

### Step 4: Verify

```bash
pm2 status
```

Should show `alpha-snipes-paper` as `online`.

### Step 5: View Logs

```bash
pm2 logs alpha-snipes-paper
```

Press `Ctrl+C` to exit (bot keeps running).

**Now you can:**
- Close terminal ✅
- Reboot server ✅
- Bot keeps running ✅

**Read:** [PM2_SETUP.md](PM2_SETUP.md) for complete PM2 guide.

---

## 💰 Phase 4: Live Trading (After Paper Testing)

**Goal:** Switch to real trading after validating in paper mode.

### Prerequisites Checklist

- [ ] Paper tested for 24-48 hours minimum
- [ ] Positive average PnL in paper mode
- [ ] Understand rug checks and exit logic
- [ ] Created dedicated trading wallet
- [ ] Funded wallet with SOL (start with 0.5 SOL max)
- [ ] Alpha Verifier working (candidates scoring/promoting)

### Step 1: Get Wallet Private Key

**From Phantom:**
1. Settings → Security & Privacy
2. Export Private Key
3. Copy the **base58** string

### Step 2: Update .env

```env
# SWITCH TO LIVE MODE
TRADE_MODE=live

# ADD WALLET KEY
WALLET_PRIVATE_KEY=your_base58_private_key_from_phantom

# START TINY!
BUY_SOL=0.001
```

### Step 3: Restart Bot

**If using PM2:**
```bash
pm2 restart alpha-snipes-paper
pm2 logs alpha-snipes-paper
```

**If running directly:**
```bash
# Stop with Ctrl+C
npm start
```

### Step 4: Verify Live Mode

**Console shows:**
```
🚀 Alpha Snipes Bot Starting... 💰 LIVE MODE
```

**Telegram shows:**
```
🚀 Alpha Snipes Bot Started (LIVE)
```

**No more `[PAPER]` tags!**

### Step 5: Monitor First Trades Closely

Watch Telegram for:
- Real transaction links (Solscan)
- Actual SOL spent/received
- PnL tracking

### Step 6: Gradually Scale Up

Start with:
- `BUY_SOL=0.001` (first 10-20 trades)
- Then `BUY_SOL=0.005` (next 20 trades)
- Then `BUY_SOL=0.01` (if performing well)
- Scale slowly based on results

---

## 🎯 Quick Reference

### Daily Operations

**Start bot (PM2):**
```bash
pm2 start ecosystem.config.js
```

**View logs:**
```bash
pm2 logs alpha-snipes-paper
```

**Check alpha status:**
```
/alpha_list
```

**Add new candidate:**
```
/alpha_add <wallet_address>
```

### Common Tasks

**Update settings:**
```bash
nano .env
pm2 restart alpha-snipes-paper  # If using PM2
# or Ctrl+C and npm start if running directly
```

**Switch paper ↔ live:**
```bash
nano .env  # Change TRADE_MODE
pm2 restart alpha-snipes-paper
```

**Add alpha without scoring:**
```
/alpha_add_active <wallet_address>
```

### Troubleshooting

**Bot not starting:**
```bash
pm2 logs alpha-snipes-paper --err
```

**Commands not working:**
- Check `COMMAND_CHAT_ID` and `ADMIN_USER_ID` in `.env`
- Send `/help` to test

**Candidates not scoring:**
- Wait longer (some alphas trade infrequently)
- Check wallet is active on Solscan
- Try different candidates

---

## 📚 Full Documentation

### Core Guides
- **[PAPER_MODE.md](PAPER_MODE.md)** - Paper trading details
- **[QUICKSTART.md](QUICKSTART.md)** - Alternative quick start
- **[INSTALLATION.md](INSTALLATION.md)** - Detailed installation
- **[README.md](README.md)** - Complete feature list

### Advanced Features
- **[ALPHA_VERIFIER.md](ALPHA_VERIFIER.md)** - Alpha discovery system
- **[PM2_SETUP.md](PM2_SETUP.md)** - 24/7 operation
- **[SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md)** - Telegram setup

---

## 🎓 Learning Path

**Week 1: Paper Trading**
- Day 1: Setup and run paper mode
- Days 2-7: Watch, learn, tune settings

**Week 2: Alpha Discovery**
- Add 5-10 candidate wallets
- Let them score automatically
- Remove non-performers

**Week 3: Optimization**
- Analyze paper trading results
- Tune rug checks and exit strategies
- Test aggressive vs conservative settings

**Week 4: Go Live**
- Switch to live mode with tiny positions
- Monitor closely
- Gradually scale up

---

## ⚠️ Important Reminders

1. **Start small** - Use 0.001-0.01 SOL per trade initially
2. **Paper test first** - Minimum 24-48 hours
3. **Dedicated wallet** - Don't use your main wallet
4. **Limited funds** - Only keep what you're actively trading
5. **Monitor closely** - Especially first week of live trading
6. **Premium RPC** - Free RPC will rate-limit you ([Helius](https://helius.dev), [QuickNode](https://quicknode.com))

---

## 🚀 You're Ready!

Follow the phases in order:
1. ✅ Paper mode (validate)
2. ✅ Alpha Verifier (discover)
3. ✅ PM2 (persist)
4. ✅ Live mode (trade)

**Questions? Check the documentation or review console/Telegram logs for details.**

**Happy sniping! 🎯💎**


