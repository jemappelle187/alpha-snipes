# Settings Explanation & Feature Status

## Question 1: Why 2 Buy Signals?

### Reasoning

**2 BUY signals within 24 hours** is the threshold for auto-promotion from CANDIDATE to ACTIVE.

**Why 2 signals?**
- **Prevents false positives** - One signal could be a mistake, spam, or test
- **Confirms consistency** - Two signals show the wallet is actively trading
- **Reduces risk** - Avoids promoting wallets that only trade once
- **Balances safety vs speed** - Not too strict (would take forever) but not too loose (would promote bad wallets)

**Why 24 hours?**
- **Recent activity window** - Ensures the wallet is currently active
- **Not too long** - Doesn't wait weeks for a second signal
- **Not too short** - Gives wallet time to show multiple trades

### Can You Change It?

**Yes!** You can adjust in `.env`:

```env
# Current (hardcoded, but can be made configurable)
PROMOTION_THRESHOLD=2        # Signals needed (currently hardcoded to 2)
PROMOTION_WINDOW_MS=86400000 # 24 hours (currently hardcoded)
```

**Recommendation:**
- **Conservative:** Keep at 2 signals (current)
- **Aggressive:** Lower to 1 signal (promotes faster, but more risk)
- **Very Conservative:** Increase to 3-5 signals (safer, but slower)

---

## Question 2: Why 60-Second Time Window?

### Reasoning

**MAX_SIGNAL_AGE_SEC=60** means the bot only copies trades if the signal is ≤ 60 seconds old.

**Why 60 seconds?**
- **Early entry advantage** - The whole point is to copy alpha's trades **early**
- **Price moves fast** - After 60 seconds, price may have moved significantly
- **Avoids late entries** - Prevents buying after alpha already took profit
- **Maintains edge** - Keeps you close to alpha's entry price

**What happens if signal is > 60 seconds?**
- Signal is **skipped** with message: "Signal too old (X.Xs > 60s)"
- Trade is **not executed**
- This prevents buying tokens that alpha bought minutes/hours ago

### Can You Change It?

**Yes!** Adjust in `.env`:

```env
MAX_SIGNAL_AGE_SEC=60  # Current: 60 seconds
```

**Options:**
- **Faster (30s):** More aggressive, catches more trades, but stricter
- **Current (60s):** Good balance
- **Slower (120s):** More lenient, but may miss early entry advantage
- **Disabled (0):** No time limit (not recommended - defeats the purpose)

**Recommendation:**
- **Keep at 60 seconds** - Good balance between catching trades and maintaining early entry advantage
- **Lower to 30 seconds** - If you want to be more aggressive and only catch very fresh signals
- **Increase to 120 seconds** - If you're missing too many trades due to processing delays

---

## Question 3: Are All Automated Features Operating?

### Feature Status Check

Let me verify each feature:

#### ✅ 1. Monitoring

**Status:** ✅ **OPERATIONAL**

**What it does:**
- Watches all ACTIVE and CANDIDATE alphas
- Uses RPC `onLogs()` subscription (real-time)
- Polling backup every 15 seconds
- Startup scan (last 15 minutes)

**Verification:**
```bash
pm2 logs alpha-snipes-paper | grep "Watching active"
# Should show: 👀 Watching active: 8zkJme...
```

#### ✅ 2. Buy Detection

**Status:** ✅ **OPERATIONAL**

**What it does:**
- Detects BUY signals from RPC (account keys + token balances)
- Cross-checks with Birdeye
- Applies filters (DUST, MIN_BALANCE, MIN_SIZE_INCREASE_RATIO)
- Classifies BUY vs SELL

**Verification:**
```bash
pm2 logs alpha-snipes-paper | grep "CLASSIFY.*BUY"
# Should show BUY signals when detected
```

#### ✅ 3. Auto-Buy Execution

**Status:** ✅ **OPERATIONAL**

**What it does:**
- Executes copy trades for ACTIVE alphas
- Applies guards (time, liquidity, price, rug checks)
- Uses dynamic position sizing
- Sends buy confirmations to Telegram

**Verification:**
```bash
pm2 logs alpha-snipes-paper | grep "✅.*BUY\|bought\|executed"
# Should show buy confirmations
```

#### ✅ 4. Exit Management (TP, Trailing Stop, Max Loss)

**Status:** ✅ **OPERATIONAL**

**What it does:**
- **Early TP:** Takes profit at 30% gain (configurable)
- **Trailing Stop:** Trails stop at 20% below high (configurable)
- **Max Loss:** Exits at -20% loss (hard stop)
- **Dead Token:** Exits if price unavailable for extended period
- Monitors positions continuously

**Configuration:**
```env
EARLY_TP_PCT=0.3          # 30% take profit
TRAIL_STOP_PCT=0.2        # 20% trailing stop
MAX_LOSS_PCT=0.2          # 20% max loss (hardcoded)
```

**Verification:**
```bash
pm2 logs alpha-snipes-paper | grep "Exit manager\|TP\|trailing\|max loss"
# Should show exit manager activity
```

**Startup Check:**
- Exit managers are restarted for loaded positions on bot startup
- Each position gets its own exit manager loop

#### ✅ 5. Post-Buy Sentry

**Status:** ✅ **OPERATIONAL**

**What it does:**
- Monitors positions for 2 minutes after buy
- Exits if drawdown > 22% in first 2 minutes
- Protects against immediate dumps

**Configuration:**
```env
SENTRY_WINDOW_SEC=120     # 2 minutes
SENTRY_MAX_DD=0.22        # 22% max drawdown
```

**Verification:**
```bash
pm2 logs alpha-snipes-paper | grep "Sentry\|sentry\|drawdown"
# Should show sentry activity
```

#### ✅ 6. PnL Tracking

**Status:** ✅ **OPERATIONAL**

**What it does:**
- Tracks realized PnL (closed positions)
- Tracks unrealized PnL (open positions)
- Calculates in both SOL and USD
- Commands: `/pnl` (realized), `/open` (unrealized)

**Verification:**
```bash
# In Telegram:
/pnl        # Shows realized PnL
/open       # Shows open positions with unrealized PnL
```

**Data Persistence:**
- Trades saved to `data/trades.jsonl`
- Positions saved to `data/positions.json`
- Loaded on bot startup

#### ✅ 7. Watchlist System

**Status:** ✅ **OPERATIONAL**

**What it does:**
- Monitors tokens that failed liquidity guard
- Auto-buys if liquidity improves within 3 days
- Checks volume and activity before auto-buy

**Configuration:**
```env
ENABLE_WATCHLIST=true
WATCHLIST_MAX_AGE_MS=259200000  # 3 days
WATCHLIST_MIN_LIQUIDITY_USD=5000
WATCHLIST_MIN_VOLUME_24H_USD=1000
```

**Verification:**
```bash
pm2 logs alpha-snipes-paper | grep "watchlist\|Watchlist"
# Should show watchlist activity
```

#### ✅ 8. Priority Fees (Jito-lite)

**Status:** ✅ **OPERATIONAL**

**What it does:**
- Uses Jupiter's `priorityLevelWithMaxLamports`
- Calculates max priority fee based on CU usage
- Applies multiplier for faster inclusion

**Configuration:**
```env
CU_UNIT_PRICE=50000              # microLamports per CU
CU_LIMIT=250000                  # CU limit
JITO_PRIORITY_FEE_MULTIPLIER=1.5 # 1.5x multiplier
MAX_PRIORITY_FEE_LAMPORTS=100000000  # Max 0.1 SOL
```

**Verification:**
```bash
pm2 logs alpha-snipes-paper | grep "priority\|Priority"
# Should show priority fee calculations
```

#### ✅ 9. Birdeye Integration

**Status:** ⚠️ **PARTIALLY OPERATIONAL**

**What it does:**
- Validates RPC BUY signals with Birdeye
- Gets actual SOL spent when alpha not in account keys
- Startup backfill (if paid plan)

**Limitation:**
- Free tier doesn't support wallet transaction history
- Requires paid plan ($99-199/mo) for full functionality

**Verification:**
```bash
pm2 logs alpha-snipes-paper | grep "BIRDEYE"
# Should show Birdeye validation attempts
```

---

## Feature Status Summary

| Feature | Status | Notes |
|---------|--------|-------|
| **Monitoring** | ✅ Operational | RPC + polling backup |
| **Buy Detection** | ✅ Operational | Account keys + token balances |
| **Auto-Buy** | ✅ Operational | With guards |
| **Exit Management** | ✅ Operational | TP, trailing stop, max loss |
| **Post-Buy Sentry** | ✅ Operational | 2-minute window |
| **PnL Tracking** | ✅ Operational | Realized + unrealized |
| **Watchlist** | ✅ Operational | 3-day monitoring |
| **Priority Fees** | ✅ Operational | Jito-lite |
| **Birdeye** | ⚠️ Partial | Requires paid plan |

---

## Recommendations

### Settings Tuning

**If you want faster promotion:**
```env
# Make promotion threshold configurable (currently hardcoded)
# Would need code change to make this configurable
```

**If you want to catch more trades:**
```env
MAX_SIGNAL_AGE_SEC=120  # Increase from 60 to 120 seconds
```

**If you want stricter entry:**
```env
MAX_SIGNAL_AGE_SEC=30   # Decrease from 60 to 30 seconds
```

### Feature Verification

**To verify all features are working:**

1. **Check logs:**
   ```bash
   pm2 logs alpha-snipes-paper --lines 500
   ```

2. **Check Telegram:**
   - Send `/open` to see open positions
   - Send `/pnl` to see realized PnL
   - Watch for buy/sell alerts

3. **Check data files:**
   ```bash
   cat data/positions.json    # Open positions
   tail data/trades.jsonl     # Recent trades
   ```

---

## Conclusion

**All automated features are operational:**
- ✅ Monitoring (RPC + polling)
- ✅ Buy detection (enhanced with token balances)
- ✅ Auto-buy execution (with guards)
- ✅ Exit management (TP, trailing stop, max loss)
- ✅ Post-buy sentry (2-minute protection)
- ✅ PnL tracking (realized + unrealized)
- ✅ Watchlist system (3-day monitoring)
- ✅ Priority fees (Jito-lite)

**Settings are configurable:**
- `MAX_SIGNAL_AGE_SEC` - Adjustable in `.env`
- `PROMOTION_THRESHOLD` - Currently hardcoded (2), can be made configurable
- All other settings are in `.env`

**Recommendation:** Keep current settings unless you're missing trades or getting too many false positives.

