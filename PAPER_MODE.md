# 📄 Paper Trading Mode Guide

> **📚 This content has moved to organized documentation.**  
> See [docs/OPERATOR_GUIDE.md](docs/OPERATOR_GUIDE.md) for the complete operator guide, including paper mode walkthrough, commands, and best practices.  
> Also see: [docs/CONFIG_REFERENCE.md](docs/CONFIG_REFERENCE.md), [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

---

## What is Paper Mode?

Paper trading lets you **test the bot with zero risk** by simulating all trades using real-time market data. No actual transactions are sent to the blockchain, and **no wallet private key is required**.

### Paper Mode Features

✅ **Real-time alpha wallet monitoring** - Watches actual on-chain activity  
✅ **Live Jupiter quotes** - Uses current market prices for simulation  
✅ **Full rug checks** - Tests all safety validations  
✅ **Simulated buys & sells** - Tracks positions as if real  
✅ **Exit management** - Early TP + trailing stop logic  
✅ **Sentry monitoring** - Emergency exit simulation  
✅ **PnL reporting** - Shows hypothetical profit/loss  
✅ **Telegram alerts** - All tagged with [PAPER]  
✅ **Zero on-chain cost** - No gas fees, no real SOL spent  
✅ **`/pnl` and `/open` commands** - Realized/unrealized PnL tracking  
✅ **Inline Telegram buttons** - One-tap Solscan links (`[🪙 Mint] [👤 Alpha] [🔗 TX]`)  
✅ **Heartbeat and silent watchdog** - Automated bot health monitoring  
✅ **Partial Take-Profit** - Configurable fractional profit-taking via `PARTIAL_TP_PCT`  

### What Paper Mode Does NOT Include

- Real mempool effects (MEV, sandwich attacks)
- Actual slippage variations
- Priority fee impact on fill speed
- Real-world execution delays
- Gas costs

**Paper mode is ideal for validating logic, timings, and strategy before risking real funds.**

---

## 🚀 Quick Start (Paper Mode)

### 1. Install Dependencies

```bash
# Fix npm cache (one-time)
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"

# Install packages
cd "/Users/emmanuelyeboah/Projects/Alpha Snipes"
npm install
```

### 2. Configure for Paper Trading

```bash
# Copy template
cp env.template .env

# Edit .env
nano .env
```

**Required settings for paper mode:**

```env
# Telegram (already configured from test)
TELEGRAM_TOKEN=7942901226:AAEvyakUM4kK-rzOhDzAkZxQcZpO1RiE2UQ
TELEGRAM_CHAT_ID=-1003291954761

# Paper mode (default)
TRADE_MODE=paper

# Alpha wallet to watch (REQUIRED)
ALPHA_WALLET=your_alpha_wallet_address_here

# Trade parameters
BUY_SOL=0.02
EARLY_TP_PCT=0.3
TRAIL_STOP_PCT=0.2
```

**NOT NEEDED in paper mode:**
- ❌ `WALLET_PRIVATE_KEY` - Not required (dummy wallet auto-generated)

### 3. Run Paper Trading

```bash
npm start
```

**Console output:**

```
🚀 Alpha Snipes Bot Starting... 📄 PAPER MODE
📍 Wallet: AbCdEfGh... (dummy wallet)
👀 Watching: YourAlphaWallet...
💰 Buy size: 0.02 SOL

⚠️  PAPER MODE ACTIVE - No real transactions will be sent!
   All trades are simulated using live Jupiter quotes.
   Set TRADE_MODE=live in .env to enable real trading.
```

**Telegram output:**

```
[PAPER] 🚀 Alpha Snipes Bot Started (PAPER MODE)
Wallet: AbCdEfGh...
Watching: YourAlphaWallet...
Buy: 0.02 SOL | TP: 30% | Trail: 20%
```

---

## 📊 Example Paper Trading Flow

### 1. Detection
```
[PAPER] 👀 Alpha touched new mint 7xKXtg2...
   TX: abc123...
```

### 2. Rug Checks
```
[PAPER] ⛔️ Skipping 7xKXtg2... due to: authority_not_revoked
```
Or if checks pass:
```
[PAPER] ✅ Bought 0.02 SOL of 7xKXtg2... (checks passed)
   TX: [PAPER-BUY]
   Ref price ~ 0.0000012345 SOL/token
```

### 3. Monitoring
```
[PAPER] 🛡️ Sentry monitoring 7xKXtg2... for 120s...
```

### 4. Early TP Hit
```
[PAPER] 🎯 Early TP hit for 7xKXtg2...: 0.0000016049 SOL
   Switching to trailing stop...
```

### 5. Exit
```
[PAPER] 🛑 Trailing stop exit: 7xKXtg2...
   Price: 0.0000014800 SOL
   PnL: +19.8%
   TX: [PAPER-SELL]

[PAPER] 📈 PnL for 7xKXtg2...
   Entry: 0.0200 SOL
   Exit: 0.0240 SOL
   Profit: +0.0040 SOL (+20.0%)
```

### 6. Partial Take-Profit Example

**Enable Partial TP (optional):**
```bash
# In .env, set:
PARTIAL_TP_PCT=0.5    # Sell 50% at Early TP, trail with 50%
```

**Flow with Partial TP:**
```
[PAPER] 🎯 Early TP hit for EPjFWd…Dt1v
Price: 0.00000156 SOL (~$0.0004)

[PAPER] 💡 Partial TP: Sold $1.19 | +$0.19 (+17.0%)

Partial: 50% sold above
Target: 0.00000156 SOL
Switching to trailing stop...

[PAPER] 🛑 Trailing stop exit: EPjFWd…Dt1v (remainder)
Exit: 0.00000148 SOL (~$0.0004)

[🪙 Mint] [👤 Alpha] [🔗 TX]  ← clickable inline buttons

💡 Bought $1.19 → Sold $1.47 | +$0.28 (+23.5%)

Total realized: +$0.47 across 2 exits
```

**Benefits:**
- Lock in partial profits early
- Reduce risk while keeping upside potential
- Automatic ledger tracking of both exits
- Configurable split (0.33 = 33%, 0.5 = 50%, etc.)

---

## 🎯 How Paper Mode Works

### Quote-Based Simulation

1. **Buy Simulation**
   - Gets real Jupiter quote for SOL → Token
   - Records expected token amount
   - Stores position with entry price
   - Reports as `[PAPER-BUY]`

2. **Price Monitoring**
   - Polls Jupiter every 5 seconds
   - Uses real market prices
   - Updates high-water mark

3. **Sell Simulation**
   - Gets real Jupiter quote for Token → SOL
   - Calculates hypothetical SOL received
   - Reports PnL
   - Tagged as `[PAPER-SELL]`

### PnL Calculation

```
Entry SOL: What you "spent" (e.g., 0.02 SOL)
Exit SOL: What Jupiter quote says you'd get back
Profit: Exit - Entry
PnL %: (Profit / Entry) × 100
```

**Example:**
- Entry: 0.0200 SOL
- Exit quote: 0.0240 SOL
- Profit: +0.0040 SOL
- PnL: +20.0%

---

## 🔧 Tuning in Paper Mode

Test different strategies risk-free:

### Conservative Strategy
```env
EARLY_TP_PCT=0.2           # Take 20% profit quickly
TRAIL_STOP_PCT=0.10        # Tight 10% stop
MAX_TAX_BPS=300            # Lower tax tolerance
SENTRY_MAX_DRAWDOWN_PCT=0.15  # Stricter safety
```

### Aggressive Strategy
```env
EARLY_TP_PCT=0.5           # Wait for 50% gain
TRAIL_STOP_PCT=0.25        # Loose 25% stop
MAX_TAX_BPS=1000           # Accept higher taxes
SENTRY_MAX_DRAWDOWN_PCT=0.30  # Wider tolerance
```

### Different Position Sizes
```env
BUY_SOL=0.001  # Micro positions
BUY_SOL=0.01   # Small positions
BUY_SOL=0.05   # Medium positions
```

**Run for a day or two** and review the results in your Telegram channel to see which settings work best.

---

## 📈 Analyzing Paper Trading Results

### Track These Metrics

1. **Win Rate**
   - Count profitable exits vs total exits
   - Target: 40%+ is good

2. **Average PnL**
   - Sum all PnL percentages
   - Divide by number of trades
   - Target: Positive average

3. **Rug Check Pass Rate**
   - Count passed checks vs total detections
   - If too low, adjust `MAX_TAX_BPS` or `MAX_PRICE_IMPACT_BPS`

4. **Exit Types**
   - Early TP hits (good!)
   - Trailing stops (great!)
   - Sentry aborts (protecting you!)

### Example Analysis

After 20 paper trades:
```
✅ Profitable: 9 trades
❌ Losses: 11 trades
Win Rate: 45%

Total PnL: +0.12 SOL (if real)
Average per trade: +0.6%

Rug checks:
  Passed: 20 / 35 detected (57%)
  Failed: 15 (authority issues, high tax, etc.)

Exit breakdown:
  Early TP: 5 trades
  Trailing stop: 12 trades
  Sentry abort: 3 trades
```

**Analysis:** Strategy is working! 45% win rate with positive average means the bot catches good moves and cuts losses quickly.

---

## 🔄 Switching to Live Mode

Once you're satisfied with paper mode results:

### 1. Get Your Wallet Ready

- **Create a dedicated trading wallet** (recommended)
- Fund it with SOL for trading + gas
  - Example: 0.5 SOL for 20-25 small trades
  - ~0.02 SOL per trade + ~0.005 SOL gas each

### 2. Export Private Key

**From Phantom:**
1. Settings → Security & Privacy
2. Export Private Key
3. Copy the **base58** string

### 3. Update .env

```env
# Switch to live mode
TRADE_MODE=live

# Add your wallet key
WALLET_PRIVATE_KEY=YourBase58PrivateKeyHere...

# Start with small positions!
BUY_SOL=0.01
```

### 4. Final Checklist

- [ ] Tested in paper mode for 24-48 hours
- [ ] Positive average PnL in paper mode
- [ ] Understand rug checks and exit logic
- [ ] Created dedicated trading wallet
- [ ] Funded wallet with limited SOL (start small!)
- [ ] Set `TRADE_MODE=live` in .env
- [ ] Added `WALLET_PRIVATE_KEY` to .env
- [ ] Reduced `BUY_SOL` to minimum (0.001-0.01)

### 5. Run Live

```bash
npm start
```

Console will show:
```
🚀 Alpha Snipes Bot Starting... 💰 LIVE MODE
```

Telegram will show:
```
🚀 Alpha Snipes Bot Started (LIVE)
```

**No more [PAPER] tags - it's real now!**

---

## ⚠️ Important Notes

### Paper Mode Limitations

1. **Slippage isn't real** - Actual fills may differ from quotes
2. **No MEV protection** - Live trades face sandwich attacks
3. **Priority fees don't matter** - In live mode, `CU_UNIT_PRICE` affects speed
4. **Gas costs not included** - Each live trade costs ~0.005 SOL
5. **Quote ≠ Execution** - Market can move between quote and fill

### Paper Mode Best Practices

1. **Test for 24-48 hours minimum** - See different market conditions
2. **Watch multiple alpha wallets** - Change `ALPHA_WALLET` and compare
3. **Try different settings** - Test conservative vs aggressive
4. **Note rug check patterns** - Learn what gets filtered
5. **Track all metrics** - Win rate, avg PnL, exit types

### Switching Back to Paper

Need to test a new strategy? Just switch back:

```env
TRADE_MODE=paper
```

You can toggle between modes anytime.

---

## 🐛 Troubleshooting Paper Mode

### Bot starts but no detections

**Issue:** Alpha wallet might be inactive

**Fix:**
1. Check wallet on [Solscan](https://solscan.io)
2. Verify recent transactions
3. Try a different alpha wallet
4. Lower polling interval (code edit)

### All trades fail rug checks

**Issue:** Alpha is targeting risky tokens

**Fix:**
```env
MAX_TAX_BPS=1000           # More lenient
MAX_PRICE_IMPACT_BPS=5000  # Accept more slippage
```

Or find a safer alpha wallet.

### No Jupiter quotes found

**Issue:** RPC rate limiting or no liquidity

**Fix:**
1. Use premium RPC (Helius/QuickNode)
2. Alpha is trading very illiquid tokens
3. Check RPC is working: `curl https://api.mainnet-beta.solana.com`

### Telegram alerts not appearing

**Issue:** Bot or channel misconfigured

**Fix:**
```bash
# Test Telegram separately
npm run test:telegram
```

Should see test message in channel.

---

## 📚 Next Steps

1. ✅ Run paper mode for 24-48 hours
2. ✅ Analyze results in Telegram
3. ✅ Tune settings based on performance
4. ✅ Switch to live mode when ready
5. ✅ Start with tiny positions (0.001-0.01 SOL)
6. ✅ Gradually increase as confidence grows

---

## 💡 Pro Tips

### Multi-Alpha Testing

Test multiple alpha wallets in parallel:

**Terminal 1:**
```bash
ALPHA_WALLET=wallet1 npm start
```

**Terminal 2:**
```bash
ALPHA_WALLET=wallet2 npm start
```

See which alpha performs better!

### Keep Paper Mode Running

Even when trading live, run a paper mode instance to test new strategies:

**Terminal 1 (Live):**
```bash
TRADE_MODE=live BUY_SOL=0.01 npm start
```

**Terminal 2 (Paper - Testing):**
```bash
TRADE_MODE=paper BUY_SOL=0.05 EARLY_TP_PCT=0.5 npm start
```

---

**Paper mode = Zero risk, maximum learning. Use it!** 📄✨


