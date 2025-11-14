# VM Setup - Clone from GitHub

## ✅ Your code is now on GitHub!

Now let's set up the VM to pull from GitHub instead of using SCP.

---

## 🚀 One-Time VM Setup

**SSH to your VM and run these commands:**

```bash
# 1. SSH to VM
ssh ubuntu@alpha-snipes-vm

# 2. Backup your current .env (important!)
cd ~/Alpha\ Snipes
cp .env .env.backup

# 3. Go to home directory
cd ~

# 4. Remove old directory (we'll clone fresh from GitHub)
rm -rf "Alpha Snipes"

# 5. Clone from GitHub
git clone https://github.com/jemappelle187/alpha-snipes.git "Alpha Snipes"

# 6. Go into the directory
cd "Alpha Snipes"

# 7. Install dependencies (if needed)
npm install

# 8. Restore your .env file
cp ~/.env.backup .env
# OR copy from Mac:
# (On Mac, run: scp ~/Projects/Alpha\ Snipes/.env ubuntu@alpha-snipes-vm:~/Alpha\ Snipes/.env)

# 9. Restart PM2 with the new code
pm2 restart alpha-snipes-paper --update-env

# 10. Check it's working
pm2 logs alpha-snipes-paper --lines 20
```

---

## 📋 Quick Copy-Paste (All at Once)

```bash
ssh ubuntu@alpha-snipes-vm << 'EOF'
cd ~/Alpha\ Snipes && cp .env ~/.env.backup
cd ~ && rm -rf "Alpha Snipes"
git clone https://github.com/jemappelle187/alpha-snipes.git "Alpha Snipes"
cd "Alpha Snipes" && npm install
cp ~/.env.backup .env
pm2 restart alpha-snipes-paper --update-env
pm2 logs alpha-snipes-paper --lines 20
EOF
```

---

## 🔄 Daily Workflow (After Setup)

### **On Mac (Make Changes):**
```bash
cd ~/Projects/Alpha\ Snipes
# Edit files...
git add .
git commit -m "Your change description"
git push
```

### **On VM (Deploy):**
```bash
ssh ubuntu@alpha-snipes-vm "cd ~/Alpha\ Snipes && git pull && pm2 restart alpha-snipes-paper --update-env"
```

**That's it!** No more SCP needed. 🎉

---

## ⚠️ Important Notes

1. **Keep `.env` safe** - It's not in git (which is good), but make sure you have a backup
2. **Don't edit code on VM** - Always edit on Mac, commit, push, then pull on VM
3. **If VM dies** - Just clone again: `git clone https://github.com/jemappelle187/alpha-snipes.git "Alpha Snipes"`

---

## 🆘 Troubleshooting

**"Permission denied" when cloning?**
- Make sure the repo is public, or you've set up SSH keys

**PM2 says "not found"?**
- The process name might be different, check: `pm2 list`
- Or start fresh: `pm2 start 'tsx index.ts' --name alpha-snipes-paper`

**Missing dependencies?**
- Run: `npm install` in the project directory

