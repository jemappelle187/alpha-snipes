# DexCheck.ai vs Alchemy - Comprehensive Evaluation

## Executive Summary

**For Solana Alpha Wallet Monitoring:**
- **DexCheck.ai:** ✅ **POTENTIALLY VALUABLE** - Specialized DEX analytics, may have wallet transaction endpoints
- **Alchemy:** ❌ **NOT SUITABLE** - RPC provider only, no wallet transaction history APIs

---

## 1. DexCheck.ai Evaluation

### What DexCheck Offers

According to [DexCheck API Documentation](https://apidocs.dexcheck.ai/):

**Core Features:**
- ✅ **Real-Time DEX Data** - Live token prices, volume, liquidity, market cap
- ✅ **Advanced Analytics** - Top holders, top traders, whale transactions, KOL performance
- ✅ **WebSocket Streams** - Live price updates, transaction streams, OHLC candles
- ✅ **Multi-Chain Support** - Ethereum, Solana, BNB Chain, Base
- ✅ **Custom Filters** - Price, liquidity, volume filters with sorting

**Pricing:**
- **Free Tier:** 100 calls/min, 20,000 calls/month
- **Paid Plans:** Higher limits with dedicated support
- **Enterprise:** Custom limits and support

### Key Question: Does DexCheck Have Wallet Transaction History?

**⚠️ UNCLEAR FROM DOCUMENTATION**

The search results mention:
- "Top traders (realized/unrealized PnL)"
- "Whale transactions"
- "KOL performance"

This suggests DexCheck **may** have wallet transaction endpoints, but the documentation doesn't explicitly confirm:
- ❓ Wallet transaction history API
- ❓ BUY/SELL classification
- ❓ Wallet activity monitoring

### DexCheck Pros

1. **Specialized for DEX Analytics** - Built for trading/analytics use cases
2. **Real-Time Streams** - WebSocket support for live updates
3. **Solana Support** - Explicitly supports Solana
4. **Free Tier Available** - 20,000 calls/month free
5. **Trading-Focused** - Designed for trading bots and dashboards

### DexCheck Cons

1. **Unclear Wallet API** - Documentation doesn't explicitly show wallet transaction endpoints
2. **Unknown Pricing** - Paid plan pricing not clearly visible
3. **May Not Have BUY/SELL Classification** - Might just provide raw transaction data
4. **Documentation Gaps** - Need to verify if wallet monitoring is supported

### Recommendation for DexCheck

**🔍 NEEDS INVESTIGATION**

1. **Check API Documentation** - Look for wallet-specific endpoints:
   - `/wallet/transactions`
   - `/wallet/trades`
   - `/wallet/activities`
   
2. **Test Free Tier** - Sign up and test if wallet transaction endpoints exist

3. **Contact Support** - Ask if they have Solana wallet transaction history APIs

**If DexCheck has wallet transaction APIs:**
- ✅ Could be a **valuable Birdeye alternative**
- ✅ Free tier (20K calls/month) might be sufficient
- ✅ Real-time streams could improve detection speed

**If DexCheck doesn't have wallet APIs:**
- ❌ Not useful for alpha wallet monitoring
- ❌ Would only help with token price/liquidity data (we already have DexScreener)

---

## 2. Alchemy Evaluation

### What Alchemy Offers

According to [Alchemy Documentation](https://www.alchemy.com/docs/wallets) and [Pricing](https://www.alchemy.com/pricing):

**Core Features:**
- ✅ **Node API** - Standard JSON-RPC methods (like `getSignaturesForAddress`)
- ✅ **Data API** - Structured data for NFTs, tokens, transaction histories
- ✅ **Wallet API** - Smart contract wallets (account abstraction)
- ✅ **WebSockets** - Real-time event streams
- ✅ **Multi-Chain** - 45+ blockchains including Solana

**Pricing:**
- **Free Tier:** 30M CU/month, 25 req/s
- **Pay As You Go:** $5 for 11M CUs, $0.40-0.45 per 1M CU, 300 req/s
- **Enterprise:** Custom pricing

### Key Question: Does Alchemy Have Wallet Transaction History?

**❌ NO - Alchemy is an RPC Provider**

Alchemy's documentation shows:
- **Node API** - Standard RPC methods (same as Helius)
- **Data API** - Structured data, but focused on NFTs/tokens, not wallet transaction history
- **Wallet API** - Smart wallet management (account abstraction), not transaction monitoring

**What Alchemy Provides:**
- `getSignaturesForAddress()` - Same as we're already using with Helius
- Transaction parsing - We'd still need to parse transactions ourselves
- No BUY/SELL classification - We'd still need our classification logic

### Alchemy Pros

1. **Better RPC Performance** - Faster than free Helius tier
2. **Higher Rate Limits** - 300 req/s (Pay As You Go) vs Helius free tier
3. **Reliable Uptime** - Enterprise-grade infrastructure
4. **Free Tier** - 30M CU/month free
5. **Solana Support** - Full Solana RPC support

### Alchemy Cons

1. **Doesn't Solve Classification Problem** - Still need to parse transactions
2. **No Wallet Transaction APIs** - Doesn't provide structured wallet trade data
3. **Same Classification Logic** - Switching wouldn't change why transactions are filtered
4. **Not a Birdeye Replacement** - Different use case (RPC vs analytics)

### Recommendation for Alchemy

**❌ NOT SUITABLE FOR ALPHA WALLET MONITORING**

**Why:**
- Alchemy is an **RPC provider** (like Helius), not a wallet analytics API
- They provide the same `getSignaturesForAddress` we're already using
- They don't classify BUY/SELL transactions
- They don't provide structured wallet transaction history

**When Alchemy WOULD Be Useful:**
- ✅ If Helius RPC is slow/unreliable
- ✅ If you need higher rate limits (300 req/s)
- ✅ If you're building a general blockchain app (not just wallet monitoring)

**When Alchemy ISN'T Useful:**
- ❌ For wallet transaction history (use Birdeye instead)
- ❌ For BUY/SELL classification (we still need our logic)
- ❌ As a Birdeye replacement (different use case)

---

## 3. Comparison Table

| Feature | DexCheck.ai | Alchemy | Birdeye | Current (Helius RPC) |
|---------|-------------|---------|---------|---------------------|
| **Wallet Transaction History** | ❓ Unknown | ❌ No | ✅ Yes | ❌ No (parse ourselves) |
| **BUY/SELL Classification** | ❓ Unknown | ❌ No | ✅ Yes | ⚠️ Our logic |
| **Real-Time Streams** | ✅ Yes (WebSocket) | ✅ Yes | ✅ Yes | ⚠️ Polling |
| **Solana Support** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Free Tier** | ✅ 20K calls/month | ✅ 30M CU/month | ⚠️ Limited | ✅ Yes |
| **Pricing (Paid)** | ❓ Unknown | $5+ (Pay As You Go) | $99-199/mo | ✅ Free |
| **Use Case** | DEX Analytics | RPC Provider | Wallet Analytics | RPC Provider |

---

## 4. Recommendations

### For Alpha Wallet Monitoring

**Option 1: Investigate DexCheck (Recommended First Step)**
1. Sign up for free tier
2. Check API docs for wallet endpoints
3. Test if they have `/wallet/transactions` or similar
4. If yes → Could be valuable Birdeye alternative
5. If no → Not useful for this use case

**Option 2: Fix Current System (Free)**
1. Lower filter thresholds (see `env.relaxed-filters.template`)
2. Enable verbose logging (already done)
3. Monitor for 24-48 hours
4. Adjust based on results

**Option 3: Use Birdeye (Paid)**
- **Cost:** $99-199/mo
- **Benefit:** Guaranteed wallet transaction history + BUY/SELL classification
- **Best for:** If you want structured data without tuning filters

**Option 4: Switch to Alchemy RPC (If Needed)**
- **Cost:** Free or $5+
- **Benefit:** Better RPC performance
- **Note:** Doesn't solve classification problem

---

## 5. Next Steps

### Immediate Actions

1. **Test DexCheck Free Tier**
   - Sign up at https://apidocs.dexcheck.ai/
   - Check for wallet transaction endpoints
   - Test with alpha wallet address

2. **Check Current Logs**
   - Enable `DEBUG_TX=true`
   - See why transactions are filtered
   - Use enhanced logging to diagnose

3. **Lower Filter Thresholds** (if appropriate)
   - Use `env.relaxed-filters.template`
   - Monitor for false positives

### Decision Matrix

**If DexCheck has wallet APIs:**
- ✅ Use DexCheck (free tier might be enough)
- ✅ Better than Birdeye if free tier is sufficient

**If DexCheck doesn't have wallet APIs:**
- ✅ Fix current system (lower thresholds)
- ✅ Or upgrade to Birdeye ($99-199/mo)

**Alchemy:**
- ❌ Not useful for this use case
- ✅ Only consider if Helius RPC becomes unreliable

---

## Conclusion

**DexCheck.ai:** 🔍 **NEEDS INVESTIGATION** - Potentially valuable if they have wallet transaction APIs

**Alchemy:** ❌ **NOT SUITABLE** - RPC provider only, doesn't solve classification problem

**Best Next Step:** Test DexCheck free tier to see if they have wallet transaction endpoints. If yes, it could be a valuable Birdeye alternative. If no, stick with fixing the current system or upgrading to Birdeye.

