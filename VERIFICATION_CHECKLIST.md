# Alpha Snipes Bot - Verification Checklist

This checklist ensures all buy paths (alpha, watchlist, force-buy) and exit strategies (+20% TP, trailing stop, max loss, crash, liquidity-drop) work correctly.

---

## A. Config & Startup Sanity

### 1. Restart & Config Log

**Action:** Restart the bot and check Telegram "Bot Started" card

**Expected:**
- ✅ Mode: `PAPER` or `LIVE` (with appropriate emoji)
- ✅ Wallet: Shortened pubkey (e.g., `8zkJme…dCVp`)
- ✅ Buy Size: `1 SOL` (for all flows)
- ✅ Take-Profit: `20%`
- ✅ Trailing Stop: `20%`
- ✅ Sentry Window: `120s`
- ✅ Max Signal Age: `300s` (5 minutes)
- ✅ Liquidity Guard: `$3,000` (alpha) / `$10,000` (watchlist)
- ✅ Watchers Active: Count of active alpha wallets
- ✅ Candidates Monitoring: Count of candidate wallets
- ✅ Version: From `package.json`
- ✅ Started: ISO timestamp

**PM2 Logs Check:**
```bash
pm2 logs alpha-snipes-paper --lines 50 | grep -E "\[CONFIG\]|Bot Started"
```

**Expected Logs:**
- `[CONFIG] MAX_SIGNAL_AGE_SEC = 300s (5 minutes)`
- `[CONFIG] BUY_SOL = 1 SOL (applied to alpha, watchlist and force-buy)`
- `[CONFIG] MIN_LIQUIDITY_USD_ALPHA = $3000`
- `[CONFIG] MIN_LIQUIDITY_USD = $10000`

### 2. Env Alignment

**Action:** Verify `.env` values match expected configuration

**Check:**
- `MAX_SIGNAL_AGE_SEC=300`
- `BUY_SOL=1.0` (or verify hardcoded in code)
- `MIN_LIQUIDITY_USD_ALPHA=3000`
- `MIN_LIQUIDITY_USD=10000`
- `TRADE_MODE=paper` or `live`

**Verify:** No runtime overrides that conflict with these values

---

## B. Entry Path Correctness Per Source

### 1. Force-Buy Flow

**Action:** Trigger `/force_buy <mint>` in Alpha Control channel

**Telegram Entry Card Should Show:**
- ✅ `Size: 1 SOL (~$xxx.xx)`
- ✅ `Entry Price: <non-zero> SOL/token (~$xx.xx)` (NOT "0 SOL")
- ✅ `Cost: 1 SOL`
- ✅ `Tokens: <non-zero>` (formatted with K/M/B suffixes)
- ✅ `Liquidity: $XX,XXX (Birdeye|DexScreener)` (if available)

**PM2 Logs Check:**
```bash
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[ENTRY\]\[FORCE\]|\[ENTRY\]\[PRICE\]\[FORCE\]"
```

**Expected Logs:**
- `[ENTRY][FORCE] mint=... sizeSol=1 entryPrice=... mode=normal`
- `[ENTRY][PRICE][FORCE] Using liquidity price: ...` OR
- `[ENTRY][PRICE][FORCE] Derived entry price from swap amounts: ...`
- `sizeSol=1`
- `entryPrice > 0` (not 0, not null)
- `mode=normal`
- `source=force`

**Position File Check:**
```bash
cat data/positions.json | jq '.["<mint>"]'
```

**Expected:**
- `costSol: 1`
- `entryPrice > 0`
- `qty > 0` (token amount)
- `mode: "normal"`
- `source: "force"`

### 2. Alpha Auto-Buy Flow

**Action:** Wait for real alpha BUY signal or temporarily lower filters for testing

**Telegram "Bought ..." Message Should Show:**
- ✅ `Size: 1 SOL`
- ✅ `Entry Price: <non-zero> SOL/token (~$xx.xx)`
- ✅ `Cost: 1 SOL`
- ✅ `Tokens: <non-zero>`
- ✅ `Liquidity: $XX,XXX (Birdeye|DexScreener)` (triangulated value)

**PM2 Logs Check:**
```bash
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[ENTRY\]\[ALPHA\]|\[ENTRY\]\[PRICE\]"
```

**Expected Logs:**
- `[ENTRY][ALPHA] opening position mint=... sizeSol=1 liquidityUsd=... entryPrice=... mode=normal`
- `liquidityUsd >= MIN_LIQUIDITY_USD_ALPHA` (or unknown with fail-open)
- `entryPrice > 0` (calculated from swap amounts)

**Position File Check:**
- `source: "alpha"`
- `mode: "normal"`
- All price/amount fields non-zero

### 3. Watchlist Auto-Buy Flow

**Action:** Use a token that initially had `no_route_buy`, got added to watchlist, then gained liquidity

**When "Watchlist ready / Auto-buying now..." Runs:**
- ✅ Entry card looks exactly like alpha/force (1 SOL, proper entry price)
- ✅ No "tiny entry TP" for watchlist entries
- ✅ `Entry Price: <non-zero> SOL/token`

**PM2 Logs Check:**
```bash
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[ENTRY\]\[WATCHLIST\]|\[WATCHLIST\]"
```

**Expected Logs:**
- `[ENTRY][WATCHLIST] opening position mint=... sizeSol=1 entryPrice=... mode=normal (forced normal - liquidity validated)`
- `mode=normal` (never tiny_entry for watchlist)

**Position File Check:**
- `source: "watchlist"`
- `mode: "normal"`
- All price/amount fields non-zero

---

## C. Entry-Price Robustness

### 1. Provider Outage / New Pool Test

**Action:** Pick a brand-new mint right when it launches (or simulate provider failure)

**Expected Logs:**
```bash
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[LIQ\]\[TRIANGULATE\]|\[ENTRY\]\[PRICE\]"
```

**Expected:**
- `[LIQ][TRIANGULATE] mint=... | candidates=X | dexscreener=$0/1 | birdeye=$XXk/1 | best=...`
- `[ENTRY][PRICE] Derived entry price from on-chain amounts: ...` (when providers fail)
- `[ENTRY][PRICE] Using liquidity price: ...` (when triangulation works)

**Telegram Buy Message:**
- ✅ `Entry Price: <non-zero> SOL/token` (NOT "0 SOL")
- ✅ No zero in "Entry:" line
- ✅ No "tiny-entry TP" unless intentionally configured for tiny probes

### 2. Verify Fallback Ordering

**Action:** Monitor logs during entry for price resolution

**Expected Log Sequence:**
1. `[ENTRY][PRICE] Using liquidity price: ...` (if provider price missing but triangulation worked)
2. `[ENTRY][PRICE] Using pre-swap quote price: ...` (if liquidity price missing)
3. `[ENTRY][PRICE] Derived entry price from swap amounts: ...` (final fallback)

**Never Should See:**
- `entryPrice = 0` in logs
- `[ENTRY][PRICE][FATAL]` (should abort position creation instead)

### 3. Sanity on Tiny-Entry Mode

**Action:** Verify tiny-entry mode only triggers for actual probe trades

**Expected Behavior:**
- ✅ Tiny-entry mode ONLY when:
  - `buySol < 0.01` AND
  - `liquidityUnknown = true` OR `priceUnknown = true`
- ✅ NEVER for full-size 1 SOL entries
- ✅ All 1 SOL entries use `mode: "normal"`

**Check:**
```bash
pm2 logs alpha-snipes-paper --lines 200 | grep -E "\[ENTRY\].*mode=|tiny.*entry"
```

**Should NOT See:**
- `mode=tiny_entry` for `sizeSol=1`
- "Tiny entry TP hit" for 1 SOL positions

---

## D. Liquidity Triangulation Sanity

### 1. Triangulation Logs

**Action:** Capture logs for a few tokens with different provider states

**Expected Logs:**
```bash
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[LIQ\]\[TRIANGULATE\]|\[LIQ\] Triangulated"
```

**Example:**
- `[LIQ][TRIANGULATE] mint=... | candidates=2 | dexscreener=$0/1 | birdeye=$35k/1 | best=birdeye:$35k Meteora`
- `[LIQ] Triangulated ... liquidity=$35k | source=birdeye | pair=... | dex=Meteora`

### 2. Telegram Entry Card Liquidity

**Action:** Verify entry cards show correct triangulated liquidity

**Expected:**
- ✅ `Liquidity: $35k (Birdeye)` when DexScreener is wrong/missing
- ✅ `Liquidity: $XXk (DexScreener)` when Birdeye is missing
- ✅ No more `Liquidity: $0.00` when GMGN/DexScreener shows real liquidity

### 3. Force-Buy Liquidity Display

**Action:** Test `/force_buy` on a token with triangulated liquidity

**Expected:**
- ✅ Force-buy message shows triangulated liquidity (not $0.00)
- ✅ Source label shown: `(Birdeye)` or `(DexScreener)`
- ✅ Pool address and DEX label if available

---

## E. Exit Behavior & +20% TP

### 1. Happy Path: +20% TP

**Action:** Use a token that pumps clearly >20% after entry

**Expected Logs:**
```bash
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[EXIT\].*gainPct=|\[EXIT\].*hard_profit_20pct"
```

**Expected:**
- `[EXIT][DEBUG] gainPct=22.3% ...`
- `[EXIT] Position closed for ... | source=alpha|force|watchlist | mode=normal | reason=hard_profit_20pct | pnl=22.3%`

**Expected Telegram Message:**
- ✅ `✅ Auto-close at +20%: <Token>`
- ✅ `Gain: +22.3% (target: +20%)`
- ✅ Entry/Exit prices shown
- ✅ SOL PnL shown
- ✅ Winner card with green highlighting

### 2. Trailing Stop Path

**Action:** Let a token go up >20%, then dip ~5–10% from high without hitting max loss

**Expected Logs:**
```bash
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[EXIT\].*trailing_stop"
```

**Expected:**
- `[EXIT] Position closed ... | reason=trailing_stop | pnl=...`

**Expected Telegram Message:**
- ✅ `🛑 Trailing stop exit: <Token>`
- ✅ Shows high price and current price
- ✅ PnL percentage

### 3. Max Loss Path

**Action:** Test with a token that dumps quickly

**Expected Logs:**
```bash
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[EXIT\].*max_loss"
```

**Expected:**
- `[EXIT] Position closed ... | reason=max_loss | pnl=-xx.x%`

**Expected Telegram Message:**
- ✅ `🛡️ Max loss protection: <Token>`
- ✅ `Loss: -xx.x% (limit: -10%)`
- ✅ Entry/Exit prices
- ✅ Loser card with red highlighting

### 4. Crash & Tiny-Entry Fallback

**Action:** Test with intentionally messy token (price feed flaky, new pool, etc.)

**Expected Behavior:**
- ✅ `crashed_token` exit only when:
  - `priceRatio > 15` OR
  - `priceRatio > 10` AND `priceDropFromEntryPct > 90%`
- ✅ `tiny_entry_tp` only when:
  - `mode === 'tiny_entry'` (actual probe trades)
- ✅ These paths do NOT trigger for normal 1 SOL entries with good liquidity

**Check:**
```bash
pm2 logs alpha-snipes-paper --lines 200 | grep -E "\[EXIT\].*crashed_token|\[EXIT\].*tiny_entry"
```

**Should NOT See:**
- `crashed_token` for normal 1 SOL entries with valid prices
- `tiny_entry_tp` for `mode=normal` positions

### 5. Liquidity Drop

**Action:** Test with rug-ish tokens or simulate pool removal

**Expected Logs:**
```bash
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[EXIT\].*liquidity_drop"
```

**Expected:**
- `[EXIT] Position closed ... | reason=liquidity_drop | pnl=...`

**Expected Telegram Message:**
- ✅ `⚠️ Liquidity drop exit: <Token>`
- ✅ Shows liquidity drop percentage
- ✅ Entry/Exit prices
- ✅ Does NOT claim "Auto-close at +20%" - shows real emergency reason

---

## F. Error & Regression Checks

### 1. Check Old Errors Are Gone

**Action:** Search for previously fixed errors

**Check:**
```bash
pm2 logs alpha-snipes-paper --lines 500 | grep -i "Cannot access 'priceRatio' before initialization"
```

**Expected:** Should return nothing (error fixed)

### 2. Check for New Fatal Errors

**Action:** Search for fatal entry price errors

**Check:**
```bash
pm2 logs alpha-snipes-paper --lines 500 | grep -E "\[ENTRY\]\[PRICE\]\[FATAL\]"
```

**Expected:** Count should be 0 during normal operation (position creation aborted cleanly if price cannot be determined)

### 3. Check Exit Error Handling

**Action:** Monitor for "crashed exit failed" messages

**Check:**
```bash
pm2 logs alpha-snipes-paper --lines 500 | grep -E "crashed exit failed|exit failed"
```

**Expected:**
- ✅ Messages are rare and only during real network/Jupiter issues
- ✅ Code retries N times (exponential backoff)
- ✅ Position eventually closed cleanly OR marked as failed + alert sent
- ✅ No infinite retry loops

### 4. Check for Zero Entry Prices

**Action:** Search for any remaining zero entry price issues

**Check:**
```bash
pm2 logs alpha-snipes-paper --lines 500 | grep -E "Entry: 0 SOL|entryPrice.*0[^0-9]|entryPrice=0"
```

**Expected:** Should return nothing (all entry prices calculated from swap amounts)

---

## Quick Verification Commands

Run these commands to quickly verify bot health:

```bash
# 1. Check config on startup
pm2 logs alpha-snipes-paper --lines 50 | grep -E "\[CONFIG\]|Bot Started"

# 2. Check recent entries
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[ENTRY\]\[OPEN\]|\[ENTRY\]\[ALPHA\]|\[ENTRY\]\[WATCHLIST\]|\[ENTRY\]\[FORCE\]"

# 3. Check entry prices (should all be non-zero)
pm2 logs alpha-snipes-paper --lines 200 | grep -E "\[ENTRY\]\[PRICE\]|entryPrice=" | tail -20

# 4. Check exits
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[EXIT\].*Position closed|\[EXIT\].*hard_profit_20pct"

# 5. Check for errors
pm2 logs alpha-snipes-paper --lines 500 | grep -E "\[ENTRY\]\[PRICE\]\[FATAL\]|Cannot access|Entry: 0 SOL"

# 6. Check liquidity triangulation
pm2 logs alpha-snipes-paper --lines 100 | grep -E "\[LIQ\]\[TRIANGULATE\]|\[LIQ\] Triangulated"
```

---

## Automated Verification Script

See `tools/verify_bot.sh` for an automated verification script that runs all these checks.

