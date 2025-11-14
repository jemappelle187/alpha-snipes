# Git Setup Guide - Mac vs VM

## 🎯 Your Situation
- **Mac**: Your development machine (permanent)
- **Oracle VM**: Free tier, 3 months (could be ephemeral)
- **Best Approach**: Use Git as the single source of truth

---

## 📊 Setup Differences

### **Mac (Development Machine)**
- **Role**: Primary development, testing, committing
- **Setup**: Full Git with push/pull to GitHub
- **Why**: Your code lives here, you make changes here

### **VM (Production Server)**
- **Role**: Deployment target, runs the bot
- **Setup**: Git clone, pull updates
- **Why**: Just needs latest code, doesn't need to commit

---

## ✅ Recommended Setup (Best for Oracle VM)

Since Oracle VM is free tier and could be ephemeral, **GitHub is your backup and sync mechanism**.

### **Mac Setup** (Primary - Full Git)
```bash
cd ~/Projects/Alpha\ Snipes

# If not already a git repo:
git init
git add .
git commit -m "Initial commit"

# Connect to GitHub (create repo on GitHub first)
git remote add origin https://github.com/YOUR_USERNAME/alpha-snipes.git
git branch -M main
git push -u origin main
```

**What you do on Mac:**
- ✅ Make code changes
- ✅ Test locally (`npm start`)
- ✅ Commit changes (`git commit`)
- ✅ Push to GitHub (`git push`)

### **VM Setup** (Deployment - Read-Only Git)
```bash
ssh ubuntu@alpha-snipes-vm

# Clone from GitHub (one-time)
cd ~
rm -rf "Alpha Snipes"  # Remove old directory if exists
git clone https://github.com/YOUR_USERNAME/alpha-snipes.git "Alpha Snipes"
cd "Alpha Snipes"
npm install

# Copy .env from your Mac (or recreate it)
# scp ~/Projects/Alpha\ Snipes/.env ubuntu@alpha-snipes-vm:~/Alpha\ Snipes/.env
```

**What you do on VM:**
- ✅ Pull latest code (`git pull`)
- ✅ Restart bot (`pm2 restart`)
- ❌ **Don't make changes on VM** (they'll be lost on next pull)

---

## 🔄 Daily Workflow

### **1. Make Changes (Mac)**
```bash
cd ~/Projects/Alpha\ Snipes

# Edit files, test locally
npm start  # or npm run dev

# When ready, commit and push
git add .
git commit -m "Fix PnL calculation"
git push
```

### **2. Deploy to VM**
```bash
# Option A: SSH and pull manually
ssh ubuntu@alpha-snipes-vm "cd ~/Alpha\ Snipes && git pull && pm2 restart alpha-snipes-paper --update-env"

# Option B: SSH, then run commands
ssh ubuntu@alpha-snipes-vm
cd ~/Alpha\ Snipes
git pull
pm2 restart alpha-snipes-paper --update-env
pm2 logs alpha-snipes-paper --lines 20
```

---

## 🆚 Why This is Better Than SCP

### **Old Way (SCP)**
```bash
scp index.ts ubuntu@alpha-snipes-vm:~/Alpha\ Snipes/index.ts
```
- ❌ Manual file-by-file syncing
- ❌ Easy to forget files
- ❌ No version history
- ❌ No backup if VM dies

### **New Way (Git)**
```bash
git push  # On Mac
git pull  # On VM
```
- ✅ Automatic sync of all files
- ✅ Version history (can rollback)
- ✅ GitHub backup (code safe if VM dies)
- ✅ Easy to see what changed
- ✅ Can work from anywhere

---

## 🚨 Important for Oracle VM

Since Oracle VM is free tier and could be ephemeral:

1. **Always push to GitHub** before deploying
2. **Never make changes directly on VM** (they'll be lost)
3. **Use GitHub as backup** - if VM dies, just clone again
4. **Keep `.env` safe** - don't commit it, but back it up separately

---

## 📝 Quick Commands Reference

### **Mac (Development)**
```bash
npm start              # Run locally
npm run stop           # Stop local instance
git add .              # Stage changes
git commit -m "msg"     # Commit
git push               # Push to GitHub
```

### **VM (Production)**
```bash
git pull                              # Get latest code
pm2 restart alpha-snipes-paper       # Restart bot
pm2 logs alpha-snipes-paper --lines 50 # View logs
```

---

## 🎯 One-Time Setup Checklist

### **On Mac:**
- [ ] Create GitHub repo (via website)
- [ ] `git remote add origin <your-repo-url>`
- [ ] `git push -u origin main`

### **On VM:**
- [ ] `git clone <your-repo-url> "Alpha Snipes"`
- [ ] `cd "Alpha Snipes" && npm install`
- [ ] Copy `.env` file from Mac
- [ ] `pm2 start` (if not already running)

---

## 💡 Pro Tips

1. **Test locally first** - Don't push broken code
2. **Use descriptive commits** - `git commit -m "Fix BUY quote price calculation"`
3. **Pull before making changes** - If you ever need to edit on VM (not recommended)
4. **Keep `.env` backed up** - Use a password manager or secure note

---

## 🔐 Security Note

**Never commit `.env` file!** It's already in `.gitignore`, but double-check:
```bash
git check-ignore .env  # Should output: .env
```

If you need to share `.env` setup, use `env.template` (already in repo).

