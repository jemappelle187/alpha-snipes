# 🎯 Alpha Snipes - Quick Reference Card

## ✅ Bot Status: RUNNING

**Current Mode:** Paper Trading (Zero Risk)  
**PID:** Check with `pgrep -f "tsx index.ts"`  
**Logs:** `logs/bot_*.log`

---

## 📱 Telegram Commands

Use these in your **DM with the bot** (or command chat):

| Command | Description |
|---------|-------------|
| `/alpha_list` | Show all active & candidate alphas with scores |
| `/alpha_add <address>` | Add wallet as candidate (auto-scores) |
| `/alpha_add_active <address>` | Add directly to active (skip scoring) |
| `/alpha_promote <address>` | Manually promote candidate to active |
| `/alpha_remove <address>` | Remove wallet from candidates or active |
| `/help` | Show all commands |

**Example:**
```
/alpha_add 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
```

---

## 🔧 Terminal Commands

| Command | Description |
|---------|-------------|
| `tail -f logs/bot_*.log` | Watch live logs |
| `pkill -f "tsx index.ts"` | Stop bot |
| `./RUN_NOW.sh` | Start/restart bot |
| `pgrep -f "tsx index.ts"` | Check if bot is running |
| `cat alpha/registry.json` | View alpha registry directly |

---

## 📊 What to Expect

### Active Alpha Trades (in channel):
```
[PAPER] 👀 Alpha touched new mint EPjFWdd5...
[PAPER] ✅ Bought 0.02 SOL (checks passed)
[PAPER] 🛡️ Sentry monitoring...
[PAPER] 🎯 Early TP hit: +30%
[PAPER] 🛑 Trailing stop exit
[PAPER] 📈 PnL: +0.0040 SOL (+20.0%)
```

### Candidate Scoring (in channel):
```
[PAPER] 🧪 Candidate signal
Wallet: 7xKXtg2C...
Mint: EPjFWdd5...

(After 2 signals in 24h:)
✅ AUTO-PROMOTED to active!
```

---

## ⚙️ Configuration (.env)

### Current Settings:
```env
TRADE_MODE=paper          # paper or live
BUY_SOL=0.01             # Position size
EARLY_TP_PCT=0.3         # Take profit at +30%
TRAIL_STOP_PCT=0.2       # Trail stop at -20% from high
MAX_TAX_BPS=500          # Max 5% tax
SENTRY_MAX_DRAWDOWN_PCT=0.22  # Exit at -22% early
```

### Quick Tuning:

**More Conservative:**
```env
EARLY_TP_PCT=0.25
TRAIL_STOP_PCT=0.18
MAX_TAX_BPS=300
```

**More Aggressive:**
```env
EARLY_TP_PCT=0.5
TRAIL_STOP_PCT=0.25
MAX_TAX_BPS=1000
```

After editing: `pkill -f "tsx index.ts" && ./RUN_NOW.sh`

---

## 🚀 PM2 Setup (Recommended)

### Install:
```bash
sudo npm install -g pm2
```

### Start:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the sudo command
pm2 save
```

### Manage:
```bash
pm2 status                  # Check status
pm2 logs alpha-snipes-paper # View logs
pm2 restart alpha-snipes-paper  # Restart
pm2 stop alpha-snipes-paper     # Stop
```

**See START_PM2.md for complete guide.**

---

## 🎓 Workflow

### Phase 1: Paper Testing (Now)
1. ✅ Bot running in paper mode
2. ⏳ Add 5-10 alpha candidates
3. ⏳ Let run for 24-48 hours
4. ⏳ Review which candidates promote

### Phase 2: Optimization (Days 3-7)
5. Review paper trading PnL
6. Remove non-performing candidates
7. Tune settings based on results
8. Add more candidates if needed

### Phase 3: Go Live (When Ready)
9. Switch `TRADE_MODE=live`
10. Add `WALLET_PRIVATE_KEY`
11. Start with `BUY_SOL=0.001`
12. Gradually scale up

---

## 📚 Full Documentation

- **START_PM2.md** - Complete PM2 setup
- **ALPHA_VERIFIER.md** - How auto-discovery works
- **GETTING_STARTED.md** - Full 4-phase guide
- **PAPER_MODE.md** - Paper trading details
- **PM2_SETUP.md** - PM2 management guide

---

## 🆘 Troubleshooting

### Bot not responding to commands
- Check `COMMAND_CHAT_ID` and `ADMIN_USER_ID` in `.env`
- Make sure bot is running: `pgrep -f "tsx index.ts"`
- Check logs: `tail -50 logs/bot_*.log`

### No alpha trades appearing
- Verify alpha wallet is active on Solscan
- Check logs for "Watching active: ..."
- May take hours/days for alpha to trade

### Candidates not scoring
- Normal if they're not trading
- Check wallet activity on Solscan
- Remove after 7 days if still 0 signals

### Bot crashed/stopped
- Check logs: `tail -100 logs/bot_*.log`
- Restart: `./RUN_NOW.sh`
- Consider PM2 for auto-restart

---

## 💡 Pro Tips

1. **Start with 5-10 candidates** - More candidates = better discovery
2. **Check /alpha_list daily** - See who's performing
3. **Remove non-performers** - Keep only good alphas
4. **Use PM2 for reliability** - Auto-restart + reboot survival
5. **Paper test for 1-2 weeks** - Validate before going live
6. **Start live with tiny positions** - 0.001 SOL minimum
7. **Monitor first 10 live trades closely** - Verify everything works

---

## ✅ Health Check

Run this checklist daily:

- [ ] `pgrep -f "tsx index.ts"` returns a PID (bot running)
- [ ] `/alpha_list` works in Telegram
- [ ] Telegram channel has recent alerts (if alpha traded)
- [ ] `tail -10 logs/bot_*.log` shows no errors
- [ ] `cat alpha/registry.json` shows your alphas

---

## 🎯 Quick Actions

**View current alphas:**
```bash
cat alpha/registry.json | grep -A 5 "active"
```

**Check last 20 log lines:**
```bash
tail -20 logs/bot_*.log
```

**Restart bot:**
```bash
pkill -f "tsx index.ts" && ./RUN_NOW.sh
```

**Test Telegram:**
```
/alpha_list
```

---

## 📞 Support

If stuck:
1. Check logs first: `tail -100 logs/bot_*.log`
2. Review relevant .md file
3. Check .env configuration
4. Verify bot is running: `pgrep -f "tsx index.ts"`

---

**Last Updated:** When bot started  
**Mode:** Paper Trading  
**Status:** ✅ Running

---

**Remember: This is paper trading! No real money at risk. Test thoroughly before going live!** 🎯


