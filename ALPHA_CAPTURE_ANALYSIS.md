# Alpha Activity Capture - Analysis & Solutions

## Current Problem

Transactions **ARE being detected** but filtered out with:
```
ignored tx XXX: no qualifying BUY signals
```

The bot sees the transactions but doesn't classify them as BUY signals.

---

## Why Transactions Are Being Filtered

### Current Filter Thresholds (Too Strict?)

```env
DUST_SOL_SPENT=0.001                    # Must spend ≥ 0.001 SOL
MIN_ALPHA_TOKEN_BALANCE=0.000001        # Must receive ≥ 0.000001 tokens
MIN_SIZE_INCREASE_RATIO=0.25            # Must increase position by ≥ 25%
```

### What Gets Filtered Out

1. **Small Buys** (< 0.001 SOL)
   - Many meme token buys are very small
   - Filtered by `DUST_SOL_SPENT`

2. **Token Transfers** (not swaps)
   - Alpha receives tokens via transfer
   - No SOL spent, so filtered

3. **Small Top-ups** (< 25% increase)
   - Alpha adds to existing position
   - Filtered by `MIN_SIZE_INCREASE_RATIO`

4. **Complex Transactions**
   - Multi-step swaps
   - LP interactions
   - Token balance changes not captured correctly

---

## Solutions

### Solution 1: Lower Filter Thresholds (Quick Fix)

**Recommended changes:**

```env
# Lower DUST threshold to catch smaller buys
DUST_SOL_SPENT=0.0001                   # Was 0.001 (10x lower)

# Lower minimum token balance
MIN_ALPHA_TOKEN_BALANCE=0.0000001       # Was 0.000001 (10x lower)

# Lower size increase ratio to catch smaller top-ups
MIN_SIZE_INCREASE_RATIO=0.1             # Was 0.25 (40% lower)
```

**Pros:**
- ✅ Quick to implement
- ✅ Catches more transactions
- ✅ No code changes needed

**Cons:**
- ⚠️ More false positives (transfers, spam)
- ⚠️ May catch unwanted transactions

---

### Solution 2: Add Transfer Detection (Better)

Detect token transfers, not just swaps:

```typescript
// Check for token transfers where alpha receives tokens
// Parse transfer instructions, not just balance changes
```

**Pros:**
- ✅ Catches transfers (common for airdrops, gifts)
- ✅ More comprehensive detection

**Cons:**
- ⚠️ Requires code changes
- ⚠️ More complex parsing

---

### Solution 3: Enhanced Logging First (Recommended)

Before changing thresholds, **see exactly why** transactions are filtered:

The enhanced logging I just added will show:
- `SELL detected` - alpha sold, not bought
- `solSpent < dust` - too small or transfer
- `no token balances found` - transfer/other, not swap
- `found X token balance(s) but none qualified` - filtered by MIN_BALANCE or MIN_SIZE_INCREASE_RATIO

**Action:** Check logs with `DEBUG_TX=true` to see detailed reasons.

---

## Alchemy Analysis

### What Alchemy Offers

According to [Alchemy's pricing page](https://www.alchemy.com/pricing):
- **Free Tier:** 30M CU/month, 25 req/s
- **Pay As You Go:** $5 for 11M CUs, $0.40-0.45 per 1M CU, 300 req/s
- **Supports Solana** ✅

### Is Alchemy a Good Solution?

**❌ Alchemy won't solve the classification problem**

**Why:**
1. **Alchemy is an RPC provider** (like Helius) - they provide the same `getSignaturesForAddress` API we're already using
2. **They don't provide wallet transaction history APIs** like Birdeye does
3. **They don't classify BUY/SELL** - we'd still need to parse transactions ourselves
4. **Same classification logic** - switching to Alchemy wouldn't change why transactions are filtered

**What Alchemy IS good for:**
- ✅ Better RPC performance (if Helius is slow)
- ✅ Higher rate limits (300 req/s vs Helius free tier)
- ✅ More reliable uptime
- ✅ Better for high-volume applications

**What Alchemy ISN'T good for:**
- ❌ Doesn't solve classification filtering
- ❌ Doesn't provide structured wallet trade data
- ❌ Still need to parse transactions manually

---

## Recommendation

### Immediate Action (No Cost)

1. **Enable verbose logging** (already done ✅)
   - Check `pm2 logs` with `DEBUG_TX=true`
   - See exactly why each transaction is filtered

2. **Lower filter thresholds** (if appropriate)
   ```env
   DUST_SOL_SPENT=0.0001
   MIN_ALPHA_TOKEN_BALANCE=0.0000001
   MIN_SIZE_INCREASE_RATIO=0.1
   ```

3. **Monitor results** for 24-48 hours
   - See if legitimate buys are caught
   - Check for false positives

### If Still Missing Transactions

**Option A: Use Birdeye (Paid)**
- **Cost:** $99/mo (Starter) or $199/mo (Premium)
- **Benefit:** Structured wallet trade data, BUY/SELL classification
- **Best for:** If you want guaranteed catch rate and don't want to tune filters

**Option B: Switch to Alchemy RPC (Free/Cheap)**
- **Cost:** Free (30M CU/month) or $5+ (Pay As You Go)
- **Benefit:** Better RPC performance, higher rate limits
- **Note:** Still need to fix classification filters

**Option C: Enhance RPC Detection (Free)**
- **Cost:** $0
- **Benefit:** Better catch rate with improved filters
- **Best for:** If you want to keep costs low and tune the system

---

## Next Steps

1. **Check current logs** to see why transactions are filtered
2. **Lower thresholds** if appropriate
3. **Test for 24-48 hours**
4. **Decide:** Keep free solution or upgrade to Birdeye

**Alchemy is NOT the solution** for classification - it's just a better RPC provider. The real fix is adjusting the filter thresholds or using Birdeye for structured data.

