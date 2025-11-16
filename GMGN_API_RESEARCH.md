# GMGN.ai API Research

## Summary

**UPDATE:** GMGN.ai DOES have an API! See: https://docs.gmgn.ai/index/cooperation-api-integrate-gmgn-solana-trading-api

However, their API is focused on **trading execution**, not **wallet transaction monitoring** like Birdeye provides.

## What GMGN.ai Offers

### Web Interface Features
- ✅ Wallet analyzer (e.g., https://gmgn.ai/sol/address/8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp)
- ✅ Recent transaction history
- ✅ Token holdings and PnL
- ✅ Smart money tracking
- ✅ Token security checks

### API Availability
- ✅ **Trading API available** - https://docs.gmgn.ai/index/cooperation-api-integrate-gmgn-solana-trading-api
- ✅ **Requires application** - Based on trading volume
- ✅ **Rate limited** - One call every 5 seconds
- ⚠️ **Trading execution only** - Not wallet monitoring

### GMGN Trading API Endpoints

1. **Query Router Endpoint** (Anti-MEV Supported)
   - `GET /defi/router/v1/sol/tx/get_swap_route`
   - Gets swap routes (like Jupiter)
   - Supports JITO Anti-MEV

2. **Submit Transaction Endpoint**
   - `POST /txproxy/v1/send_transaction`
   - Submits signed transactions

3. **Transaction Status Query**
   - `GET /defi/router/v1/sol/tx/get_transaction_status`
   - Checks transaction status

**Note:** These endpoints are for **executing trades**, not for **monitoring wallet transactions**.

## Alternatives

### Option 1: Continue Using Birdeye (Current)
- ✅ Has public API
- ✅ Wallet trades endpoint available (paid plan)
- ✅ Well-documented
- ✅ Already integrated

### Option 2: Web Scraping GMGN.ai (Not Recommended)
- ⚠️ Against ToS (likely)
- ⚠️ Fragile (breaks on UI changes)
- ⚠️ Rate limiting issues
- ⚠️ Legal/ethical concerns

### Option 3: Contact GMGN.ai for API Access
- ✅ May offer enterprise/API access
- ✅ Could be a paid service
- ⚠️ Unknown availability/pricing

### Option 4: Use Multiple Data Sources
- ✅ Birdeye (primary - API available)
- ✅ Solana RPC (primary - real-time)
- ✅ DexScreener (price/liquidity - API available)
- ✅ Solscan (on-chain data - may have API)

## Recommendation

### For Wallet Monitoring (Alpha Detection)
**Stick with Birdeye + RPC + DexScreener:**
1. **Birdeye** - Wallet trades (paid API) ✅
2. **Solana RPC** - Real-time transaction monitoring ✅
3. **DexScreener** - Price/liquidity data (free API) ✅

**GMGN Trading API** is NOT for wallet monitoring - it's for executing trades.

### For Trade Execution (Alternative to Jupiter)
**GMGN Trading API could be used as:**
- Alternative swap router to Jupiter
- JITO Anti-MEV support
- Faster execution (potentially)

**However:**
- Requires application based on trading volume
- Rate limited (1 call per 5 seconds)
- We already use Jupiter (working well)

## Conclusion

**GMGN.ai has a Trading API, but it's for execution, not monitoring.**

For our use case (alpha wallet monitoring), we should:
- ✅ Continue using **Birdeye** for wallet transaction history
- ✅ Continue using **Jupiter** for trade execution (or consider GMGN as alternative)
- ⚠️ **GMGN Trading API** could replace Jupiter for swaps, but not needed for wallet monitoring

## Next Steps

1. ✅ **Increase Birdeye backfill window** - DONE (30 minutes)
2. ✅ **Keep using Birdeye API** - Already integrated
3. ⚠️ **Monitor GMGN.ai** - Check if they add API in future
4. ✅ **Use GMGN.ai web interface** - For manual wallet analysis

---

**Last Updated:** 2025-11-16

