# 🚀 Quick Start Guide

## Run Locally (Your Mac)

```bash
# 1. Navigate to project
cd ~/Projects/Alpha\ Snipes

# 2. Make sure .env is configured
# (Copy from env.template if needed)

# 3. Start the bot
npm start

# Or for development with auto-reload:
npm run dev
```

**That's it!** The bot will start and connect to Telegram.

---

## Deploy to VM (After Making Changes)

### **Step 1: Commit & Push (on your Mac)**
```bash
cd ~/Projects/Alpha\ Snipes
git add .
git commit -m "Your change description"
git push
```

### **Step 2: Deploy (on VM)**
```bash
# SSH to VM
ssh ubuntu@alpha-snipes-vm

# Pull latest code
cd ~/Alpha\ Snipes && git pull

# Restart bot
pm2 restart alpha-snipes-paper --update-env

# Check it's running
pm2 logs alpha-snipes-paper --lines 20
```

---

## One-Time Git Setup

### **If you don't have a GitHub repo yet:**

1. **Create repo on GitHub** (via website)
2. **On your Mac:**
   ```bash
   cd ~/Projects/Alpha\ Snipes
   git remote add origin https://github.com/YOUR_USERNAME/alpha-snipes.git
   git push -u origin main
   ```

3. **On VM (if code isn't there yet):**
   ```bash
   ssh ubuntu@alpha-snipes-vm
   git clone https://github.com/YOUR_USERNAME/alpha-snipes.git ~/Alpha\ Snipes
   cd ~/Alpha\ Snipes
   npm install
   # Copy .env from your Mac or recreate it
   ```

---

## Common Tasks

### **Local Development**
```bash
npm start          # Run bot
npm run dev        # Run with auto-reload
npm run stop       # Stop running bot instance
npm run logs       # View PM2 logs (if using PM2 locally)
```

### **VM Management**
```bash
# SSH to VM
ssh ubuntu@alpha-snipes-vm

# Then:
pm2 logs alpha-snipes-paper    # View logs
pm2 restart alpha-snipes-paper  # Restart
pm2 stop alpha-snipes-paper    # Stop
pm2 status                     # Check status
```

---

## 💡 Pro Tips

1. **Always test locally first** before pushing to VM
2. **Use descriptive commit messages**: `git commit -m "Fix PnL percentage calculation"`
3. **Check logs after deploying**: `pm2 logs alpha-snipes-paper --lines 50`
4. **Never commit `.env`** - it's in `.gitignore`

---

## 🆘 Troubleshooting

**Bot won't start locally?**
- Check `.env` file exists and has correct values
- Run `npm install` to ensure dependencies are installed
- Check Node version: `node --version` (needs >= 20)

**Changes not showing on VM?**
- Make sure you pushed: `git push`
- Make sure you pulled on VM: `git pull`
- Restart PM2: `pm2 restart alpha-snipes-paper --update-env`

**Git conflicts?**
- On VM, stash changes: `git stash`
- Pull: `git pull`
- Reapply: `git stash pop` (if needed)

