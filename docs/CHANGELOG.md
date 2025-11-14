# 📋 Changelog

All notable changes and updates to Alpha Snipes.

---

## [Consolidation Release] - 2025-11-11

### 🎉 Major Features

#### Trade Management
- **Partial Take-Profit**: Configurable `PARTIAL_TP_PCT` to lock profits early while trailing remainder
- **Unrealized PnL Tracking**: `/open` command shows open positions with live P&L
- **Realized PnL Reports**: `/pnl`, `/pnl 24h`, `/pnl today` commands for performance analysis
- **Trade Ledger**: Persistent JSONL storage (`data/trades.jsonl`) for all trades
- **Alpha Attribution**: Track which alpha wallet generated each trade

#### Monitoring & Health
- **Heartbeat System**: Periodic status updates every 15 minutes (configurable)
- **Market Pulse**: Recent event history in heartbeat (touches, buys, exits, skips)
- **Silent Watchdog**: Alert when no signals detected for 60+ minutes
- **Daily Recap**: Midnight summary of previous day's performance
- **On-Demand Status**: `/status` command for immediate health check

#### User Experience
- **Inline Telegram Buttons**: One-tap Solscan links for mint, alpha, TX
- **USD Equivalents**: Show dollar values for all trades and PnL
- **Human-Readable Explanations**: Skip reasons with plain English descriptions
- **Better Formatting**: Consistent number formatting (SOL, USD, addresses)
- **Force Exit Command**: `/force_exit <mint>` for testing (paper mode)

#### API Resilience
- **Centralized Jupiter Endpoints**: `lib/jupiter_endpoints.ts` prevents URL fragmentation
- **Multi-Endpoint Fallback**: `lite-api.jup.ag` → `quote-api.jup.ag` → `quoting.jup.ag`
- **Failure-Specific Cooldowns**:
  - 429 (rate limit): 20-second backoff
  - 400 (bad request): 60-second backoff
- **Tuned Rate Limiting**:
  - Global: 5 calls/sec (down from 6)
  - Per-key: 3s cooldown (up from 2.2s)
- **DNS Override**: Force Cloudflare/Google DNS for stability
- **Price Validation**: Prevent zero/NaN entry prices breaking PnL calculations

#### Safety & Data Integrity
- **Duplicate Buy Suppression**: Per-mint cooldown (60s) for paper trades
- **Alpha Registry Hardening**: Atomic writes, deduplication, self-healing
- **RPC Fallbacks**: 3-layer transaction fetcher (getParsedTransaction → getTransaction → raw JSON-RPC)
- **URL Sanitization**: Prevent invalid Jupiter base URLs

---

### 🛠️ Technical Improvements

#### Architecture
- **TypeScript Configuration**: Modern `tsconfig.json` for Node 20, ES2022, strict mode
- **ESM Compliance**: Full ES module support with proper type imports
- **Event Tracking**: In-memory buffer of recent bot activities
- **Position State Enhancement**: Track entry time, alpha wallet, exit phase per position

#### Code Quality
- **Structured Error Handling**: `{ ok, data, error }` pattern throughout
- **Type Safety**: Type-only imports for `ParsedTransactionWithMeta`
- **Defensive Programming**: Null checks, validation, graceful degradation
- **Consistent Logging**: Structured tags `[PAPER]`, `[DBG]`, `[QUOTE]`, etc.

#### Developer Experience
- **Comprehensive Documentation**: Organized `/docs` folder with 8 guides
- **Smoke Test Utility**: `tools/quote_smoke.ts` for API verification
- **Registry Cleanup Tool**: `tools/dedupe_registry.ts` for state repair
- **Debug Flags**: `DEBUG_TX`, `DEBUG_QUOTE`, `DEBUG_TO_TELEGRAM`

---

### 📚 Documentation Overhaul

#### New Documentation Structure
Created `/docs` folder with:
- **README.md**: Landing page and navigation
- **OPERATOR_GUIDE.md**: Complete operator manual (setup, commands, best practices)
- **DEVELOPER_GUIDE.md**: Architecture, data flows, extending the bot
- **CONFIG_REFERENCE.md**: All environment variables explained
- **TROUBLESHOOTING.md**: Common issues and solutions
- **ORACLE_DEPLOY.md**: VPS deployment guide
- **CHANGELOG.md**: This file
- **SECURITY_NOTES.md**: Wallet safety and risk disclosure

#### Deprecated Scatter Docs
Added migration banners to:
- `PAPER_MODE.md`
- `EXITS_AND_STABILITY_UPGRADE.md`
- `RATE_LIMIT_SUMMARY.md`
- `RATE_LIMIT_TUNING.md`
- `SOL_PRICE_UTILITY.md`
- `FORMAT_UTILITIES.md`
- `PNL_LEDGER_AND_TELEGRAM_UPGRADE.md`
- `TELEGRAM_HTML_FORMATTING.md`

Content consolidated into organized `/docs` guides.

---

### 🐛 Bug Fixes

#### Critical Fixes
- **Invalid Entry Price**: Skip TP/TSL if entry price is 0 or NaN
- **RPC `costUnits=null` Error**: Multi-layered transaction fetcher with fallbacks
- **Duplicate Paper Buys**: Idempotency check with 60s cooldown
- **Invalid URL Errors**: Sanitize Jupiter base URLs before use
- **DNS Resolution Failures**: Override with reliable resolvers
- **HTML Parse Errors**: Escape dynamic content in Telegram messages

#### Minor Fixes
- **Alpha Registry Duplicates**: Self-healing on every read
- **Promotion Spam**: Debounce with `lastPromotedAt` timestamp
- **SOL Price Validation**: Robust outAmount parsing with fallbacks
- **Ledger Persistence**: Ensure `data/` folder exists before writing
- **Event Buffer Overflow**: Cap `RECENT[]` at 50 entries

---

### ⚙️ Configuration Changes

#### New Environment Variables
```env
# Partial profit-taking
PARTIAL_TP_PCT=0.5            # Sell 50% at Early TP

# Monitoring
HEARTBEAT_EVERY_MIN=15        # Heartbeat interval (0=disable)
SILENT_ALERT_MIN=60           # Alert after N min of no signals
PULSE_MAX_ROWS=5              # Events shown in heartbeat

# Networking (optional hardening)
DNS_OVERRIDE=1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4
JUP_QUOTE_BASE=https://lite-api.jup.ag/swap/v1/quote
JUP_SWAP_BASE=https://lite-api.jup.ag/swap/v1/swap
```

#### Changed Defaults
- Jupiter endpoints: `lite-api.jup.ag` (was `quote-api.jup.ag`)
- Rate limit: 5 calls/sec global (was 6)
- Per-key cooldown: 3s (was 2.2s)

---

### 🎯 Commands Added

| Command | Description |
|---------|-------------|
| `/pnl` | Show all-time realized PnL |
| `/pnl 24h` | Show last 24 hours PnL |
| `/pnl today` | Show today's PnL (since midnight) |
| `/open` | Show open positions with unrealized PnL |
| `/status` or `/health` | Show bot health and recent activity |
| `/force_exit <mint>` | Manually close position (paper mode only) |
| `/debug` | Show/toggle debug flags |

---

### 📊 Performance Improvements

- **Quote Latency**: Multi-endpoint fallback reduces failed requests
- **Rate Limit Stability**: Conservative limits prevent 429 cascades
- **DNS Resolution**: Faster, more reliable with override
- **Memory Usage**: Event buffer cap prevents unbounded growth
- **Ledger Write**: Append-only JSONL is fast and crash-resistant

---

### 🔒 Security Enhancements

- **Wallet Key Isolation**: Clear separation of paper vs live mode requirements
- **Admin-Only Commands**: All bot commands restricted to `ADMIN_USER_ID`
- **No Key Logging**: Defensive checks prevent accidental key disclosure
- **Atomic State Writes**: Alpha registry uses temp file + rename pattern

---

### 🧪 Testing Enhancements

- **Smoke Test**: `tools/quote_smoke.ts` validates API connectivity
- **Paper Mode Improvements**: Better simulation accuracy, more realistic alerts
- **Debug Output**: Comprehensive logging for troubleshooting
- **Registry Cleanup**: `tools/dedupe_registry.ts` for state repair

---

## [Initial Release] - 2025-11-01

### Core Features

- **Alpha Wallet Tracking**: Monitor and copy trades from successful wallets
- **Rug Check System**: Validate mint authority, freeze authority, taxes
- **Jupiter Integration**: V6 API for quotes and swaps
- **Paper Mode**: Risk-free simulation with live quotes
- **Exit Management**: Early TP + trailing stop strategy
- **Sentry System**: Post-buy monitoring with rapid drawdown protection
- **Telegram Alerts**: Real-time notifications with HTML formatting
- **Alpha Verifier**: Auto-scoring and promotion of candidate wallets
- **PM2 Integration**: 24/7 operation with auto-restart

### Technical Foundation

- **TypeScript + Node.js 20**: Modern stack with ES modules
- **Solana Web3.js**: Blockchain interaction
- **SPL Token**: Token account management
- **Priority Fees**: Jito-lite for faster fills
- **Environment Config**: `.env` file for all settings

---

## Future Roadmap

### Planned Features

- **Oracle Uptime Monitoring**: External health checks and alerts
- **Multi-Wallet Support**: Track performance across multiple bots
- **Web Dashboard**: React-based analytics UI
- **Advanced Filters**: ML-based token screening
- **Backtesting**: Historical performance analysis on ledger data
- **Discord Integration**: Mirror alerts to Discord
- **Advanced Rug Checks**: Liquidity analysis, holder distribution

### Under Consideration

- **Portfolio Rebalancing**: Automated profit compounding
- **Cross-Chain Support**: Ethereum, Base, other EVM chains
- **Social Sentiment**: Twitter/Telegram signal aggregation
- **Risk Scoring**: Dynamic position sizing based on token risk

---

## Version History

| Version | Date | Highlights |
|---------|------|-----------|
| Consolidation Release | 2025-11-11 | Docs overhaul, partial TP, heartbeat, ledger |
| Initial Release | 2025-11-01 | Core trading bot with alpha tracking |

---

## Migration Notes

### From Scattered Docs to `/docs`

**Before Consolidation:**
- 10+ feature-specific MD files in root
- Duplicate content across files
- No clear entry point

**After Consolidation:**
- Organized `/docs` folder with 8 guides
- Single source of truth for each topic
- Clear navigation from `docs/README.md`

**Action Required:**
- Update bookmarks to point to `/docs`
- Use `docs/README.md` as starting point
- Old files have migration banners pointing to new locations

### Configuration Changes

**If upgrading from Initial Release:**

1. **Review new env vars** in [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md):
   - `PARTIAL_TP_PCT` (optional)
   - `HEARTBEAT_EVERY_MIN` (optional)
   - `SILENT_ALERT_MIN` (optional)

2. **Jupiter endpoints** now centralized:
   - Defaults changed to `lite-api.jup.ag`
   - Override with `JUP_QUOTE_BASE` / `JUP_SWAP_BASE` if needed

3. **Restart with `--update-env`**:
   ```bash
   pm2 restart alpha-snipes-paper --update-env
   ```

---

## Contributing

When adding features:
1. Update relevant doc in `/docs`
2. Add entry to `CHANGELOG.md`
3. Update `env.template` if new config added
4. Test in paper mode first
5. Update command list in `OPERATOR_GUIDE.md` if new commands

---

**Stay updated! Check this changelog after pulling latest changes.** 📋✨




