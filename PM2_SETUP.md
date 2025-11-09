# 🔄 PM2 Setup - Keep Bot Running 24/7

## What is PM2?

**PM2 (Process Manager 2)** is a production-grade process manager that keeps your bot running:

- ✅ **Runs in background** - Close terminal, bot keeps running
- ✅ **Auto-restart** - Restarts if crashes
- ✅ **Survives reboots** - Auto-starts after server restart
- ✅ **Log management** - Captures all output
- ✅ **Process monitoring** - CPU, memory usage

**Perfect for running Alpha Snipes 24/7 without babysitting!**

---

## 🚀 Quick Start

### 1. Install PM2

```bash
npm install -g pm2
```

This installs PM2 globally on your system.

### 2. Start the Bot

```bash
cd "/Users/emmanuelyeboah/Projects/Alpha Snipes"
pm2 start ecosystem.config.js
```

### 3. Save Configuration

```bash
pm2 save
```

This saves the current process list so PM2 remembers it.

### 4. Enable Auto-Start on Boot

```bash
pm2 startup
```

This command will print a `sudo` command. **Copy and run it**:

```bash
sudo env PATH=$PATH:/usr/local/bin pm2 startup systemd -u yourusername --hp /Users/yourusername
```

Then save again:

```bash
pm2 save
```

**Done!** Your bot now runs 24/7 and survives reboots.

---

## 📊 Managing Your Bot

### View Status

```bash
pm2 status
```

Output:
```
┌────────────────────┬────┬─────────┬──────┬───────┬────────┬─────────┐
│ Name               │ id │ mode    │ ↺    │ status│ cpu    │ memory  │
├────────────────────┼────┼─────────┼──────┼───────┼────────┼─────────┤
│ alpha-snipes-paper │ 0  │ fork    │ 0    │ online│ 0.3%   │ 45.2mb  │
└────────────────────┴────┴─────────┴──────┴───────┴────────┴─────────┘
```

**Status meanings:**
- `online` ✅ - Running normally
- `stopped` ⏸️ - Manually stopped
- `errored` ❌ - Crashed (will auto-restart)

### View Logs

**Live logs (tail -f style):**
```bash
pm2 logs alpha-snipes-paper
```

Press `Ctrl+C` to exit log view.

**Last 100 lines:**
```bash
pm2 logs alpha-snipes-paper --lines 100
```

**Error logs only:**
```bash
pm2 logs alpha-snipes-paper --err
```

**Logs are also saved to:**
- Output: `logs/out.log`
- Errors: `logs/err.log`

### Stop the Bot

```bash
pm2 stop alpha-snipes-paper
```

Bot stops but stays in PM2 process list.

### Start the Bot

```bash
pm2 start alpha-snipes-paper
```

Starts a stopped bot.

### Restart the Bot

```bash
pm2 restart alpha-snipes-paper
```

Useful after updating `.env` or code.

### Delete from PM2

```bash
pm2 delete alpha-snipes-paper
```

Removes from PM2 completely. Use `pm2 start ecosystem.config.js` to add it back.

### Monitor in Real-Time

```bash
pm2 monit
```

Shows live:
- CPU usage
- Memory usage
- Logs scrolling
- Process status

Press `Ctrl+C` to exit.

---

## 📝 Configuration File

The bot uses `ecosystem.config.js` for PM2 configuration:

```javascript
module.exports = {
  apps: [
    {
      name: "alpha-snipes-paper",
      script: "npx",
      args: "tsx index.ts",
      env: {
        NODE_ENV: "production"
      },
      autorestart: true,              // Restart if crashes
      max_memory_restart: "1G",        // Restart if exceeds 1GB
      error_file: "./logs/err.log",    // Error log file
      out_file: "./logs/out.log",      // Output log file
      time: true,                      // Add timestamps to logs
      merge_logs: true,                // Combine logs
    }
  ]
};
```

### Customizing

**Change bot name:**
```javascript
name: "alpha-snipes-live",
```

**Increase memory limit:**
```javascript
max_memory_restart: "2G",
```

**Disable auto-restart (for testing):**
```javascript
autorestart: false,
```

After changing, restart:
```bash
pm2 restart alpha-snipes-paper
```

---

## 🔄 Common Workflows

### Update .env

```bash
nano .env
# Make your changes
pm2 restart alpha-snipes-paper
```

Bot picks up new config.

### Update Code

```bash
git pull  # Or edit files
pm2 restart alpha-snipes-paper
```

### View Recent Errors

```bash
pm2 logs alpha-snipes-paper --err --lines 50
```

### Check if Bot is Running

```bash
pm2 list | grep alpha-snipes
```

If output is empty, bot isn't running:
```bash
pm2 start ecosystem.config.js
```

### Switch from Paper to Live Mode

```bash
nano .env
# Change TRADE_MODE=paper to TRADE_MODE=live
# Add WALLET_PRIVATE_KEY
pm2 restart alpha-snipes-paper
pm2 logs alpha-snipes-paper  # Verify it started in LIVE MODE
```

---

## 🛠️ Troubleshooting

### Bot not starting

**Check logs:**
```bash
pm2 logs alpha-snipes-paper --err
```

**Common issues:**
1. Missing dependencies: `npm install`
2. Invalid .env: Check syntax
3. Node version: Requires Node 18+

### Bot keeps restarting

**Check error log:**
```bash
tail -100 logs/err.log
```

**Common causes:**
1. RPC connection issues
2. Invalid Telegram token
3. Missing required env vars

**Increase restart delay:**

Edit `ecosystem.config.js`:
```javascript
min_uptime: "10s",           // Consider stable after 10s
max_restarts: 5,             // Max restarts in...
restart_delay: 4000,         // 4 seconds between restarts
```

### High memory usage

**Check current usage:**
```bash
pm2 status
```

If near 1GB:
```bash
pm2 restart alpha-snipes-paper
```

Memory leak? Check code or increase limit:
```javascript
max_memory_restart: "2G",
```

### Can't find bot after reboot

**PM2 didn't start:**
```bash
pm2 resurrect
```

If that doesn't work:
```bash
pm2 startup  # Follow the sudo command
pm2 save
```

### Logs getting too large

**Clear logs:**
```bash
pm2 flush alpha-snipes-paper
```

**Or manually:**
```bash
rm logs/*.log
pm2 restart alpha-snipes-paper
```

**Set log rotation** (advanced):
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 📈 Monitoring & Alerts

### Basic Health Check

```bash
#!/bin/bash
# health_check.sh

STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="alpha-snipes-paper") | .pm2_env.status')

if [ "$STATUS" != "online" ]; then
  echo "Bot is $STATUS! Restarting..."
  pm2 restart alpha-snipes-paper
fi
```

Run via cron every 5 minutes:
```bash
crontab -e
```

Add:
```
*/5 * * * * /path/to/health_check.sh
```

### PM2 Web Interface

```bash
pm2 install pm2-web
```

Opens web UI at http://localhost:9615

---

## 🎯 Best Practices

### 1. Always Save After Changes

```bash
pm2 start ecosystem.config.js
pm2 save  # Don't forget!
```

### 2. Check Logs After Restart

```bash
pm2 restart alpha-snipes-paper
pm2 logs alpha-snipes-paper --lines 20
```

Verify it started correctly.

### 3. Monitor First 24 Hours

After deploying:
```bash
pm2 monit
```

Watch for:
- Memory creep (slow memory increase)
- Unexpected restarts
- Error patterns

### 4. Keep Logs Clean

Weekly:
```bash
pm2 flush alpha-snipes-paper
```

Or use log rotation (see Troubleshooting).

### 5. Test Changes in Paper Mode First

```bash
# Test change
TRADE_MODE=paper pm2 restart alpha-snipes-paper

# Verify for a day

# Then switch to live
nano .env  # Change to live
pm2 restart alpha-snipes-paper
```

---

## 🔐 Security

### Protect Your Server

If running on a VPS:

1. **Firewall** - Only expose SSH (22), optional monitoring ports
2. **SSH Keys** - Disable password auth
3. **User Isolation** - Run PM2 as non-root user
4. **Auto-Updates** - Keep system patched

### Protect Your Keys

```bash
chmod 600 .env
```

Never commit `.env`:
```bash
cat .gitignore | grep .env  # Should be there
```

---

## 📊 PM2 Commands Cheat Sheet

| Command | Description |
|---------|-------------|
| `pm2 start ecosystem.config.js` | Start bot |
| `pm2 stop alpha-snipes-paper` | Stop bot |
| `pm2 restart alpha-snipes-paper` | Restart bot |
| `pm2 delete alpha-snipes-paper` | Remove from PM2 |
| `pm2 logs alpha-snipes-paper` | View live logs |
| `pm2 logs alpha-snipes-paper --err` | Error logs only |
| `pm2 monit` | Real-time monitoring |
| `pm2 status` | Process status |
| `pm2 list` | List all processes |
| `pm2 save` | Save process list |
| `pm2 resurrect` | Restore saved processes |
| `pm2 startup` | Enable auto-start on boot |
| `pm2 flush alpha-snipes-paper` | Clear logs |

---

## 🎉 Summary

**With PM2, your bot:**
- ✅ Runs in background (close terminal safely)
- ✅ Auto-restarts on crashes
- ✅ Survives server reboots
- ✅ Logs everything to files
- ✅ Easy to monitor and control

**Basic workflow:**
1. Start: `pm2 start ecosystem.config.js`
2. Save: `pm2 save`
3. Monitor: `pm2 logs alpha-snipes-paper`
4. Update: Edit `.env`, then `pm2 restart alpha-snipes-paper`

**Your bot is now production-ready!** 🚀

---

**Next steps:**
- Read ALPHA_VERIFIER.md to add and score alpha wallets
- Set up monitoring/alerting for your VPS
- Consider using a premium RPC for reliability


