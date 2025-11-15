# Transaction Scan Results - Alpha Wallet 8zkJme...

## Transaction from ~39 Minutes Ago

**Transaction Signature:** `52uLqiuxBmV3fjGNrrcd3hBFKnYpVitELtgDdt3PpbxsDa5HVAu5hWsbtP4tcd7FQWvyHuWq8uaXR19SZgAQGxzu`

**Time:** 2025-11-15T00:33:51.000Z (~39 minutes ago)

**Solscan:** https://solscan.io/tx/52uLqiuxBmV3fjGNrrcd3hBFKnYpVitELtgDdt3PpbxsDa5HVAu5hWsbtP4tcd7FQWvyHuWq8uaXR19SZgAQGxzu

---

## Classification Test Results

### ❌ Would NOT Be Captured

**Reason:** Alpha wallet not found in transaction account keys

**Analysis:**
- The transaction does not directly involve the alpha wallet as a signer or account
- This could be:
  - A token transfer where alpha is not the sender/receiver
  - An LP interaction
  - A complex multi-step transaction
  - A transaction on a different token that the alpha wallet interacted with indirectly

---

## Current Filter Settings

```env
DUST_SOL_SPENT=0.0001                    # ✅ Relaxed (was 0.001)
MIN_ALPHA_TOKEN_BALANCE=0.0000001        # ✅ Relaxed (was 0.000001)
MIN_SIZE_INCREASE_RATIO=0.1              # ✅ Relaxed (was 0.25)
MIN_LIQUIDITY_USD=5000                   # ✅ Relaxed (was 10000)
```

---

## What This Means

### The Transaction Type

The fact that the alpha wallet is not in the account keys suggests this is **not a direct swap** from the alpha wallet. It could be:

1. **Token Transfer** - Alpha received tokens via transfer (not a swap)
2. **LP Interaction** - Adding/removing liquidity
3. **Complex Transaction** - Multi-step transaction where alpha is indirectly involved
4. **Different Transaction** - This might not be the actual "buy" transaction

### Why It's Not Captured

The bot's classification logic requires:
- ✅ Alpha wallet to be in transaction account keys
- ✅ SOL spent ≥ DUST_SOL_SPENT (0.0001)
- ✅ Token balance increase ≥ MIN_ALPHA_TOKEN_BALANCE (0.0000001)
- ✅ Size increase ≥ MIN_SIZE_INCREASE_RATIO (0.1) if not first buy

**This transaction fails at step 1** - alpha wallet not in account keys.

---

## Recommendations

### Option 1: Check Birdeye for Actual BUY Transaction

The Birdeye page shows "Trading Activities" which may include the actual BUY transaction. Check:
1. Open the Birdeye page: https://birdeye.so/solana/wallet-analyzer/8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp?tab=activities
2. Find the actual BUY transaction (should show as "BUY" not "OTHER")
3. Get the transaction signature
4. Test that transaction with the classification script

### Option 2: Check Solscan for Direct Swaps

1. Go to: https://solscan.io/account/8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp
2. Filter for "Token Transfers" or "Swaps"
3. Find transactions from ~39 minutes ago
4. Test those transactions

### Option 3: Add Transfer Detection

If the alpha wallet is receiving tokens via transfers (not swaps), we need to add transfer detection logic. This would require:
- Parsing transfer instructions
- Detecting token transfers to the alpha wallet
- Classifying them as BUY signals

---

## Next Steps

1. **Verify the actual transaction type** on Solscan
2. **Check if it's a transfer** (not a swap)
3. **If it's a transfer**, consider adding transfer detection
4. **If it's a swap**, check why alpha wallet isn't in account keys

---

## Conclusion

The transaction `52uLqiuxBmV3fjGNrrcd3hBFKnYpVitELtgDdt3PpbxsDa5HVAu5hWsbtP4tcd7FQWvyHuWq8uaXR19SZgAQGxzu` would **NOT be captured** because the alpha wallet is not directly involved in the transaction.

This suggests either:
- The transaction is not a direct swap (transfer, LP, etc.)
- The actual BUY transaction is different
- We need to add transfer detection for this wallet

**Action:** Check Birdeye/Solscan to find the actual BUY transaction and test that one.

