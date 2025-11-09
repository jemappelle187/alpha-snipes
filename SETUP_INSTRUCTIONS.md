# 🚀 Quick Start Instructions

## Step 1: Create Your .env File

Copy the template and add your real credentials:

```bash
cp env.template .env
```

Then edit `.env` with your actual values:

```env
TELEGRAM_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=@alpha_snipes
```

### How to Get These Values:

**TELEGRAM_TOKEN:**
- Already have it from @BotFather: `@alpha_filter_ai_bot`

**TELEGRAM_CHAT_ID (Choose ONE):**
- **Method A**: Make channel public, set username → use `@alpha_snipes`
- **Method B**: Forward channel message to `@RawDataBot` → copy the numeric `chat.id` (e.g., `-1001234567890`)

## Step 2: Verify Bot is Admin

In your **Alpha Snipes** channel:
1. Go to channel → Members → Admins
2. Ensure `@alpha_filter_ai_bot` is listed
3. Check permissions: ✅ Post Messages / Manage Messages

## Step 3: Install Dependencies

```bash
npm install
```

## Step 4: Run the Test

```bash
npm run test:telegram
```

Or:

```bash
npx tsx test_telegram.ts
```

## ✅ Success Looks Like:

**In Telegram:** A message appears in your channel:
```
✅ Telegram test:
Bot can post to @alpha_snipes
Time: 2025-11-08T12:34:56.789Z
```

**In Console:**
```
✅ Sent. Message id: 12345
```

## ❌ Common Issues:

| Error | Fix |
|-------|-----|
| "Chat not found" | Wrong chat ID - try public username method |
| "Bot is not a member" | Add bot as admin in channel settings |
| "Not enough rights" | Enable "Post Messages" permission |
| No message appears | Wait 10-20s for Telegram cache to update |

## 🧪 Alternative: Curl Test

Quick test without Node.js:

```bash
# First, export your credentials:
export TELEGRAM_TOKEN="your_bot_token_here"
export TELEGRAM_CHAT_ID="@alpha_snipes"

# Then run:
curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_TOKEN/sendMessage" \
     -d chat_id="$TELEGRAM_CHAT_ID" \
     -d text="✅ Curl test from server at $(date -Iseconds)"
```

---

**Once you see the test message, you're ready to integrate the full trading bot!** 🎯


