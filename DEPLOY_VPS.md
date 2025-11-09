# 🌐 VPS Deployment Guide

Deploy Alpha Snipes to a VPS for true 24/7 operation with better reliability and uptime.

---

## 🖥️ VPS Requirements

### Minimum Specs:
- **CPU:** 1 vCPU
- **RAM:** 1-2 GB
- **Storage:** 10 GB SSD
- **OS:** Ubuntu 22.04 LTS (recommended)
- **Network:** Stable internet connection

### Recommended Providers:
- **DigitalOcean** - $6/month (1GB RAM droplet)
- **Linode** - $5/month (Nanode 1GB)
- **Vultr** - $6/month (1GB instance)
- **Hetzner** - €4.5/month (CX11)

---

## 🚀 One-Command Deployment

### Step 1: Create VPS

Create an Ubuntu 22.04 VPS with your provider and SSH into it:

```bash
ssh root@your-vps-ip
```

Or if using a non-root user:
```bash
ssh your-username@your-vps-ip
```

### Step 2: Download and Run Bootstrap Script

```bash
curl -sL https://raw.githubusercontent.com/YOUR_GITHUB/alpha-snipes/main/scripts/vps_bootstrap.sh | bash
```

Or clone and run manually:

```bash
git clone https://github.com/YOUR_GITHUB/alpha-snipes.git ~/apps/alpha-snipes
cd ~/apps/alpha-snipes
chmod +x scripts/vps_bootstrap.sh
./scripts/vps_bootstrap.sh
```

### Step 3: Paste Your .env

The script will prompt:
```
>> No .env found. Create it now (paste and save), then press Ctrl+D when done.
```

**Paste your entire `.env` file** (from your local machine), then press `Ctrl+D`.

### Step 4: Verify Deployment

```bash
pm2 status
pm2 logs alpha-snipes-paper
```

You should see:
```
🪲 Debug: TX=true | toTelegram=false
👀 Watching active: 8zkJmeQS...
👀 Watching active: 97vkwMX4...
```

Check your Telegram channel for the startup message!

---

## 📋 What the Bootstrap Script Does

1. **System Updates** - Latest packages and security patches
2. **Install Node.js** - LTS version with build tools
3. **Install PM2** - Process manager with log rotation
4. **Configure Firewall** - UFW with SSH access only
5. **Clone Repository** - From your GitHub
6. **Install Dependencies** - npm packages
7. **Create Ecosystem Config** - PM2 configuration
8. **Start Bot** - With auto-restart enabled
9. **Enable Auto-Start** - Survives reboots
10. **Setup Daily Backup** - Cron job for registry.json

---

## 🔒 Security Best Practices

### 1. SSH Key Authentication

Disable password authentication:

```bash
sudo nano /etc/ssh/sshd_config
```

Set:
```
PasswordAuthentication no
PermitRootLogin no
```

Restart SSH:
```bash
sudo systemctl restart sshd
```

### 2. Create Non-Root User

```bash
adduser alphasnipes
usermod -aG sudo alphasnipes
su - alphasnipes
```

Run bootstrap as this user, not root.

### 3. Firewall Configuration

The bootstrap script enables UFW. Only SSH (22) is allowed by default.

If you need additional ports:
```bash
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw status
```

### 4. Keep System Updated

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo reboot  # If kernel updates
```

PM2 will auto-start the bot after reboot.

---

## 🔄 Managing Bot on VPS

### PM2 Commands

```bash
pm2 status                     # Check status
pm2 logs alpha-snipes-paper    # View logs
pm2 restart alpha-snipes-paper # Restart
pm2 stop alpha-snipes-paper    # Stop
pm2 monit                      # Live monitoring
```

### Update Bot Code

```bash
cd ~/apps/alpha-snipes
git pull origin main
npm install
pm2 restart alpha-snipes-paper
```

### Update .env

```bash
cd ~/apps/alpha-snipes
nano .env
# Make your changes
pm2 restart alpha-snipes-paper
```

### View Recent Logs

```bash
pm2 logs alpha-snipes-paper --lines 100
```

### Clear Logs

```bash
pm2 flush alpha-snipes-paper
```

---

## 💾 Backup & Restore

### Automatic Daily Backups

The bootstrap script sets up a cron job that backs up `alpha/registry.json` daily at 3 AM to `~/backups/`.

**View backups:**
```bash
ls -lh ~/backups/
```

### Manual Backup

```bash
cd ~/apps/alpha-snipes
cp alpha/registry.json ~/backups/registry-$(date +%F).json
```

### Restore from Backup

```bash
cd ~/apps/alpha-snipes
cp ~/backups/registry-2025-11-09.json alpha/registry.json
pm2 restart alpha-snipes-paper
```

### Download Backup Locally

From your local machine:
```bash
scp your-user@your-vps-ip:~/backups/registry-*.json ./local-backup/
```

---

## ⚠️ Avoiding Telegram 409 Conflicts

**Critical:** Only ONE bot instance should poll Telegram.

### Common Causes:
1. Multiple PM2 processes with same name
2. Bot running outside PM2 in another terminal
3. Old instance not properly killed

### Prevention:

**Always stop all instances before starting:**
```bash
pkill -f "tsx index.ts" || true
pkill -f "node.*node-telegram-bot-api" || true
pm2 delete alpha-snipes-paper || true
pm2 start ecosystem.config.cjs
pm2 save
```

### If 409 Appears:

**Immediately run:**
```bash
pm2 stop alpha-snipes-paper
pkill -f "node.*node-telegram-bot-api" || true
sleep 3
pm2 start ecosystem.config.cjs --only "alpha-snipes-paper"
pm2 save
```

---

## 📊 Monitoring & Alerts

### System Resources

```bash
# CPU & Memory
htop

# Disk space
df -h

# PM2 monitoring
pm2 monit
```

### Set Up Email Alerts (Optional)

Install postfix for email alerts:
```bash
sudo apt-get install -y postfix mailutils
```

Create monitoring script `~/monitor.sh`:
```bash
#!/bin/bash
if ! pm2 describe alpha-snipes-paper | grep -q "status.*online"; then
  echo "Bot is down!" | mail -s "Alpha Snipes Alert" your@email.com
  pm2 restart alpha-snipes-paper
fi
```

Add to cron (every 5 min):
```bash
chmod +x ~/monitor.sh
(crontab -l; echo "*/5 * * * * ~/monitor.sh") | crontab -
```

### Telegram Status Script

Create `~/status.sh`:
```bash
#!/bin/bash
PM2_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="alpha-snipes-paper") | .pm2_env.status')
echo "Bot status: $PM2_STATUS"
pm2 logs alpha-snipes-paper --lines 20 --nostream
```

---

## 🔧 Troubleshooting

### Bot Not Starting

**Check logs:**
```bash
pm2 logs alpha-snipes-paper --err --lines 100
```

**Common issues:**
1. Missing .env: Copy from local machine
2. Node version: Requires Node 18+
3. Missing dependencies: Run `npm install`

### RPC Connection Errors

If seeing rate limits or connection errors:

**Option 1: Use Helius**
```env
SOLANA_RPC_URL=https://rpc.helius.xyz/?api-key=YOUR_KEY
```

**Option 2: Use QuickNode**
```env
SOLANA_RPC_URL=https://your-endpoint.quicknode.pro/YOUR_KEY
```

After changing:
```bash
pm2 restart alpha-snipes-paper
```

### High Memory Usage

**Check memory:**
```bash
pm2 status
```

If > 500MB, restart:
```bash
pm2 restart alpha-snipes-paper
```

**Or increase limit in ecosystem.config.cjs:**
```javascript
max_memory_restart: "2G",
```

### Bot Stops After Reboot

**Verify PM2 startup:**
```bash
systemctl status pm2-$USER
```

If not enabled:
```bash
pm2 startup systemd
# Run the printed sudo command
pm2 save
```

---

## 📚 PM2 Commands Cheat Sheet

| Command | Description |
|---------|-------------|
| `pm2 start ecosystem.config.cjs` | Start bot |
| `pm2 restart alpha-snipes-paper` | Restart bot |
| `pm2 stop alpha-snipes-paper` | Stop bot |
| `pm2 delete alpha-snipes-paper` | Remove from PM2 |
| `pm2 logs alpha-snipes-paper` | View logs (Ctrl+C to exit) |
| `pm2 logs --err` | Error logs only |
| `pm2 status` | Process status |
| `pm2 monit` | Live monitoring |
| `pm2 save` | Save current process list |
| `pm2 resurrect` | Restore saved processes |
| `pm2 flush alpha-snipes-paper` | Clear logs |
| `pm2 list` | List all processes |

---

## 🔄 Updating Bot on VPS

### Quick Update Process:

```bash
cd ~/apps/alpha-snipes
git pull origin main
npm install
pm2 restart alpha-snipes-paper
pm2 logs alpha-snipes-paper --lines 20
```

### With Backup:

```bash
cd ~/apps/alpha-snipes
# Backup registry
cp alpha/registry.json ~/backups/registry-pre-update-$(date +%F).json
# Update code
git pull origin main
npm install
pm2 restart alpha-snipes-paper
```

---

## 💡 VPS Best Practices

### 1. Use Premium RPC

Free Solana RPC will rate-limit on a VPS. Get Helius or QuickNode free tier.

### 2. Monitor Logs Daily

```bash
pm2 logs alpha-snipes-paper --lines 50
```

Look for errors, rate limits, or unexpected behavior.

### 3. Backup Registry Weekly

```bash
scp your-user@your-vps:~/apps/alpha-snipes/alpha/registry.json ./local-backup/
```

### 4. Keep System Updated

Weekly:
```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### 5. Monitor Disk Space

```bash
df -h
```

If logs grow large:
```bash
pm2 flush alpha-snipes-paper
```

### 6. Test Changes Locally First

Always test in paper mode on your local machine before deploying to VPS.

---

## 📊 VPS Monitoring Dashboard (Optional)

### Install PM2 Plus (Free Tier)

```bash
pm2 link YOUR_PM2_KEY YOUR_PM2_SECRET
```

Access web dashboard at https://app.pm2.io

Features:
- Real-time monitoring
- Email alerts on crashes
- Performance metrics
- Remote restart capability

---

## 🆘 Emergency Procedures

### Bot Crashed

```bash
pm2 restart alpha-snipes-paper
pm2 logs alpha-snipes-paper --err
```

### Server Unresponsive

Restart from your VPS provider's control panel.

PM2 will auto-start the bot after reboot (if `pm2 startup` was configured).

### Lost Registry

Restore from backup:
```bash
cd ~/apps/alpha-snipes
cp ~/backups/registry-2025-11-09.json alpha/registry.json
pm2 restart alpha-snipes-paper
```

### Need to Redeploy

```bash
cd ~/apps
rm -rf alpha-snipes
./vps_bootstrap.sh
```

---

## ✅ Post-Deployment Checklist

- [ ] VPS created and accessible via SSH
- [ ] Bootstrap script completed successfully
- [ ] .env pasted with all required values
- [ ] `pm2 status` shows `online`
- [ ] `pm2 logs` shows "Bot Started"
- [ ] Telegram channel received startup message
- [ ] `/alpha_list` command works
- [ ] No 409 errors in logs
- [ ] `systemctl status pm2-$USER` is active
- [ ] Daily backup cron job set: `crontab -l | grep registry`

---

## 📞 Support

**If deployment fails:**
1. Check logs: `pm2 logs alpha-snipes-paper --err`
2. Verify .env is complete
3. Ensure Node.js 18+ is installed: `node --version`
4. Check PM2 is running: `pm2 list`

**Common issues:**
- Missing .env values → Copy complete .env from local
- Rate limiting → Use Helius/QuickNode RPC
- 409 conflicts → Ensure only one instance running
- Permission errors → Run as non-root user

---

## 🎯 After Deployment

1. **Let it run for 24-48 hours** in paper mode
2. **Monitor Telegram** for alerts
3. **Check `/alpha_list`** daily for promotions
4. **Review logs** weekly: `pm2 logs --lines 100`
5. **Backup registry** manually before major updates
6. **Switch to live mode** only after paper validation

---

**Your bot is now running 24/7 on a VPS! 🚀**

