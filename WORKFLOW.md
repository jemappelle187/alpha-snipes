# Alpha Snipes - Development Workflow

## 🎯 Quick Reference

### **Local Development** (Your Mac)
- Edit code locally
- Test with `npm run dev` or `npm start`
- Commit changes to git

### **VM Deployment** (Ubuntu Server)
- Pull latest code from git
- Restart bot with PM2

---

## 📋 Daily Workflow

### **1. Make Changes Locally**
```bash
# On your Mac, in the project directory
cd ~/Projects/Alpha\ Snipes

# Edit files, test locally
npm run dev  # or npm start

# When ready, commit and push
git add .
git commit -m "Description of changes"
git push
```

### **2. Deploy to VM**
```bash
# SSH to VM
ssh ubuntu@alpha-snipes-vm

# Navigate to project
cd ~/Alpha\ Snipes

# Pull latest code
git pull

# Restart bot
pm2 restart alpha-snipes-paper --update-env

# Check logs
pm2 logs alpha-snipes-paper --lines 50
```

---

## 🚀 Running Locally (Your Mac)

### **Prerequisites**
```bash
# Install dependencies (if not already done)
npm install

# Make sure you have a .env file
cp env.template .env
# Edit .env with your settings
```

### **Run in Development Mode**
```bash
# Development mode (with auto-reload if using nodemon/tsx watch)
npm run dev

# Or run directly
npx tsx index.ts
```

### **Run in Production Mode**
```bash
# Production mode
npm start

# Or with PM2 (if installed locally)
pm2 start index.ts --name alpha-snipes-local --interpreter npx --interpreter-args tsx
```

### **Check Logs Locally**
```bash
# If using PM2 locally
pm2 logs alpha-snipes-local

# Or just watch console output
```

---

## 🔄 Git Setup (One-Time)

### **If GitHub repo doesn't exist yet:**
```bash
# On your Mac
cd ~/Projects/Alpha\ Snipes

# Create GitHub repo (via GitHub website), then:
git remote add origin https://github.com/YOUR_USERNAME/alpha-snipes.git
git branch -M main
git push -u origin main
```

### **On VM (One-Time Setup):**
```bash
ssh ubuntu@alpha-snipes-vm
cd ~/Alpha\ Snipes

# If repo doesn't exist on VM yet:
git clone https://github.com/YOUR_USERNAME/alpha-snipes.git ~/Alpha\ Snipes

# Or if you already have the code, add remote:
git remote add origin https://github.com/YOUR_USERNAME/alpha-snipes.git
git pull origin main
```

---

## 📝 Common Commands

### **Local (Mac)**
```bash
# Start bot
npm start

# Check if running
ps aux | grep tsx

# Stop bot
pkill -f "tsx index.ts"
```

### **VM (Ubuntu)**
```bash
# View logs
pm2 logs alpha-snipes-paper --lines 100

# Restart
pm2 restart alpha-snipes-paper --update-env

# Stop
pm2 stop alpha-snipes-paper

# Status
pm2 status
```

---

## 🎨 Recommended Workflow

1. **Develop locally** → Test changes on your Mac
2. **Commit & push** → Save to GitHub
3. **Pull on VM** → Deploy to production
4. **Monitor** → Watch PM2 logs

This way:
- ✅ Code is version controlled
- ✅ Easy to sync between machines
- ✅ Can test locally before deploying
- ✅ Can rollback if needed

---

## ⚠️ Important Notes

- **Never commit `.env` file** - it contains secrets
- **Always test locally first** before deploying to VM
- **Use descriptive commit messages** for easy tracking
- **Pull before making changes on VM** to avoid conflicts

