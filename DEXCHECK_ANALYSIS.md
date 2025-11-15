# DexCheck.ai Analysis

## Is DexCheck.ai a Valuable Birdeye Replacement?

### Current Status
**DexCheck.ai pricing page is not accessible** - The URL `https://api.dexcheck.ai/plans` appears to be a loading page without visible pricing information.

### What We Know
- DexCheck.ai exists as a platform
- They have an API (based on URL structure)
- Pricing information is not publicly available from the search results

### Recommendation
**❌ Cannot recommend DexCheck.ai as a replacement** because:
1. **No accessible pricing information** - Cannot compare costs
2. **No API documentation found** - Cannot verify wallet transaction endpoints
3. **Unclear if they support Solana wallet transaction history** - The search results don't confirm this feature

---

## Why Are We Missing Wallet Activities?

### Root Cause Analysis

From the bot logs, transactions **ARE being detected** but are being **filtered out** by the classification logic:

```
[PAPER][DBG] ignored tx 4RgJzPR3: no qualifying BUY signals
[PAPER][DBG] ignored tx KrK8Ty1Y: no qualifying BUY signals
```

### Classification Filters (Why Transactions Are Skipped)

The bot uses **strict BUY detection criteria** to avoid false positives:

1. **DUST Filter** (`DUST_SOL_SPENT = 0.001 SOL`)
   - Transaction must spend ≥ 0.001 SOL
   - **Why:** Filters out tiny transfers, airdrops, and spam

2. **Token Balance Increase** (`MIN_ALPHA_TOKEN_BALANCE = 0.000001`)
   - Alpha must receive tokens ≥ 0.000001
   - **Why:** Ensures it's a real token acquisition

3. **Size Increase Ratio** (`MIN_SIZE_INCREASE_RATIO = 0.25`)
   - If alpha already holds tokens, new buy must increase position by ≥ 25%
   - **Why:** Filters out small top-ups, focuses on significant entries

4. **Valid Price Check**
   - Alpha entry price must be valid (not NaN, Infinity, or 0)
   - **Why:** Ensures we can calculate entry price correctly

### What Transactions Are Being Filtered Out?

Based on the check script output showing "OTHER" transactions, these are likely:

1. **Transfers** (not swaps)
   - Alpha receives tokens via transfer, not a swap
   - No SOL spent, so filtered by DUST filter

2. **LP Interactions**
   - Adding/removing liquidity
   - Not direct token buys

3. **Very Small Buys**
   - Buys < 0.001 SOL
   - Filtered by DUST threshold

4. **Top-ups**
   - Small additions to existing positions (< 25% increase)
   - Filtered by MIN_SIZE_INCREASE_RATIO

5. **Complex Multi-Step Transactions**
   - Transactions where token balance changes aren't captured in `postTokenBalances`
   - Edge cases in transaction parsing

---

## Solutions

### Option 1: Enable More Verbose Logging (Recommended First Step)

Add detailed logging to see **why** each transaction is being filtered:

```typescript
// In classifyAlphaSignals, add more detailed skip reasons
if (solSpent < DUST_SOL_SPENT) {
  dbg(`[CLASSIFY] SKIP: solSpent=${solSpent.toFixed(6)} < ${DUST_SOL_SPENT} (DUST filter)`);
}
if (postAmount < MIN_ALPHA_TOKEN_BALANCE) {
  dbg(`[CLASSIFY] SKIP: postAmount=${postAmount.toFixed(6)} < ${MIN_ALPHA_TOKEN_BALANCE} (MIN_BALANCE)`);
}
```

### Option 2: Lower Filter Thresholds (If Too Strict)

If you want to catch smaller transactions:

```env
DUST_SOL_SPENT=0.0001          # Lower from 0.001
MIN_ALPHA_TOKEN_BALANCE=0.0000001  # Lower from 0.000001
MIN_SIZE_INCREASE_RATIO=0.1    # Lower from 0.25 (10% increase)
```

**⚠️ Warning:** Lowering thresholds increases false positives (transfers, spam, etc.)

### Option 3: Add Transfer Detection

Detect token transfers (not just swaps) if that's what the alpha is doing:

```typescript
// Check for token transfers where alpha receives tokens
// This would require parsing transfer instructions, not just balance changes
```

### Option 4: Use Birdeye for Validation (If You Have Paid Plan)

If you upgrade to Birdeye Starter ($99/mo), you can:
- Cross-check RPC signals with Birdeye's wallet trades
- Catch transactions that RPC misses
- Get structured BUY/SELL classification

---

## Recommended Next Steps

1. **Enable verbose classification logging** to see exactly why transactions are filtered
2. **Check a specific missed transaction** on Solscan to understand its structure
3. **Compare with Birdeye UI** to see if Birdeye shows it as a BUY
4. **Adjust filters if needed** based on what you find

---

## Conclusion

**DexCheck.ai:** ❌ Cannot recommend - no accessible pricing/API docs

**Missing Activities:** ✅ Transactions are detected but filtered by strict BUY criteria. This is **intentional** to avoid false positives. If you want to catch more, we need to:
1. Add verbose logging to see why they're filtered
2. Adjust filter thresholds if appropriate
3. Consider transfer detection if alpha uses transfers instead of swaps

