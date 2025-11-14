# ☁️ Oracle Cloud Deployment Guide

**Deploy Alpha Snipes to Oracle Cloud "Always Free" tier for 24/7 operation.**

---

## 🎯 Why Oracle Cloud?

### Always Free Tier Benefits

- ✅ **Free forever** (no credit card required after signup)
- ✅ **24/7 uptime** (unlike laptops/desktops)
- ✅ **AMD EPYC** 2 OCPUs, 12 GB RAM (generous specs)
- ✅ **200 GB storage** (plenty for logs and data)
- ✅ **Public IP** (static, no port forwarding)
- ✅ **Reliable network** (low latency to Solana RPCs)

### Specs

**VM.Standard.A1.Flex (Ampere ARM):**
- 2 OCPUs (always free)
- 12 GB RAM (always free)
- 200 GB Block Volume (always free)
- Ubuntu 22.04 ARM64

**More than enough for Alpha Snipes!**

---

## 📋 Prerequisites

1. **Oracle Cloud account** (free signup at oracle.com/cloud/free)
2. **SSH key pair** (generate if needed: `ssh-keygen -t rsa -b 4096`)
3. **Alpha Snipes configuration** (`.env` ready)
4. **Telegram bot** configured

---

## 🚀 Part 1: Create Compute Instance

### Step 1: Log in to Oracle Cloud

1. Go to https://cloud.oracle.com
2. Sign in with your Oracle account
3. Navigate to **Compute** → **Instances**

---

### Step 2: Create Instance

Click **"Create Instance"** and configure:

#### Name
```
alpha-snipes-bot
```

#### Image and Shape

**Image:**
- Click "Change Image"
- Select **Ubuntu 22.04** (Minimal, ARM64)

**Shape:**
- Click "Change Shape"
- Select **VM.Standard.A1.Flex** (Ampere ARM)
- **OCPUs:** 2 (stay within free tier)
- **Memory:** 12 GB (stay within free tier)

---

#### Networking

**VCN:**
- Use default VCN (auto-created)
- **Public IP**: Assign public IPv4 address

**SSH Keys:**
- **Upload public key** (paste contents of `~/.ssh/id_rsa.pub`)
- Or **Generate new key pair** (download private key)

---

#### Boot Volume

- **Size**: 50 GB (100-200 GB recommended if available)
- **Backup**: Disabled (not needed)

---

### Step 3: Launch

Click **"Create"** and wait ~2 minutes for provisioning.

**Note the public IP address** (shown on instance details page).

---

## 🔐 Part 2: Initial Server Setup

### Step 1: Connect via SSH

```bash
# From your local machine
ssh ubuntu@<PUBLIC_IP>

# If using custom key:
ssh -i ~/.ssh/oracle_key ubuntu@<PUBLIC_IP>
```

**First time:**
```
The authenticity of host '...' can't be established.
Are you sure you want to continue? yes
```

---

### Step 2: Update System

```bash
sudo apt update
sudo apt upgrade -y
```

This may take 5-10 minutes.

---

### Step 3: Install Dependencies

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools
sudo apt install -y build-essential git

# Install PM2 globally
sudo npm install -g pm2

# Verify installations
node --version    # Should show v20.x
npm --version
pm2 --version
```

---

### Step 4: Configure Firewall (Oracle Security List)

**On Oracle Cloud Console:**
1. Go to **Networking** → **Virtual Cloud Networks**
2. Click your VCN → **Security Lists** → **Default Security List**
3. Click **"Add Ingress Rules"**

**Add SSH rule (if not already present):**
- **Source CIDR**: `<YOUR_IP>/32` (your home/office IP)
- **Destination Port Range**: `22`
- **Protocol**: TCP
- **Description**: SSH from home

**⚠️ Do NOT open any other ports!**
- Bot is outbound-only (no inbound traffic needed)
- Opening unnecessary ports = security risk

---

### Step 5: Harden SSH

**Create dedicated user:**
```bash
sudo adduser botuser
sudo usermod -aG sudo botuser
```

**Set password when prompted (or skip with `--disabled-password`).**

**Copy SSH key:**
```bash
sudo mkdir -p /home/botuser/.ssh
sudo cp ~/.ssh/authorized_keys /home/botuser/.ssh/
sudo chown -R botuser:botuser /home/botuser/.ssh
sudo chmod 700 /home/botuser/.ssh
sudo chmod 600 /home/botuser/.ssh/authorized_keys
```

**Test new user:**
```bash
# From local machine
ssh botuser@<PUBLIC_IP>
```

**If successful, disable root login (optional):**
```bash
sudo nano /etc/ssh/sshd_config

# Change:
PermitRootLogin no
PasswordAuthentication no

# Save and restart SSH
sudo systemctl restart sshd
```

---

## 📦 Part 3: Deploy Alpha Snipes

### Step 1: Clone Repository

```bash
# SSH into server as botuser
ssh botuser@<PUBLIC_IP>

# Clone repo
cd ~
git clone https://github.com/yourusername/alpha-snipes.git
cd alpha-snipes
```

**Or upload via SCP:**
```bash
# From local machine
scp -r "/path/to/Alpha Snipes" botuser@<PUBLIC_IP>:~/alpha-snipes
```

---

### Step 2: Install Dependencies

```bash
cd ~/alpha-snipes

# Fix npm cache permissions (one-time)
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"

# Install packages
npm install
```

**Expected output:**
```
added 150 packages in 45s
```

---

### Step 3: Configure `.env`

**Create from template:**
```bash
cp env.template .env
nano .env
```

**Edit configuration:**
```env
# === Core Settings ===
TRADE_MODE=paper
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
# WALLET_PRIVATE_KEY=  (only for live mode)

# === Telegram ===
TELEGRAM_TOKEN=7942901226:AAEvyak...
TELEGRAM_CHAT_ID=-1003291954761
COMMAND_CHAT_ID=123456789
ADMIN_USER_ID=987654321

# === Trade Params ===
BUY_SOL=0.01
EARLY_TP_PCT=0.3
TRAIL_STOP_PCT=0.2
PARTIAL_TP_PCT=0

# === Safety ===
REQUIRE_AUTHORITY_REVOKED=true
MAX_TAX_BPS=500
MAX_PRICE_IMPACT_BPS=3000
SENTRY_MAX_DRAWDOWN_PCT=0.22

# === Monitoring ===
HEARTBEAT_EVERY_MIN=15
SILENT_ALERT_MIN=60

# === Networking (optional) ===
DNS_OVERRIDE=1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4
```

**Secure `.env`:**
```bash
chmod 600 .env
```

---

### Step 4: Test Run (Foreground)

```bash
npm start
```

**Expected startup banner:**
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

**Test in Telegram:**
```
/status
# Should receive heartbeat
```

**Press `Ctrl+C` to stop** when verified.

---

## 🔄 Part 4: PM2 Setup (24/7 Operation)

### Step 1: Start with PM2

```bash
cd ~/alpha-snipes
pm2 start ecosystem.config.cjs
```

**Expected output:**
```
[PM2] Starting ecosystem.config.cjs
┌─────┬──────────────────────┬─────────┬─────────┐
│ id  │ name                 │ mode    │ status  │
├─────┼──────────────────────┼─────────┼─────────┤
│ 0   │ alpha-snipes-paper   │ fork    │ online  │
└─────┴──────────────────────┴─────────┴─────────┘
```

---

### Step 2: Save PM2 State

```bash
pm2 save
```

**Output:**
```
[PM2] Saving current process list...
[PM2] Successfully saved in /home/botuser/.pm2/dump.pm2
```

---

### Step 3: Configure Auto-Start on Reboot

```bash
pm2 startup
```

**Output:**
```
[PM2] Init System found: systemd
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u botuser --hp /home/botuser
```

**Copy and run the `sudo env...` command shown.**

**Then save again:**
```bash
pm2 save
```

**Verify:**
```bash
# Reboot server
sudo reboot

# Wait 2 minutes, then SSH back in
ssh botuser@<PUBLIC_IP>

# Check PM2 status
pm2 status
# Should show bot as "online"
```

---

### Step 4: View Logs

```bash
# Live logs (tail -f style)
pm2 logs alpha-snipes-paper

# Last 100 lines
pm2 logs alpha-snipes-paper --lines 100 --nostream

# Error logs only
pm2 logs alpha-snipes-paper --err

# Clear old logs
pm2 flush alpha-snipes-paper
```

---

## 📊 Part 5: Monitoring & Maintenance

### Daily Monitoring

**Check bot health:**
```bash
pm2 status
pm2 logs alpha-snipes-paper --lines 50 --nostream
```

**Via Telegram:**
```
/status
/open
/pnl 24h
```

---

### Weekly Maintenance

**Update code:**
```bash
cd ~/alpha-snipes
git pull
npm install
pm2 restart alpha-snipes-paper --update-env
pm2 save
```

**Check disk usage:**
```bash
df -h
# Ensure / has >5 GB free
```

**Rotate logs:**
```bash
pm2 flush alpha-snipes-paper
```

---

### Monthly Checklist

**System updates:**
```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

**Backup data:**
```bash
# From local machine
scp botuser@<PUBLIC_IP>:~/alpha-snipes/data/trades.jsonl ~/backups/trades-$(date +%F).jsonl
```

**Review performance:**
```bash
# Check bot memory/CPU
pm2 monit
```

---

## 🔧 Troubleshooting

### Bot Not Starting

**Check PM2 logs:**
```bash
pm2 logs alpha-snipes-paper --err --lines 50
```

**Common issues:**
- Missing `.env` → `cp env.template .env` and edit
- Invalid Telegram token → Verify from @BotFather
- Missing dependencies → `npm install`

---

### High Memory Usage

**Check PM2:**
```bash
pm2 status
# Look at "memory" column
```

**If >500 MB:**
```bash
# Restart to free memory
pm2 restart alpha-snipes-paper
```

**Normal usage: 100-200 MB**

---

### Connection Issues

**Test RPC:**
```bash
curl $SOLANA_RPC_URL
# Should return JSON
```

**Test Jupiter API:**
```bash
cd ~/alpha-snipes
tsx tools/quote_smoke.ts
# Should show SOL→USDC quote
```

**Check DNS:**
```bash
nslookup quote-api.jup.ag 1.1.1.1
# Should resolve to IP
```

---

### Logs Growing Large

**Check log size:**
```bash
du -sh ~/.pm2/logs/
```

**If >1 GB:**
```bash
pm2 flush alpha-snipes-paper
```

**Automate log rotation:**
```bash
# Install PM2 logrotate module
pm2 install pm2-logrotate

# Configure (optional)
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
```

---

## 🛡️ Security Best Practices

### Firewall Checklist

- ✅ SSH (port 22) restricted to your IP only
- ✅ All other ports blocked (default deny)
- ✅ Oracle Security List configured correctly
- ✅ No public RDP/VNC/Web ports open

---

### SSH Hardening

- ✅ Key-based auth only (no passwords)
- ✅ Dedicated user (not root)
- ✅ Fail2ban installed (optional):
  ```bash
  sudo apt install fail2ban -y
  ```

---

### File Permissions

```bash
# Verify .env is secure
ls -la ~/alpha-snipes/.env
# Should show: -rw------- (600)

# Fix if needed
chmod 600 ~/alpha-snipes/.env
```

---

### Monitoring

**Set up external uptime monitor** (optional):
- Use UptimeRobot (free, 5-minute intervals)
- Monitor SSH port or custom HTTP endpoint
- Email alert if server goes down

---

## 🚀 Going Live (Production)

### Pre-Flight Checklist

**Before switching to live mode:**
- [ ] Paper mode tested for 48+ hours
- [ ] Win rate > 60% over 50+ trades
- [ ] `/pnl 24h` positive
- [ ] Heartbeats arriving regularly
- [ ] No unexpected crashes in logs
- [ ] Wallet funded with 1-2 SOL

---

### Switch to Live Mode

**1. Edit `.env` on server:**
```bash
nano ~/alpha-snipes/.env

# Change:
TRADE_MODE=live
WALLET_PRIVATE_KEY=your_base58_key_here
```

**2. Secure `.env` again:**
```bash
chmod 600 ~/alpha-snipes/.env
```

**3. Restart PM2:**
```bash
pm2 restart alpha-snipes-paper --update-env
pm2 save
```

**4. Verify startup banner:**
```bash
pm2 logs alpha-snipes-paper --lines 30 | grep "LIVE MODE"
# Should show: 🚀 Alpha Snipes Bot Starting... 💰 LIVE MODE
```

**5. Monitor closely:**
```bash
# Watch logs live for first hour
pm2 logs alpha-snipes-paper

# Check Telegram for real transactions
```

---

## 📝 Useful Commands

### PM2 Management

```bash
# Start bot
pm2 start ecosystem.config.cjs

# Stop bot
pm2 stop alpha-snipes-paper

# Restart bot
pm2 restart alpha-snipes-paper

# Restart with new env
pm2 restart alpha-snipes-paper --update-env

# View logs
pm2 logs alpha-snipes-paper

# Clear logs
pm2 flush alpha-snipes-paper

# Show process info
pm2 show alpha-snipes-paper

# Monitor CPU/memory
pm2 monit

# Save state
pm2 save
```

---

### System Maintenance

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Check disk usage
df -h

# Check memory usage
free -h

# Reboot server
sudo reboot
```

---

### Backup & Restore

**Backup data:**
```bash
# From local machine
scp -r botuser@<PUBLIC_IP>:~/alpha-snipes/data ~/backups/data-$(date +%F)
```

**Restore data:**
```bash
# From local machine
scp -r ~/backups/data-2025-11-11 botuser@<PUBLIC_IP>:~/alpha-snipes/data
```

---

## 🎓 Advanced Configuration

### Multiple Bots (One VPS)

**Run paper + live simultaneously:**
```bash
# Clone twice
cd ~
git clone https://github.com/yourusername/alpha-snipes.git alpha-snipes-paper
git clone https://github.com/yourusername/alpha-snipes.git alpha-snipes-live

# Configure each
cd ~/alpha-snipes-paper
nano .env  # Set TRADE_MODE=paper

cd ~/alpha-snipes-live
nano .env  # Set TRADE_MODE=live

# Start both
cd ~/alpha-snipes-paper && pm2 start ecosystem.config.cjs
cd ~/alpha-snipes-live && pm2 start ecosystem.config.cjs --name alpha-snipes-live

pm2 save
```

---

### Custom PM2 Ecosystem

**Edit `ecosystem.config.cjs`:**
```javascript
module.exports = {
  apps: [{
    name: 'alpha-snipes-paper',
    script: 'index.ts',
    interpreter: 'node',
    interpreterArgs: '--import=tsx',
    watch: false,
    max_memory_restart: '500M',  // Restart if > 500 MB
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
```

---

## 📞 Support

**If you encounter issues:**
1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Review PM2 logs: `pm2 logs alpha-snipes-paper`
3. Test connectivity: `tsx tools/quote_smoke.ts`
4. Verify configuration: [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md)

---

## 🎉 Congratulations!

**You now have Alpha Snipes running 24/7 on Oracle Cloud for free!**

**Next steps:**
- Monitor daily with `/status` and `/open`
- Review `docs/OPERATOR_GUIDE.md` for best practices
- Join community (if available) for alpha wallet sharing

---

**Happy trading! 💎☁️**




