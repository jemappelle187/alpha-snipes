# Watchlist Conflict Explanation

## The Problem

When trying to `git pull` on the VM, you get this error:

```
error: The following untracked working tree files would be overwritten by merge:
	data/watchlist.json
Please move or remove them before you merge.
Aborting.
```

## What This Means

### The Situation

1. **On the VM:** `data/watchlist.json` exists as a **local file** (created by the bot at runtime)
2. **In Git:** The repository might have `data/watchlist.json` tracked (or Git is trying to add it)
3. **Conflict:** Git can't pull because it would overwrite the local file

### Why This Happens

**`watchlist.json` is a runtime file:**
- Created automatically by the bot when tokens are added to the watchlist
- Contains tokens that were skipped due to low liquidity
- Should NOT be in Git (it's data, not code)
- Different on each environment (local vs VM)

**The file should be:**
- ✅ In `.gitignore` (ignored by Git)
- ✅ Created at runtime by the bot
- ✅ Not committed to the repository

## Current Status

Let me check if `watchlist.json` is:
1. In `.gitignore` (should be)
2. Tracked in Git (shouldn't be)
3. Exists on VM (expected - created by bot)

## Solutions

### Solution 1: Ensure watchlist.json is in .gitignore (Recommended)

If it's not in `.gitignore`, add it:

```bash
echo "data/watchlist.json" >> .gitignore
git add .gitignore
git commit -m "Ignore watchlist.json (runtime data)"
```

### Solution 2: Remove from Git tracking (if already tracked)

If it's already tracked in Git:

```bash
git rm --cached data/watchlist.json
git commit -m "Stop tracking watchlist.json"
```

### Solution 3: Fix on VM (Quick Fix)

On the VM, temporarily move the file, pull, then restore:

```bash
# On VM
mv data/watchlist.json /tmp/watchlist_backup.json
git pull
# File will be recreated by bot if needed
```

## Why This Matters

**The watchlist.json file:**
- Contains tokens that were skipped (low liquidity, etc.)
- Bot monitors these tokens and auto-buys if they gain liquidity
- Should be unique to each environment
- Should NOT be synced between local and VM

**If we sync it:**
- ❌ Local watchlist would overwrite VM watchlist
- ❌ VM watchlist would overwrite local watchlist
- ❌ Each environment should have its own watchlist

## Best Practice

**Runtime data files should be in `.gitignore`:**
- `data/watchlist.json` - Watchlist tokens
- `data/positions.json` - Open positions
- `data/trades.jsonl` - Trade history
- `logs/` - Log files

**Only code/config should be in Git:**
- Source code (`.ts` files)
- Configuration templates (`.env.template`)
- Documentation (`.md` files)

---

## ✅ Solution Applied (2025-11-16)

**What was fixed:**

1. ✅ **Added to `.gitignore`:**
   - `data/watchlist.json`
   - `data/positions.json`
   - `data/trades.jsonl`

2. ✅ **Removed from Git tracking:**
   - These files were removed from Git (but remain locally)
   - They are now runtime-only files

3. ✅ **VM pull successful:**
   - Stashed local changes to `positions.json` and `trades.jsonl`
   - Pulled latest changes without conflicts
   - Files will be recreated by the bot as needed

**Why this works:**
- Git no longer tracks runtime data files
- Each environment (local, VM) maintains its own data
- No more merge conflicts when pulling
- Bot automatically creates these files when needed

**Current status:**
- ✅ `.gitignore` properly configured
- ✅ Files removed from Git tracking
- ✅ VM can pull without conflicts
- ✅ Bot continues to work normally (creates files at runtime)

