# Understanding "Burn" Actions on Solana Tokens

## What is a "Burn" Action?

A **burn** action on Solana means tokens are permanently destroyed (sent to a burn address where they cannot be recovered). This reduces the total supply of the token.

## Types of Burns You're Seeing

### 1. **Token Burns** (Supply Reduction)
- **What it means:** Tokens are being permanently destroyed
- **Why it happens:**
  - Deflationary mechanism (reduce supply to increase price)
  - Removing tokens from circulation
  - Sometimes used to create artificial scarcity
- **Impact:** Reduces total supply, which can increase price per token (if demand stays same)

### 2. **LP Token Burns** (Liquidity Removal)
- **What it means:** Liquidity provider (LP) tokens are being burned
- **Why it happens:**
  - Removing liquidity from the pool
  - This is a **red flag** - often indicates a rug pull or exit
- **Impact:** Reduces available liquidity, making it harder to sell

## What You're Seeing on Solscan

Based on the token `GWxgUJNLX5Sy6grYSRYt8Uk8vsoy2HuqnLAFATzvUVci`:

1. **"Burn" actions** - Tokens being destroyed
2. **"Create" liquidity** - Initial liquidity being added
3. **"Remove" liquidity** - Liquidity being removed (⚠️ **RED FLAG**)

## Why Token Still Shows "Up" on GMGN

Even though you see burns and liquidity removals, the token might still show as "up" because:

1. **Cached/Stale Data:**
   - GMGN might be showing cached price data
   - Price updates can lag behind on-chain events

2. **Remaining Liquidity:**
   - Some liquidity might still exist
   - Price can stay "up" if there's still trading activity

3. **Price Calculation:**
   - GMGN calculates price from remaining liquidity
   - If liquidity is very low, price can be misleading

4. **Time Lag:**
   - GMGN might not have updated yet
   - On-chain events happen faster than price aggregators update

## Red Flags to Watch For

Based on the GMGN data you showed:
- ⚠️ **Phishing: 100%** - Extremely high risk
- ⚠️ **Low liquidity: $0.0140** - Very dangerous
- ⚠️ **Only 5 holders** - Highly centralized
- ⚠️ **Top 10: 99.96%** - Extreme centralization
- ⚠️ **"Remove liquidity" actions** - Potential rug pull

## What the Bot Should Do

The bot's **liquidity drop detection** should catch this:
- If liquidity drops >50% from entry → Auto-exit
- If price becomes unreliable → Auto-exit
- If max loss hit (-10%) → Auto-exit

However, if Jupiter is rate-limiting (429 errors), the bot can't execute exits, which is why you're seeing "max loss exit failed" messages.

## Recommendation

For tokens with:
- Burns + liquidity removals
- Phishing: 100%
- Low liquidity
- High centralization

**Exit immediately** - these are classic rug pull indicators. The bot should handle this automatically, but Jupiter rate limits are preventing exits.

