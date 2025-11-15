# Price Issues Explanation & Solutions

## 1. What is the 14.1x Price Ratio?

**Example: Stoned Pikachu**
- Entry price: `0.000396 SOL/token`
- Current price: `0.000028 SOL/token`
- Ratio calculation: `0.000396 / 0.000028 = 14.14x`

This means the current price is **14.1x lower** than entry, indicating a **~93% drop** (from 0.000396 to 0.000028).

**Why it's marked "unreliable":**
- When Jupiter SELL quotes fail (rate limited), we fall back to BUY quotes
- BUY quotes can give very different prices, especially for illiquid tokens
- If the ratio is >10x, we mark it as "unreliable" to avoid false max loss triggers

## 2. Why "Unreliable" and "Fetching" Appear

### Current Price Fetching Flow:
1. **Try SELL quote** (1M tokens → SOL) - Most accurate
2. **If fails** → Try BUY quote (0.1 SOL → tokens) - Less accurate, can be wrong
3. **If both fail** → Return null → Shows "fetching..."

### Problems:
- **Jupiter API rate limits** → SELL quotes fail frequently
- **BUY quote fallback** → Gives incorrect prices for illiquid tokens
- **No caching** → Every `/open` command refetches prices
- **Slow token name fetching** → DexScreener API can be slow

## 3. Solutions: Better Price APIs

### Option A: DexScreener API (Recommended)
- **Fast**: Direct price from DEX pairs
- **Reliable**: No rate limits (with proper caching)
- **Accurate**: Real-time prices from actual trades
- **Already integrated**: We use it for liquidity, just need to use it for price too

### Option B: Birdeye API
- **Fast**: Dedicated price endpoints
- **Reliable**: Paid tier has high rate limits
- **Accurate**: Aggregated from multiple sources
- **Cost**: Requires paid plan

### Option C: Multiple Sources (Best)
- **Primary**: DexScreener (fast, free)
- **Fallback**: Jupiter SELL quote (accurate when available)
- **Last resort**: BUY quote (only if others fail)

## 4. Max Loss Protection: -10% vs -90%

### Current Setting: -20%
- Exits when position is down 20% from entry
- Problem: Can still lose 20% before exit

### Requested: -10%
- Exits when position is down 10% from entry
- Better protection, but may exit too early on normal volatility

### Liquidity Removal Scenario:
When liquidity is removed in a dump:
- **Price drops instantly** (e.g., -90%)
- **No buyers** → Exit transaction may fail
- **Solution**: Try to exit immediately, but if it fails, remove position from tracking

## 5. Recommended Changes

1. **Use DexScreener for price** (faster, more reliable)
2. **Change MAX_LOSS_PCT to -10%** (tighter protection)
3. **Add price caching** (reduce API calls)
4. **Handle liquidity removal** (exit immediately, remove if fails)

