# Early Detection Improvement Request for Alpha Snipes Bot

## Context & Problem Statement

We've identified a critical gap in the bot's early detection capabilities that resulted in missing a **7+ hour early entry window** on a highly profitable token. This document explains what we discovered and what improvements are needed.

---

## The Token: BONKJOKER (Dibjwwu6pRGmx6dhXi24wZnd9re5gBS6QAdv72jbmoon)

### Timeline of Events

**Token Creation & Early Activity:**
- **13:37:22 UTC** (Nov 17, 2025) - Token created by Moonshot launchpad
- **14:49:08 UTC** (15:49:08 UTC+1) - **DjHusoWQdBki43kmkkUWrMBG1Hu1Ge8uWdywKFRPvSw9** executed first swap (BUY)
- **16:53:38 UTC** (17:53:38 UTC+1) - **CMWXCbA4GX9mFfJWb6SKJN6NRsvk6UqkTNW3n5vXpmBH** executed swap
- **21:52:24 UTC** (22:52:24 UTC+1) - **8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp** (main alpha) executed swap
- **~22:16:52 UTC** - Bot opened position (detected via main alpha)
- **22:45 UTC** - Price surge began (visible on DexScreener/GMGN charts)
- **22:55:29 UTC** - DjHusoWQdBki43kmkkUWrMBG1Hu1Ge8uWdywKFRPvSw9 sold at profit

### Price Movement

- **Early entry price** (14:49:08): ~$0.00005 SOL/token
- **Main alpha entry** (21:52:24): ~$0.00010 SOL/token (**2x higher**)
- **Bot entry** (22:16:52): ~$0.00012 SOL/token (**2.4x higher**)
- **Peak price** (22:45+): ~$0.00019 SOL/token

**Profit Comparison:**
- Early entry (14:49): **~280% gain**
- Bot entry (22:16): **~58% gain**
- **Missed opportunity: ~222% additional profit**

---

## The Two Key Wallets

### 1. DjHusoWQdBki43kmkkUWrMBG1Hu1Ge8uWdywKFRPvSw9 (Early Detector)

**Behavior Pattern:**
- ✅ Buys tokens **very early** (often within 1-2 hours of token creation)
- ✅ Consistently picks winners that later pump significantly
- ✅ Holds for several hours (not a quick flip)
- ✅ Sells at profit (exited at 22:55:29 after buying at 14:49:08 = 8+ hour hold)
- ✅ Pattern: Enters → Price consolidates → Main alpha enters → Price surges → Sells

**Solscan Analysis:**
- This wallet consistently interacts with new tokens before they gain mainstream attention
- Often one of the first 5-10 wallets to interact with a new mint
- High win rate on tokens that later pump
- Acts as a **leading indicator** for tokens that will perform well

**Current Bot Status:**
- Initially added as **CANDIDATE** (watched but trades not copied)
- Later manually promoted to **ACTIVE** via `/addactive` command
- Bot was detecting touches but not copying trades when it was a candidate

### 2. 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp (Main Alpha)

**Behavior Pattern:**
- ✅ Enters tokens after early wallets have validated them
- ✅ Enters when price is still low but token is gaining traction
- ✅ Often enters 6-8 hours after token creation
- ✅ Consistent profitable trades
- ✅ This is the wallet the bot was primarily following

**Current Bot Status:**
- **ACTIVE** alpha (bot copies all trades)
- Bot detected this wallet's interaction at 21:52:24 UTC
- Bot executed buy shortly after (22:16:52 UTC)

---

## What We Discovered

### The Critical Gap

**Problem:** The bot has a two-tier system:
1. **ACTIVE_ALPHAS** - Bot copies all trades immediately
2. **CANDIDATE_ALPHAS** - Bot watches and scores, but **does NOT copy trades**

**What Happened:**
1. `DjHusoWQdBki43kmkkUWrMBG1Hu1Ge8uWdywKFRPvSw9` was added as a **candidate**
2. Bot detected it touched the mint at 22:41:31 UTC
3. Bot **did NOT copy the trade** because it was only a candidate
4. Bot only acted when main alpha (`8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp`) entered at 21:52:24 UTC
5. By that time, the token had already been validated by early wallets and price was starting to move

**Result:** Bot missed **7+ hours** of early entry opportunity (14:49:08 → 21:52:24)

### Why This Matters

**Pattern Recognition:**
- Early wallets like `DjHusoWQdBki43kmkkUWrMBG1Hu1Ge8uWdywKFRPvSw9` consistently pick winners
- They enter when tokens are brand new and prices are lowest
- Main alpha wallets like `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp` enter later, after validation
- **Following only the main alpha means missing the best entry prices**

**Profit Impact:**
- Early entry: 2-3x better entry price
- Early entry: 2-3x higher profit potential
- Early entry: Lower risk (entering at bottom vs. entering during pump)

---

## What We Requested

### Primary Request

**Configure the bot to automatically catch early signs from high-performing candidate wallets.**

Specifically:
1. **Auto-Promotion System:** Automatically promote candidate wallets to active status when they prove themselves
2. **Early Detection Logic:** Identify wallets that consistently enter tokens early and profit
3. **Multi-Wallet Confirmation:** When multiple wallets (candidate + active) interact with the same token early, treat as high-confidence signal

### Secondary Requests

1. **Token Creation Monitoring:** Monitor new token creations and detect when watched wallets interact within first 2 hours
2. **Performance-Based Promotion:** Track candidate wallet performance (win rate, profit %, early entry timing) and auto-promote when criteria are met
3. **Cross-Wallet Pattern Detection:** Learn which wallets consistently buy tokens that later pump, and start copying their trades automatically

---

## How to Improve Bot Effectiveness

### Option 1: Auto-Promotion of High-Performing Candidates (Recommended)

**Implementation:**
- Track candidate wallet performance metrics:
  - Win rate (tokens that pump after entry)
  - Average profit percentage
  - Early entry timing (how quickly after token creation)
  - Consistency (number of successful trades)
- Auto-promote to active when criteria met:
  - Win rate > 60%
  - Average profit > 50%
  - Early entry (buys within 2 hours of token creation) in 3+ cases
  - Consistent pattern (3+ successful trades)

**Benefits:**
- Automatically discover and follow new alpha wallets
- No manual intervention needed
- Bot learns which wallets are worth following
- Catches early entries automatically

### Option 2: Multi-Tier Alpha System

**Implementation:**
- **Tier 1 (Active):** Copy all trades immediately (1 SOL position size)
- **Tier 2 (High-Confidence Candidates):** Copy trades with smaller position size (0.5 SOL)
- **Tier 3 (Candidates):** Watch only, don't copy

**Promotion Logic:**
- Tier 3 → Tier 2: After 2 successful trades with >30% profit
- Tier 2 → Tier 1: After 5 successful trades with >50% average profit

**Benefits:**
- Get early entries from promising wallets
- Reduce risk with smaller position sizes
- Still benefit from early detection
- Gradual promotion based on proven performance

### Option 3: Token Creation Monitoring + Early Wallet Detection

**Implementation:**
- Monitor new token creations (via Moonshot/other launchpads)
- When a new token is created, check if any watched wallets (active OR candidate) interact within first 2 hours
- If multiple wallets interact early, treat as high-confidence signal
- Enter position even if wallet is only a candidate (with smaller size)

**Benefits:**
- Catch tokens at the absolute earliest moment
- Multiple wallet confirmation increases confidence
- Can enter before main alpha even knows about the token
- Maximize early entry advantage

### Option 4: Cross-Wallet Pattern Detection

**Implementation:**
- Track which wallets consistently buy tokens that later pump
- When wallet A (candidate) buys a token, check if wallet B (known good alpha) also bought it
- If pattern emerges (A → B → pump), start copying A's trades
- Build a network of early detectors

**Benefits:**
- Discover new alpha wallets automatically
- Learn from successful patterns
- Build a network of early detectors
- Increase early entry success rate

### Option 5: Birdeye Historical Analysis

**Implementation:**
- On bot startup, scan Birdeye for recent trades by candidate wallets
- Identify tokens that candidates bought but bot missed
- Analyze which candidates are consistently early
- Auto-promote based on historical performance

**Benefits:**
- Learn from past performance
- Identify which candidates should be active
- Backfill missed opportunities for analysis
- Improve future detection

---

## Expected Improvements

### Current Behavior
- Bot enters when main alpha enters: ~21:52:24 UTC
- Entry price: ~$0.00010 SOL/token
- Peak price: ~$0.00019 SOL/token
- **Gain: ~90%**

### With Early Detection
- Bot enters when early wallet enters: ~14:49:08 UTC
- Entry price: ~$0.00005 SOL/token
- Peak price: ~$0.00019 SOL/token
- **Gain: ~280%**

### Improvement
- **7+ hours earlier entry**
- **2x better entry price**
- **3x higher profit potential**
- **~190% additional profit**

---

## Screenshots & Evidence

### 1. DexScreener Chart
- Shows price surge starting at 22:45 UTC
- Green candle indicates massive price increase (+1700%+)
- Token: BONKJOKER/USDC on Meteora DBC

### 2. GMGN.ai Analytics
- Shows wallet `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp` as top holder (37.48%)
- Unrealized PnL: +$67.5K (+2242.52%)
- Entry time: 21:52 (matches bot detection)
- Price chart shows green candle starting at 21:52

### 3. Telegram Messages
- `[PAPER] 👀 Alpha touched new mint Dibjww...moon` at 22:52
- `[PAPER] ✅ Bought Dibjww...moon` at 22:52
- Entry Price: 0 SOL (bug - should show actual price)
- Cost: 1 SOL
- Tokens: 1631.80B

### 4. Solscan Transaction History
- Token created: 13:37:22 Nov 17, 2025
- First swap by DjHusoWQdBki43kmkkUWrMBG1Hu1Ge8uWdywKFRPvSw9: 14:49:08
- Swap by CMWXCbA4GX9mFfJWb6SKJN6NRsvk6UqkTNW3n5vXpmBH: 16:53:38
- Swap by 8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp: 21:52:24

---

## Key Insights

### 1. Early Wallet Pattern
- Wallets like `DjHusoWQdBki43kmkkUWrMBG1Hu1Ge8uWdywKFRPvSw9` consistently enter tokens very early
- They act as **leading indicators** for tokens that will perform well
- Following them provides **2-3x better entry prices**

### 2. Two-Stage Entry Pattern
- **Stage 1:** Early wallets enter (1-2 hours after creation)
- **Stage 2:** Main alpha wallets enter (6-8 hours after creation)
- **Current bot:** Only catches Stage 2
- **Improved bot:** Should catch Stage 1

### 3. Candidate vs Active Gap
- Candidates are watched but not copied
- This causes bot to miss early entries
- Auto-promotion or multi-tier system would solve this

### 4. Performance-Based Learning
- Bot should learn which wallets consistently pick winners
- Auto-promote high performers
- Build a network of early detectors

---

## Implementation Priority

### High Priority (Immediate Impact)
1. **Auto-promotion logic** - Automatically promote candidates to active based on performance
2. **Multi-tier system** - Allow copying candidate trades with smaller position size
3. **Early entry detection** - Detect when candidates enter tokens very early

### Medium Priority (Significant Improvement)
4. **Token creation monitoring** - Monitor new tokens and detect early wallet interactions
5. **Cross-wallet pattern detection** - Learn which wallets consistently pick winners

### Low Priority (Nice to Have)
6. **Birdeye historical analysis** - Learn from past performance
7. **Advanced pattern recognition** - ML-based wallet scoring

---

## Questions for ChatGPT

1. **Which approach is best?** Auto-promotion, multi-tier, or combination?
2. **How to track performance?** What metrics are most important?
3. **How to detect early entries?** Token creation monitoring vs. transaction analysis?
4. **Risk management?** How to balance early entry with risk (smaller positions for candidates)?
5. **Implementation complexity?** Which approach is easiest to implement with highest impact?

---

## Conclusion

The bot is working correctly but is limited by only copying from active alphas. By implementing auto-promotion of high-performing candidates and/or multi-tier alpha system, the bot can enter positions **7+ hours earlier**, significantly increasing profit potential.

**The key insight:** Early wallets that consistently pick winners should be treated as active alphas, not just candidates. The bot should learn and adapt automatically, not require manual promotion.

**Expected outcome:** 2-3x better entry prices, 2-3x higher profit potential, and significantly improved win rate by catching tokens at their absolute earliest moment.

