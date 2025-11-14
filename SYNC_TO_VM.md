# Syncing Code to VM

## Quick Fix: Verify Code is Synced

The bot is showing the old error message, which means the VM doesn't have the updated code yet.

### Option 1: If Using SSH FS (Automatic Sync)

The files should sync automatically. To verify:

1. **Check if the file is updated on VM:**
   ```bash
   # On VM, check the force_buy handler
   grep -A 10 "Jupiter error:" ~/Alpha\ Snipes/index.ts
   ```

2. **If the new code is there, restart PM2:**
   ```bash
   pm2 restart alpha-snipes-paper --update-env
   ```

3. **Check PM2 logs to verify it's using new code:**
   ```bash
   pm2 logs alpha-snipes-paper --lines 50 | grep -i "force\|price"
   ```

### Option 2: Manual Sync (if SSH FS isn't working)

If SSH FS isn't syncing automatically:

1. **Copy the file directly:**
   ```bash
   # From your local machine (if you have SSH access)
   scp index.ts ubuntu@alpha-snipes-vm:~/Alpha\ Snipes/index.ts
   ```

2. **Or use rsync:**
   ```bash
   rsync -avz index.ts ubuntu@alpha-snipes-vm:~/Alpha\ Snipes/
   ```

### Option 3: Git Commit and Pull (Recommended)

1. **Commit changes locally:**
   ```bash
   git add index.ts lib/liquidity.ts lib/dex_fallbacks.ts lib/telegram_rate.ts
   git commit -m "Add force_buy command, enhance price fetching with BUY quote fallback, add force_sell alias"
   git push
   ```

2. **On VM, pull changes:**
   ```bash
   cd ~/Alpha\ Snipes
   git pull
   pm2 restart alpha-snipes-paper --update-env
   ```

## Verify the Fix is Active

After syncing and restarting, test with:

```
/force_buy HjjWo3EtjiNp4nXt8tQaJfsxudv5RBXJVSCpB7xqpump
```

**Expected new error message (if price fetch fails):**
```
❌ Could not fetch current price for HjjWo3E...

Jupiter error: <actual error message>

Possible reasons:
• Token not yet indexed by Jupiter
• No valid DEX route available
• Token still in bonding curve (pump.fun Instant phase)
• Insufficient liquidity for routing

Check logs with: grep "HjjWo3E" logs/bot_*.log | grep "[PRICE]"
```

**If you still see the old message**, the code hasn't synced yet.

## Check Logs for Price Fetch Details

After restart, check the logs to see what's happening:

```bash
# On VM
tail -f ~/.pm2/logs/alpha-snipes-paper-out.log | grep -E "\[PRICE\]|\[FORCE_BUY\]"
```

You should see logs like:
```
[PRICE] Fetching SELL quote for HjjWo3E... (1M tokens → SOL)
[PRICE] SELL quote failed for HjjWo3E...: <error>
[PRICE] Attempting BUY quote fallback for HjjWo3E... (0.1 SOL → tokens)
```

## Quick Test Command

Run this on the VM to verify the new code is there:

```bash
grep -A 5 "Jupiter error:" ~/Alpha\ Snipes/index.ts | head -10
```

If you see the new error message format, the code is synced. If not, you need to sync manually.

