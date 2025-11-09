# 🔍 Alpha Verifier - Auto-Discovery & Scoring System

## What is the Alpha Verifier?

The Alpha Verifier is an **automatic alpha wallet scoring and promotion system** that eliminates manual vetting. Instead of manually checking wallets on Solscan, you can:

1. **Add wallet candidates** via Telegram command
2. **Bot automatically scores** them based on early mint touches
3. **Auto-promotion** when a candidate proves itself (hits signal threshold)
4. **Trade automatically** once promoted to active

**No more manual Solscan checks - the bot verifies alpha wallets for you!**

---

## 🎯 How It Works

### The Alpha Registry

The bot maintains three lists in `alpha/registry.json`:

```json
{
  "active": [
    "8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp"
  ],
  "candidates": [
    "7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX"
  ],
  "scores": {
    "7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX": {
      "signals": 1,
      "lastSeen": 1700000000000
    }
  }
}
```

**Active** = Wallets the bot copies trades from  
**Candidates** = Wallets being tested/scored  
**Scores** = Signal count and last activity timestamp  

### Signal Scoring

**What is a "signal"?**  
A signal is recorded when a wallet is the **first to touch a new mint** that the bot hasn't seen before.

This is the on-chain equivalent of what you were checking manually on Solscan:
- Did they get in early?
- Are they consistently finding new tokens first?
- Do they have alpha?

**Auto-Promotion Criteria (default):**
- **2 signals** within **24 hours** = automatic promotion to active
- Configurable via `PROMOTION_THRESHOLD` and `PROMOTION_WINDOW_MS`

---

## 📱 Telegram Commands

All commands work in your private command chat (set via `COMMAND_CHAT_ID`).

### `/alpha_add <wallet_address>`

Add a wallet as a **candidate** for scoring.

```
/alpha_add 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
```

Response:
```
👀 Candidate added:
7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX

The bot will now monitor this wallet and score it based on early mint touches.
```

The bot will now:
- Watch this wallet's transactions
- Score it when it touches new mints
- Auto-promote if it hits threshold

### `/alpha_add_active <wallet_address>`

Add a wallet **directly to active** (skip scoring).

```
/alpha_add_active 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp
```

Use this when you're confident the wallet is good and want to trade it immediately.

### `/alpha_list`

Show all active alphas and candidates with their scores.

```
/alpha_list
```

Response:
```
🎯 Active Alphas (currently trading):
  • 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp

🧪 Candidates (being scored):
  • 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
    Signals: 1 | Last: 11/8/2025, 3:45:00 PM

Candidates auto-promote after 2 signals in 24h
```

### `/alpha_promote <wallet_address>`

Manually promote a candidate to active (bypass auto-promotion).

```
/alpha_promote 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
```

Use this if you want to promote before hitting the threshold.

### `/alpha_remove <wallet_address>`

Remove a wallet from candidates or active.

```
/alpha_remove 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
```

The bot will stop watching and trading this wallet.

### `/help`

Show all available commands.

---

## 🚀 Setup Guide

### 1. Get Your Telegram IDs

To use commands, you need two IDs:

**A) Your Command Chat ID**

This is where you'll send commands to the bot.

Option 1 - Use your channel:
```env
COMMAND_CHAT_ID=-1003291954761  # Same as TELEGRAM_CHAT_ID
```

Option 2 - Create a private group:
1. Create a new Telegram group
2. Add the bot to the group
3. Send a message in the group
4. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
5. Find `"chat":{"id":-1001234567890` in the response
6. Use that ID

Option 3 - Use your private DM:
1. Start a DM with the bot
2. Send "hi"
3. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Find `"chat":{"id":123456789` (your DM chat ID)
5. Use that ID

**B) Your User ID**

This ensures only YOU can issue commands.

1. After sending a message to the bot (from step above)
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Find `"from":{"id":987654321,"is_bot":false,"first_name":"Your Name"`
4. Use that `id` value

### 2. Update .env

```env
# Command Control
COMMAND_CHAT_ID=your_command_chat_id_here
ADMIN_USER_ID=your_telegram_user_id_here
```

### 3. Test Commands

```bash
npm start
```

Then in your command chat, send:
```
/help
```

You should get the command list. If not, double-check your IDs.

---

## 📊 Example Workflow

### Day 1: Add Candidates

You hear about 3 potentially good wallets on Twitter:

```
/alpha_add 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
/alpha_add 9ABcdEfGhIjK1LmN2oPqRsT3UvWxY4Za5bCdE6fGhIjK
/alpha_add 5FgHiJkLmN1oPqR2StU3vWxY4ZaBcD5eF6gHiJ7kLmNo
```

Bot responds confirming they're added as candidates.

### Day 1-2: Bot Scores Automatically

The bot watches all three wallets. When they touch new mints:

**Candidate 1 touches a new mint:**
```
[PAPER] 🧪 Candidate signal
Wallet: 7xKXtg2C...
Mint: EPjFWdd5...
TX: abc12345...
```

**Candidate 1 touches another new mint (within 24h):**
```
[PAPER] 🧪 Candidate signal
Wallet: 7xKXtg2C...
Mint: Es9vMFrz...
TX: def67890...

✅ AUTO-PROMOTED to active!
```

**Now the bot starts paper trading Candidate 1!**

### Check Status Anytime

```
/alpha_list
```

```
🎯 Active Alphas (currently trading):
  • 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp
  • 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX

🧪 Candidates (being scored):
  • 9ABcdEfGhIjK1LmN2oPqRsT3UvWxY4Za5bCdE6fGhIjK
    Signals: 1 | Last: 11/8/2025, 5:23:00 PM
  • 5FgHiJkLmN1oPqR2StU3vWxY4ZaBcD5eF6gHiJ7kLmNo
    Signals: 0 | Last: never
```

### Remove Non-Performers

After a week, Candidate 3 still has 0 signals - not a good alpha:

```
/alpha_remove 5FgHiJkLmN1oPqR2StU3vWxY4ZaBcD5eF6gHiJ7kLmNo
```

---

## ⚙️ Configuration

Edit `index.ts` to tune auto-promotion:

```typescript
// Alpha Verifier Settings
const PROMOTION_THRESHOLD = 2; // signals needed to auto-promote
const PROMOTION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
```

**Conservative** (higher bar):
```typescript
const PROMOTION_THRESHOLD = 3;  // 3 signals
const PROMOTION_WINDOW_MS = 12 * 60 * 60 * 1000; // within 12 hours
```

**Aggressive** (lower bar):
```typescript
const PROMOTION_THRESHOLD = 1;  // 1 signal
const PROMOTION_WINDOW_MS = 48 * 60 * 60 * 1000; // within 48 hours
```

---

## 🧠 Understanding "First Touch" Signals

**What counts as a signal?**

When the bot sees a wallet's transaction that includes a token mint the bot has **never seen before**, it records a signal.

This works because:
- The bot tracks all mints it's seen across ALL alphas
- If a candidate touches a truly new mint, they're likely early
- If they do this consistently, they have alpha

**What doesn't count:**
- Touching a mint another alpha already touched
- Touching a mint in a failed transaction
- Touching SOL or wrapped SOL

This is a live, on-chain version of manually checking "did they get in early?" on Solscan.

---

## 📈 Best Practices

### 1. Start with Multiple Candidates

Add 5-10 candidates at once:
- Some will score quickly (good alpha)
- Some will never score (not alpha)
- Remove non-performers after a week

### 2. Mix Manual and Auto

- Use `/alpha_add` for unknown wallets (let bot verify)
- Use `/alpha_add_active` for proven alphas you trust

### 3. Review Weekly

```
/alpha_list
```

Look for:
- Candidates stuck at 0-1 signals → Remove them
- Candidates with 1 signal close to 24h expiry → Manually promote if you like them
- Active alphas that aren't producing good trades → Remove them

### 4. Paper Test First

Run in paper mode for a week:
- See which candidates get promoted
- Check if promoted alphas produce good trades
- Remove bad ones before going live

---

## 🔒 Security

### Command Access Control

The bot checks:
1. **COMMAND_CHAT_ID** - Must match
2. **ADMIN_USER_ID** - Must match

Both must be correct for commands to work.

If someone else gets access to your command chat, they **cannot** issue commands without your `ADMIN_USER_ID`.

### Backup Your Registry

```bash
cp alpha/registry.json alpha/registry_backup.json
```

The registry file is automatically saved after every change, but good to backup periodically.

---

## 🐛 Troubleshooting

### Commands not working

**Issue:** Bot doesn't respond to `/alpha_list`

**Fix:**
1. Check `COMMAND_CHAT_ID` matches your chat
2. Check `ADMIN_USER_ID` matches your user ID
3. Verify bot has polling enabled (check console for "Telegram polling started")
4. Send `/help` to test

### Candidates not scoring

**Issue:** Added candidate 24 hours ago, still 0 signals

**Possible reasons:**
1. Wallet isn't active (check on Solscan)
2. Wallet is trading old mints bot already saw
3. Wallet isn't actually alpha (not getting in early)

**Fix:**
- Wait longer (some alphas trade infrequently)
- Check wallet activity on Solscan
- If inactive for a week, remove and try another

### Auto-promotion too slow/fast

**Too slow** (good wallets not promoting):
```typescript
const PROMOTION_THRESHOLD = 1;  // Lower threshold
```

**Too fast** (bad wallets promoting):
```typescript
const PROMOTION_THRESHOLD = 3;  // Higher threshold
const PROMOTION_WINDOW_MS = 12 * 60 * 60 * 1000; // Shorter window
```

---

## 📊 Monitoring

### Console Output

```
👀 Watching active: 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp
👀 Watching candidate: 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
```

Shows which wallets are being monitored.

### Telegram Alerts

**Candidate signals:**
```
[PAPER] 🧪 Candidate signal
Wallet: 7xKXtg2C...
Mint: EPjFWdd5...
TX: abc12345...
```

**Auto-promotions:**
```
[PAPER] 🧪 Candidate signal
Wallet: 7xKXtg2C...

✅ AUTO-PROMOTED to active!
```

**Trading (after promotion):**
```
[PAPER] 👀 Alpha touched new mint EPjFWdd5...
[PAPER] ✅ Bought 0.02 SOL of EPjFWdd5...
```

---

## 🎯 Summary

**The Alpha Verifier automates your alpha discovery workflow:**

| Manual Method | With Verifier |
|---------------|---------------|
| Find wallet on Twitter | Find wallet on Twitter |
| Open Solscan | `/alpha_add <address>` |
| Check recent trades | Bot watches automatically |
| Check if early on tokens | Bot scores on first-touches |
| Decide if alpha | Bot auto-promotes at threshold |
| Add to bot config | Already active! |
| Restart bot | No restart needed |

**Result:** Faster alpha discovery, automated vetting, no manual tracking!

---

**Read PM2_SETUP.md for keeping the bot running 24/7!**


