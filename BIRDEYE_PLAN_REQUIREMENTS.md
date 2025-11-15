# Birdeye Plan Requirements

## Current Status

The Birdeye integration is **partially functional** with a free tier API key:

✅ **Working:**
- Token price/liquidity endpoints (`/defi/price`, `/token/overview`)
- These can be used as fallbacks when Jupiter fails

❌ **Requires Paid Plan:**
- Wallet trades endpoint (`/wallet/trades_seek_by_time`)
- This endpoint requires **Starter plan ($99/mo) or higher**

## What This Means

### Current Behavior (Free Tier)
- ✅ Bot continues to work normally using **RPC as primary detection method**
- ✅ Birdeye startup backfill is attempted but will fail gracefully
- ✅ Birdeye validation layer is attempted but will skip if unavailable
- ✅ Bot falls back to RPC-only mode (which is the fastest method anyway)

### With Paid Plan (Starter+)
- ✅ Birdeye startup backfill will catch missed trades during downtime
- ✅ Birdeye validation will cross-check RPC BUY signals
- ✅ More reliable signal detection with dual-source verification

## Pricing Plans

According to Birdeye documentation:

- **Free/Standard:** 1 req/sec, 30K compute units/month
  - ❌ Wallet trades endpoints NOT included
  
- **Starter ($99/mo):** 15 req/sec, 3M compute units/month
  - ✅ Wallet trades endpoints included
  
- **Premium ($199/mo):** 50 req/sec, 10M compute units/month
  - ✅ All endpoints included
  
- **Premium Plus ($250/mo):** 50 req/sec, 15M compute units/month
  - ✅ All endpoints included

## Recommendation

**For now (Free Tier):**
- The bot works perfectly fine with RPC-only detection
- RPC is actually the **fastest** method for real-time detection
- Birdeye would be a nice-to-have for backfill/validation, but not critical

**If you want Birdeye features:**
- Upgrade to Starter plan ($99/mo) to enable wallet trades endpoints
- This adds:
  - Startup backfill (catches missed trades during downtime)
  - Signal validation (confirms RPC BUY signals)
  - Better reliability overall

## Error Message

When using free tier, you'll see:
```
[BIRDEYE] ⚠️  Wallet trades endpoint requires a paid Birdeye plan
[BIRDEYE] Free tier does not include wallet transaction history endpoints
[BIRDEYE] Bot will continue using RPC-only detection (primary method)
```

This is **normal and expected** - the bot continues working without Birdeye.

## References

- Birdeye Pricing: https://bds.birdeye.so/pricing
- Birdeye API Docs: https://docs.birdeye.so
- Error Handling: https://docs.birdeye.so/docs/error-handling

