# ⚙️ Configuration Reference

Complete guide to all environment variables in `.env`.

---

## 📋 Environment Variable Reference

### Core Settings

| Variable | Purpose | Type/Range | Default | Example |
|----------|---------|------------|---------|---------|
| `TRADE_MODE` | Trading mode | `paper` \| `live` | `paper` | `live` |
| `SOLANA_RPC_URL` | Solana RPC endpoint | URL | Public RPC | `https://mainnet.helius-rpc.com/?api-key=xxx` |
| `WALLET_PRIVATE_KEY` | Bot wallet key (live only) | Base58 string | (none) | `5J7Wn...` |

**Operational Guidance:**
- Always start with `TRADE_MODE=paper` to test
- Use premium RPC (Helius/QuickNode) for reliability
- Never commit `WALLET_PRIVATE_KEY` to git

---

### Telegram Configuration

| Variable | Purpose | Type/Range | Default | Example |
|----------|---------|------------|---------|---------|
| `TELEGRAM_TOKEN` | Bot API token | String | (required) | `7942901226:AAEvyak...` |
| `TELEGRAM_CHAT_ID` | Channel/group ID for alerts | Number/String | (required) | `-1003291954761` |
| `COMMAND_CHAT_ID` | DM chat for commands | Number/String | Same as `TELEGRAM_CHAT_ID` | `123456789` |
| `ADMIN_USER_ID` | Your Telegram user ID | Number | (required) | `987654321` |

**Operational Guidance:**
- Get IDs from bot with `/getUpdates` API after sending "hi"
- Set `ADMIN_USER_ID` to restrict commands to yourself only
- Use separate channel for alerts vs DM for commands

---

### Alpha Wallet Management

| Variable | Purpose | Type/Range | Default | Example |
|----------|---------|------------|---------|---------|
| `ALPHA_WALLET` | Legacy alpha wallet (auto-added on start) | Solana address | (none) | `8zkJmeQS1J3GUk...` |

**Operational Guidance:**
- Use `/add <wallet>` for dynamic alpha management instead
- This is auto-added to active list if registry is empty
- Better to use Alpha Verifier commands (`/add`, `/addactive`)

---

### Trade Parameters

| Variable | Purpose | Type/Range | Default | Example |
|----------|---------|------------|---------|---------|
| `BUY_SOL` | Position size per trade | Number (SOL) | `0.01` | `0.02` |
| `EARLY_TP_PCT` | Early take-profit trigger | 0.0-1.0 (decimal) | `0.3` (30%) | `0.5` (50%) |
| `TRAIL_STOP_PCT` | Trailing stop offset from high | 0.0-1.0 (decimal) | `0.2` (20%) | `0.15` (15%) |
| `PARTIAL_TP_PCT` | Fraction to sell at Early TP | 0.0-1.0 (decimal) | `0` (disabled) | `0.5` (50%) |

**Operational Guidance:**
- Start with `BUY_SOL=0.001` in paper mode
- `EARLY_TP_PCT=0.3` = exit at +30% gain
- `TRAIL_STOP_PCT=0.2` = exit if price drops 20% from peak
- `PARTIAL_TP_PCT=0.5` locks 50% profit at Early TP, trails with 50%
- Higher `EARLY_TP_PCT` = wait for bigger gains (riskier)
- Lower `TRAIL_STOP_PCT` = tighter stop (less drawdown)

---

### Priority Fees (Jito-lite)

| Variable | Purpose | Type/Range | Default | Example |
|----------|---------|------------|---------|---------|
| `CU_UNIT_PRICE_MICROLAMPORTS` | Priority fee per compute unit | Number (μLamports) | `5000` | `10000` |
| `CU_LIMIT` | Max compute units | Number | `800000` | `1000000` |

**Operational Guidance:**
- Higher `CU_UNIT_PRICE` = faster fills, higher cost
- Typical range: 2,000-10,000 microLamports
- Cost per tx ≈ `(CU_UNIT_PRICE × CU_LIMIT) / 1,000,000` lamports
- Example: 5000 × 800000 / 1M = 4000 lamports = 0.000004 SOL (~$0.001)

---

### Safety & Rug Checks

| Variable | Purpose | Type/Range | Default | Example |
|----------|---------|------------|---------|---------|
| `REQUIRE_AUTHORITY_REVOKED` | Skip if mint/freeze auth active | `true` \| `false` | `true` | `false` |
| `MAX_TAX_BPS` | Max transfer tax (basis points) | Number (bps) | `500` (5%) | `1000` (10%) |
| `MAX_PRICE_IMPACT_BPS` | Max price impact for trade size | Number (bps) | `3000` (30%) | `5000` (50%) |
| `SENTRY_WINDOW_SEC` | Post-buy monitoring window | Number (seconds) | `120` (2 min) | `180` (3 min) |
| `SENTRY_MAX_DRAWDOWN_PCT` | Emergency exit threshold | 0.0-1.0 (decimal) | `0.22` (22%) | `0.15` (15%) |

**Operational Guidance:**
- `REQUIRE_AUTHORITY_REVOKED=true` is safer but skips more tokens
- Basis points: 100 bps = 1%, 500 bps = 5%, 1000 bps = 10%
- Higher `MAX_PRICE_IMPACT_BPS` allows less liquid tokens (riskier)
- Sentry exits fast if price drops quickly after entry
- Tighter `SENTRY_MAX_DRAWDOWN_PCT` = more protective, more early exits

---

### Monitoring & Heartbeat

| Variable | Purpose | Type/Range | Default | Example |
|----------|---------|------------|---------|---------|
| `HEARTBEAT_EVERY_MIN` | Heartbeat interval (minutes) | Number (0=disable) | `15` | `5` |
| `SILENT_ALERT_MIN` | Alert threshold (no signals) | Number (minutes) | `60` | `30` |
| `PULSE_MAX_ROWS` | Events shown in heartbeat | Number | `5` | `10` |

**Operational Guidance:**
- `HEARTBEAT_EVERY_MIN=0` disables periodic heartbeat (`/status` still works)
- `HEARTBEAT_EVERY_MIN=5` for more frequent updates (more Telegram messages)
- `SILENT_ALERT_MIN=30` for earlier warning of inactivity
- `PULSE_MAX_ROWS=10` shows more event history (longer messages)

---

### Networking & API

| Variable | Purpose | Type/Range | Default | Example |
|----------|---------|------------|---------|---------|
| `DNS_OVERRIDE` | Force specific DNS servers | CSV of IPs | (system default) | `1.1.1.1,1.0.0.1,8.8.8.8` |
| `JUP_QUOTE_BASE` | Jupiter quote endpoint | URL | `https://lite-api.jup.ag/swap/v1/quote` | `https://quote-api.jup.ag/v6/quote` |
| `JUP_SWAP_BASE` | Jupiter swap endpoint | URL | `https://lite-api.jup.ag/swap/v1/swap` | `https://quote-api.jup.ag/v6/swap` |

**Operational Guidance:**
- `DNS_OVERRIDE` with Cloudflare (1.1.1.1) + Google (8.8.8.8) improves stability
- Default Jupiter endpoints are `lite-api.jup.ag` (newest, fastest)
- Fallback endpoints (`quote-api`, `quoting`) used automatically if primary fails
- Only override if you have custom Jupiter proxy or specific requirements

---

### Debug & Diagnostics

| Variable | Purpose | Type/Range | Default | Example |
|----------|---------|------------|---------|---------|
| `DEBUG_TX` | Log why transactions are skipped | `true` \| `false` | `false` | `true` |
| `DEBUG_TO_TELEGRAM` | Echo debug logs to Telegram DM | `true` \| `false` | `false` | `true` |
| `DEBUG_QUOTE` | Log Jupiter quote attempts | `1` \| (unset) | (unset) | `1` |

**Operational Guidance:**
- `DEBUG_TX=true` helpful for understanding skip reasons
- `DEBUG_TO_TELEGRAM=true` useful during troubleshooting (can be spammy)
- `DEBUG_QUOTE=1` shows all Jupiter API attempts (very verbose)
- Disable debug flags in production for cleaner logs

---

## 🎯 Configuration Examples

### Conservative (Low Risk)

```env
TRADE_MODE=paper
BUY_SOL=0.005
EARLY_TP_PCT=0.2                    # TP at +20%
TRAIL_STOP_PCT=0.15                 # Stop at -15%
PARTIAL_TP_PCT=0.5                  # Lock 50% at TP
REQUIRE_AUTHORITY_REVOKED=true
MAX_TAX_BPS=300                     # Max 3% tax
MAX_PRICE_IMPACT_BPS=2000           # Max 20% impact
SENTRY_MAX_DRAWDOWN_PCT=0.15        # Exit at -15% early
```

### Aggressive (High Risk/Reward)

```env
TRADE_MODE=live
BUY_SOL=0.05
EARLY_TP_PCT=0.5                    # TP at +50%
TRAIL_STOP_PCT=0.25                 # Wider stop
PARTIAL_TP_PCT=0                    # No partial (full size trails)
REQUIRE_AUTHORITY_REVOKED=false     # Allow risky tokens
MAX_TAX_BPS=1000                    # Allow 10% tax
MAX_PRICE_IMPACT_BPS=5000           # Allow 50% impact
SENTRY_MAX_DRAWDOWN_PCT=0.30        # Tolerate -30% early
```

### Balanced (Recommended)

```env
TRADE_MODE=paper                    # Test first!
BUY_SOL=0.01
EARLY_TP_PCT=0.3                    # TP at +30%
TRAIL_STOP_PCT=0.2                  # Stop at -20%
PARTIAL_TP_PCT=0                    # Start without partial
REQUIRE_AUTHORITY_REVOKED=true
MAX_TAX_BPS=500                     # Max 5% tax
MAX_PRICE_IMPACT_BPS=3000           # Max 30% impact
SENTRY_MAX_DRAWDOWN_PCT=0.22        # Exit at -22% early
HEARTBEAT_EVERY_MIN=15
SILENT_ALERT_MIN=60
```

---

## 🔄 Applying Configuration Changes

**After editing `.env`:**

```bash
# If using PM2
pm2 restart alpha-snipes-paper --update-env

# Verify changes took effect
pm2 logs alpha-snipes-paper --lines 30 --nostream | grep "Buy size\|Early TP\|Trailing"
```

**Check startup banner for:**
```
💰 Buy size: 0.01 SOL
🎯 Early TP: 30%
🛑 Trailing stop: 20%
```

---

## 🎓 Understanding Trade-offs

### Position Size vs Liquidity

- **Smaller size** (`BUY_SOL=0.001-0.01`): Works on most tokens, less impact
- **Larger size** (`BUY_SOL=0.05-0.1`): Needs liquid tokens, increase `MAX_PRICE_IMPACT_BPS`

### Profit Target vs Win Rate

- **Lower TP** (`EARLY_TP_PCT=0.2`): More wins, smaller gains
- **Higher TP** (`EARLY_TP_PCT=0.5`): Fewer wins, bigger gains

### Stop Loss vs Drawdown

- **Tighter stop** (`TRAIL_STOP_PCT=0.1`): Less drawdown, more stopped out
- **Wider stop** (`TRAIL_STOP_PCT=0.3`): More drawdown, less whipsaw

### Partial TP vs Full Position

- **Partial** (`PARTIAL_TP_PCT=0.5`): Lock profits early, less upside
- **Full trail** (`PARTIAL_TP_PCT=0`): Maximum upside, risk giveback

### Safety vs Frequency

- **Strict** (`REQUIRE_AUTHORITY_REVOKED=true`, `MAX_TAX_BPS=300`): Safer, fewer trades
- **Relaxed** (`REQUIRE_AUTHORITY_REVOKED=false`, `MAX_TAX_BPS=1000`): Riskier, more trades

---

## 📊 Rate Limiting (Hardcoded)

The bot has built-in rate limiting for API stability:

- **Global**: 5 calls/sec
- **Per-mint**: 3 second cooldown
- **429 (rate limit)**: 20 second backoff
- **400 (bad request)**: 60 second backoff

These are **not configurable** and optimized for reliability.

**Why:**
- Prevents overwhelming Jupiter API
- Automatic recovery from errors
- Protects against cascading failures

**What you'll see:**
```
[PAPER][DBG] quote skipped (rate-limit)
[DBG][QUOTE] skip cooldown <mint> until <time>
```

This is **normal and healthy** behavior!

---

## 🔍 Alpha Verifier Settings (Hardcoded)

| Setting | Value | Purpose |
|---------|-------|---------|
| `PROMOTION_THRESHOLD` | 2 signals | Candidate → Active after N first-touches |
| `PROMOTION_WINDOW_MS` | 24 hours | Only count signals in last 24h |

**Managed via Telegram commands:**
- `/add <wallet>` - Add as candidate (auto-promotion)
- `/addactive <wallet>` - Add directly to active
- `/promote <wallet>` - Manual promotion

---

## 📝 Template File

See `env.template` in project root for a complete template with all variables and comments.

```bash
# View template
cat env.template

# Copy to .env
cp env.template .env

# Edit
nano .env
```

---

## 🔧 Common Configuration Patterns

### Testing New Alpha Wallet

```env
# Use /add command in Telegram instead:
/add 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
# Bot will monitor and auto-promote after 2 signals in 24h
```

### Enabling All Debug Output

```env
DEBUG_TX=true
DEBUG_TO_TELEGRAM=false   # Keep false to avoid spam
DEBUG_QUOTE=1
```

### Maximum Safety (Paper Testing)

```env
TRADE_MODE=paper
REQUIRE_AUTHORITY_REVOKED=true
MAX_TAX_BPS=300
MAX_PRICE_IMPACT_BPS=2000
SENTRY_MAX_DRAWDOWN_PCT=0.15
PARTIAL_TP_PCT=0.5
```

### Maximum Monitoring

```env
HEARTBEAT_EVERY_MIN=5
SILENT_ALERT_MIN=30
PULSE_MAX_ROWS=10
DEBUG_TX=true
```

---

## ⚠️ Important Notes

### Never Set These

**Do NOT configure:**
- API rate limits (hardcoded for stability)
- Quote retry logic (automatic)
- Cooldown timers (optimized)

### Restart Required

**After changing `.env`:**
```bash
pm2 restart alpha-snipes-paper --update-env
```

### Verify Changes

**Check startup banner:**
```bash
pm2 logs alpha-snipes-paper --lines 40 --nostream | grep "Buy size\|Early TP\|JUP_QUOTE"
```

---

## 📖 See Also

- [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md) - How to use these settings
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Fix configuration issues
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - Technical details

---

**Configuration is key to performance. Start conservative, tune based on results!** 🎯




