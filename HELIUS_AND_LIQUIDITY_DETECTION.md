# Helius Enhanced APIs & Liquidity Removal Detection

## 1. Are Helius Enhanced APIs Valuable?

### Current Setup:
- **Standard RPC** (Helius/QuickNode) - Transaction monitoring via `onLogs()`
- **Jupiter API** - Price quotes and swaps
- **DexScreener API** - Liquidity, volume, price data
- **Birdeye API** - Wallet transaction history (optional)

### What Helius Enhanced APIs Add:

#### ✅ **Parse Transaction(s)** - `v0/transactions/`
**Benefits:**
- **Better transaction decoding** - Pre-parsed instruction data
- **Faster processing** - No need to decode instructions manually
- **More reliable** - Handles edge cases better than manual parsing
- **Token balance changes** - Already extracted (we do this manually now)

**Value for our bot:**
- ⭐⭐⭐ **Medium** - We already decode transactions manually, but this could be faster
- **Use case**: Could speed up `classifyAlphaSignals()` by using pre-parsed data
- **Cost**: Free tier available, paid for higher limits

#### ✅ **Parse Transaction History** - `v0/addresses/{address}/transactions/`
**Benefits:**
- **Enhanced wallet history** - Better than standard `getSignaturesForAddress()`
- **Pre-parsed data** - Token transfers, swaps already decoded
- **Faster backfill** - Better for startup scanning

**Value for our bot:**
- ⭐⭐⭐⭐ **High** - Could replace our polling backup with this
- **Use case**: Replace `scanRecentAlphaTransactions()` with Helius API
- **Cost**: Free tier available, paid for higher limits

### Recommendation:
- **Start with free tier** - Test if it improves transaction parsing speed
- **Upgrade if needed** - If you hit rate limits or need faster processing
- **Not critical** - Current RPC setup works, but Enhanced APIs could be faster

## 2. Can We Detect Liquidity Removals Before They Happen?

### Current Detection (Reactive):
1. ✅ **Price crash detection** - Exits when price drops >90% or ratio >15x
2. ✅ **Max loss protection** - Exits at -10% loss
3. ✅ **Dead token detection** - Exits when price unavailable >60s
4. ✅ **Liquidity checks** - Requires $10k+ liquidity before buying

### Early Warning Signs (Proactive):

#### 🟢 **Free/Cheap Detection Methods:**

1. **Liquidity Monitoring** (Already doing this)
   - Monitor liquidity every 5-10 seconds
   - Exit if liquidity drops >50% from entry
   - **Cost**: Free (DexScreener API)

2. **Volume Spikes Before Dumps**
   - Large sell volume → potential dump
   - Monitor 5m/15m volume vs 24h average
   - **Cost**: Free (DexScreener API)

3. **Authority Checks** (Already doing this)
   - Active mint authority → can mint unlimited supply
   - Active freeze authority → can freeze tokens
   - **Cost**: Free (RPC call)

4. **Tax Changes**
   - Monitor token tax rate
   - Sudden tax increase → potential rug
   - **Cost**: Free (Jupiter quote comparison)

5. **Large Holder Movements**
   - Track top 10 holders
   - If they start selling → potential dump
   - **Cost**: Free (RPC + DexScreener)

#### 🟡 **Paid Services (Better Detection):**

1. **Birdeye Wallet Analytics** (Paid)
   - Track "smart money" wallets
   - Alert when they exit positions
   - **Cost**: $99-299/month

2. **DexScreener Pro** (Paid)
   - Real-time liquidity alerts
   - Advanced analytics
   - **Cost**: $29-99/month

3. **Helius Webhooks** (Paid)
   - Real-time liquidity pool events
   - Instant alerts on LP removals
   - **Cost**: $99+/month

### Recommended Approach:

#### **Phase 1: Free Detection (Implement Now)**
```typescript
// Monitor liquidity every 10 seconds
if (currentLiquidity < entryLiquidity * 0.5) {
  // Liquidity dropped >50% → exit immediately
  await forceExit('liquidity_drop');
}

// Monitor volume spikes
if (volume5m > volume24h * 2) {
  // Unusual volume spike → potential dump
  await forceExit('volume_spike');
}
```

#### **Phase 2: Enhanced Detection (If Needed)**
- Add Birdeye wallet tracking
- Add DexScreener alerts
- Add Helius webhooks

## 3. Can We Exit at -10% When Liquidity is Removed?

### The Problem:
- Liquidity removal → price crashes instantly (e.g., -90%)
- No buyers → exit transaction may fail
- Bot might not catch it in time

### Current Solution:
- ✅ **-10% max loss** - Exits early before crash
- ✅ **Crashed token detection** - Exits if price ratio >15x or drop >90%
- ✅ **Dead token detection** - Removes position if exit fails

### Enhanced Solution (Recommended):

```typescript
// Continuous liquidity monitoring
setInterval(async () => {
  for (const [mint, pos] of Object.entries(openPositions)) {
    const liquidity = await getLiquidityResilient(mint);
    
    // Exit if liquidity drops >50% from entry
    if (liquidity.ok && entryLiquidity > 0) {
      const dropPct = ((entryLiquidity - liquidity.liquidityUsd) / entryLiquidity) * 100;
      if (dropPct > 50) {
        await forceExit(mint, 'liquidity_drop');
      }
    }
  }
}, 10_000); // Check every 10 seconds
```

## Summary & Recommendations

### Helius Enhanced APIs:
- **Value**: ⭐⭐⭐ Medium-High
- **Action**: Test free tier, upgrade if it improves speed
- **Priority**: Medium (nice to have, not critical)

### Liquidity Removal Detection:
- **Free methods**: ✅ Implement liquidity/volume monitoring
- **Paid services**: ⚠️ Only if free methods aren't enough
- **Priority**: High (critical for protecting capital)

### Next Steps:
1. ✅ **Implement liquidity monitoring** (free, high value)
2. ✅ **Add volume spike detection** (free, high value)
3. ⚠️ **Test Helius Enhanced APIs** (free tier first)
4. ⚠️ **Consider paid services** (only if needed)

