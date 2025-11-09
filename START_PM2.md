# 🚀 Start Bot with PM2 - Manual Instructions

## Step 1: Install PM2 Globally

Open your terminal and run:

```bash
sudo npm install -g pm2
```

Enter your password when prompted.

---

## Step 2: Stop Any Running Instances

```bash
cd "/Users/emmanuelyeboah/Projects/Alpha Snipes"
pkill -f "tsx index.ts" || true
```

---

## Step 3: Start with PM2

```bash
pm2 start ecosystem.config.js
```

Expected output:
```
[PM2] Starting /Users/.../ecosystem.config.js in fork_mode (1 instance)
[PM2] Done.
┌────────────────────┬────┬─────────┬──────┬───────┬────────┬─────────┐
│ Name               │ id │ mode    │ ↺    │ status│ cpu    │ memory  │
├────────────────────┼────┼─────────┼──────┼───────┼────────┼─────────┤
│ alpha-snipes-paper │ 0  │ fork    │ 0    │ online│ 0%     │ 0b      │
└────────────────────┴────┴─────────┴──────┴───────┴────────┴─────────┘
```

---

## Step 4: Save Configuration

```bash
pm2 save
```

This saves the process list so PM2 remembers it.

---

## Step 5: Enable Auto-Start on Reboot

```bash
pm2 startup
```

This will print a command like:
```bash
sudo env PATH=$PATH:/usr/local/bin pm2 startup systemd -u emmanuelyeboah --hp /Users/emmanuelyeboah
```

**Copy and run that exact command**, then:

```bash
pm2 save
```

---

## Step 6: View Logs

```bash
pm2 logs alpha-snipes-paper
```

You should see:
```
[PAPER] 🚀 Alpha Snipes Bot Started (PAPER MODE)
👀 Watching active: 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp
```

Press `Ctrl+C` to exit logs (bot keeps running).

---

## ✅ Verify It's Running

**Check status:**
```bash
pm2 status
```

**Check Telegram:**
Go to your Alpha Snipes channel - you should see the `[PAPER] Bot Started` message.

---

## 🎯 Test Telegram Commands

In your **DM with the bot** (or command chat), send:

```
/alpha_list
```

You should see:
```
🎯 Active Alphas (currently trading):
  • 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp

🧪 Candidates (being scored):
  (none)
```

---

## 🔍 Add Alpha Candidates

Add some wallets to test:

```
/alpha_add 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
```

Bot responds:
```
👀 Candidate added:
7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX

The bot will now monitor this wallet and score it...
```

**Add 5-10 candidates:**
```
/alpha_add 9ABcdEfGhIjK1LmN2oPqRsT3UvWxY4Za5bCdE6fGhIjK
/alpha_add 5FgHiJkLmN1oPqR2StU3vWxY4ZaBcD5eF6gHiJ7kLmNo
/alpha_add 3CdEfGhIjK1mN2oPqR3StUvW4xY5ZaB6cDeF7gHiJk
/alpha_add 6GhIjKlMnO1pQr2StU3vWxY4ZaBcD5eF6gHiJ7kLmN
```

Check status:
```
/alpha_list
```

---

## 📊 Monitoring Commands

**View live logs:**
```bash
pm2 logs alpha-snipes-paper
```

**Check status:**
```bash
pm2 status
```

**Restart bot:**
```bash
pm2 restart alpha-snipes-paper
```

**Stop bot:**
```bash
pm2 stop alpha-snipes-paper
```

**Delete from PM2:**
```bash
pm2 delete alpha-snipes-paper
```

---

## 🎓 What Happens Next

### Auto-Scoring (24-48 hours)

Bot watches all candidates. When they touch new mints first:

```
[PAPER] 🧪 Candidate signal
Wallet: 7xKXtg2C...
Mint: EPjFWdd5...
TX: abc12345...
```

After 2 signals in 24h:
```
[PAPER] 🧪 Candidate signal
Wallet: 7xKXtg2C...

✅ AUTO-PROMOTED to active!
```

Now bot starts paper trading that wallet!

### Review Performance

After 24-48 hours:
```
/alpha_list
```

See which candidates:
- Got promoted (have signals, now active)
- Still scoring (1 signal)
- Not performing (0 signals)

Remove non-performers:
```
/alpha_remove <address>
```

---

## ⚙️ Tuning Settings (Optional)

Edit `.env` to adjust:

**More conservative:**
```env
EARLY_TP_PCT=0.25
TRAIL_STOP_PCT=0.18
MAX_TAX_BPS=300
```

**More aggressive:**
```env
EARLY_TP_PCT=0.5
TRAIL_STOP_PCT=0.25
MAX_TAX_BPS=1000
```

After editing, restart:
```bash
pm2 restart alpha-snipes-paper
```

---

## 🚦 Going Live (Later)

**Only after paper results look good!**

1. Create fresh trading wallet
2. Fund with 0.5 SOL max
3. Edit `.env`:
```env
TRADE_MODE=live
WALLET_PRIVATE_KEY=your_base58_private_key_here
BUY_SOL=0.001  # Start TINY!
```

4. Restart:
```bash
pm2 restart alpha-snipes-paper
pm2 logs alpha-snipes-paper
```

Should see: `💰 LIVE MODE`

---

## ✅ Quick Health Checklist

- [ ] `pm2 status` shows `online`
- [ ] `pm2 logs` shows "Bot Started"
- [ ] Telegram channel has `[PAPER] Bot Started` message
- [ ] `/alpha_list` in DM works
- [ ] `/alpha_add` in DM works and bot responds

---

## 📚 Next Steps

1. **Let it run 24-48 hours** in paper mode
2. **Add 5-10 alpha candidates** via `/alpha_add`
3. **Monitor which ones get promoted** automatically
4. **Review paper trading PnL** in Telegram
5. **Tune settings** based on results
6. **Switch to live mode** when confident

---

**You're all set! 🚀**


