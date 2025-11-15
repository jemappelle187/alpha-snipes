# Telegram Chat Configuration Guide

## 📋 Current Setup

### **Chat IDs Configured:**

| Variable | Chat | ID | Purpose |
|----------|------|-----|---------|
| `COMMAND_CHAT_ID` | **Alpha Control** | `-1003420633243` | **Main command center** - where you send commands |
| `TELEGRAM_CHAT_ID` | Alpha Snipes (channel) | `-1003291954761` | Bot notifications/alerts |
| `ADMIN_USER_ID` | Your user ID | `1368896735` | Your Telegram user ID (for authentication) |

---

## 🎯 How It Works

### **Command Authorization (`isAdmin` function):**

The bot accepts commands from a chat **only if**:
1. ✅ Chat ID matches `COMMAND_CHAT_ID` **OR** `TELEGRAM_CHAT_ID`
2. ✅ User ID matches `ADMIN_USER_ID`

**Current behavior:**
- ✅ Commands work in **"Alpha Control"** (`COMMAND_CHAT_ID`)
- ✅ Commands also work in **"Alpha Snipes"** channel (`TELEGRAM_CHAT_ID`)
- ❌ Commands **don't work** in other chats

---

## 🔧 Configuration Files

### **`.env` file:**

```bash
# Telegram Bot Token
TELEGRAM_TOKEN=7942901226:AAH-SCppiUuTkagB9q2SUUUymKcp3kTO03A

# Main command center (where you send /force_buy, /status, etc.)
COMMAND_CHAT_ID=-1003420633243  # Alpha Control

# Bot notifications channel (where bot sends alerts)
TELEGRAM_CHAT_ID=-1003291954761  # Alpha Snipes channel

# Your Telegram user ID (for command authentication)
ADMIN_USER_ID=1368896735
```

---

## 📝 How to Find Chat IDs

### **Method 1: From Bot Logs (when command is rejected)**
```bash
pm2 logs alpha-snipes-paper | grep "rejected"
# Shows: chatId=-1003420633243, userId=1368896735
```

### **Method 2: Using a Telegram Bot**
1. Message [@userinfobot](https://t.me/userinfobot) in the chat
2. It will show the chat ID

### **Method 3: From Telegram Web/Desktop**
- Right-click on chat → "Copy Chat Link" → URL contains chat ID
- Or use browser dev tools to inspect network requests

---

## 🔄 Updating Configuration

### **To change command center:**

1. **Find the new chat ID** (use methods above)

2. **Update `.env` on Mac:**
   ```bash
   cd ~/Projects/Alpha\ Snipes
   # Edit .env and change COMMAND_CHAT_ID
   ```

3. **Update `.env` on VM:**
   ```bash
   ssh ubuntu@alpha-snipes-vm
   cd ~/Alpha\ Snipes
   # Edit .env and change COMMAND_CHAT_ID
   # Or copy from Mac: scp ~/Projects/Alpha\ Snipes/.env ubuntu@alpha-snipes-vm:~/Alpha\ Snipes/.env
   ```

4. **Restart bot:**
   ```bash
   pm2 restart alpha-snipes-paper --update-env
   ```

---

## ✅ Current Status

- ✅ **"Alpha Control"** is configured as the main command center
- ✅ Commands should work in "Alpha Control" now
- ✅ Bot sends notifications to "Alpha Snipes" channel
- ✅ Only your user ID (`1368896735`) can send commands

---

## 🧪 Test Commands

Try these in **"Alpha Control"**:

```
/help          # Show all commands
/status        # Bot status
/force_buy <mint> [amount]  # Test buy (paper mode)
/force_exit <mint>          # Test exit
/alpha_list    # List watched alphas
```

---

## 🆘 Troubleshooting

### **Command not working?**

1. **Check chat ID:**
   ```bash
   pm2 logs alpha-snipes-paper | grep "rejected"
   # This shows the chat ID that was rejected
   ```

2. **Verify configuration:**
   ```bash
   ssh ubuntu@alpha-snipes-vm "cd ~/Alpha\ Snipes && grep 'COMMAND_CHAT_ID\|ADMIN_USER_ID' .env"
   ```

3. **Check bot is receiving messages:**
   ```bash
   pm2 logs alpha-snipes-paper | grep -i "message\|command"
   ```

4. **Restart bot:**
   ```bash
   pm2 restart alpha-snipes-paper --update-env
   ```

---

## 📚 Related Files

- `index.ts` - `isAdmin()` function (line 398)
- `.env` - Configuration values
- `TELEGRAM_CHAT_SETUP.md` - This file

---

## 💡 Notes

- **Chat IDs are negative** for groups/channels (e.g., `-1003420633243`)
- **User IDs are positive** (e.g., `1368896735`)
- **Supergroups** (like "Alpha Control") have IDs starting with `-100`
- **Private chats** have positive IDs (your user ID)

---

**Last Updated:** 2025-11-14
**Command Center:** Alpha Control (`-1003420633243`)

