# 🎯 Alpha Snipes Bot

**Solana copy-trading bot with advanced rug detection and priority execution**

Automatically copy trades from successful "alpha wallets" with built-in safety checks, priority fees for faster execution, and intelligent exit management.

---

## ✨ Features

### 🔍 Smart Trade Detection + Alpha Verifier
- Real-time monitoring of alpha wallet transactions
- **NEW: Alpha Verifier** - Auto-score and promote candidate wallets
- **NEW: Telegram commands** - Add/remove alphas on the fly
- Automatic extraction of new token mints
- Dynamic alpha management (no bot restart needed)

### 🛡️ Comprehensive Rug Checks
- ✅ Mint authority revoked verification
- ✅ Freeze authority revoked verification
- ✅ Transfer tax detection (buy vs sell quote comparison)
- ✅ Route validation (ensures liquidity exists)
- ✅ Price impact analysis

### ⚡ Priority Execution (Jito-lite)
- Configurable compute unit price for transaction priority
- Adjustable compute unit limits
- Faster fills during high-demand periods

### 🛡️ Post-Buy Sentry System
- Monitors positions for first 2 minutes after entry
- Emergency exit on rapid drawdown (default: -22%)
- Protects against immediate dumps

### 📈 Intelligent Exit Management
- **Early Take-Profit**: Sells at configurable profit target (default: 30%)
- **Trailing Stop**: Protects profits with dynamic stop-loss (default: 20% from high)
- Automatic position tracking and monitoring

### 📱 Live Telegram Alerts
- Real-time notifications for all bot actions
- Transaction links to Solscan
- PnL reporting on exits
- Detailed error messages

---

## 🚀 Quick Start

### 📄 Paper Mode (Recommended First!)

**Test with ZERO RISK before using real money!**

```bash
# 1. Install
npm install

# 2. Configure (NO wallet key needed!)
cp env.template .env
nano .env  # Set ALPHA_WALLET only

# 3. Run
npm start
```

See **[PAPER_MODE.md](PAPER_MODE.md)** for the complete guide.

### 💰 Live Mode (After Paper Testing)

See **[QUICKSTART.md](QUICKSTART.md)** for the fastest path to live trading.

```bash
# 1. Fix npm cache (one-time)
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"

# 2. Install dependencies
npm install

# 3. Configure for LIVE
cp env.template .env
nano .env
# Set TRADE_MODE=live
# Set WALLET_PRIVATE_KEY
# Set ALPHA_WALLET

# 4. Run
npm start
```

---

## 📚 Documentation

### Getting Started
- **[PAPER_MODE.md](PAPER_MODE.md)** - ⭐ Test with zero risk (START HERE!)
- **[QUICKSTART.md](QUICKSTART.md)** - Get running in 5 minutes
- **[INSTALLATION.md](INSTALLATION.md)** - Detailed setup guide
- **[SETUP_INSTRUCTIONS.md](SETUP_INSTRUCTIONS.md)** - Telegram bot setup

### Advanced Features
- **[ALPHA_VERIFIER.md](ALPHA_VERIFIER.md)** - 🔍 Auto-discovery & scoring system
- **[PM2_SETUP.md](PM2_SETUP.md)** - 🔄 Keep bot running 24/7

---

## ⚙️ Configuration

All settings are in `.env`:

### Trading Parameters
```env
BUY_SOL=0.01              # Position size
EARLY_TP_PCT=0.3          # Take profit at +30%
TRAIL_STOP_PCT=0.2        # Trail stop at -20% from high
```

### Safety Settings
```env
REQUIRE_AUTHORITY_REVOKED=true  # Skip tokens with authorities
MAX_TAX_BPS=500                 # Max 5% transfer tax
MAX_PRICE_IMPACT_BPS=3000       # Max 30% price impact
SENTRY_WINDOW_SEC=120           # Monitor for 2 minutes
SENTRY_MAX_DRAWDOWN_PCT=0.22    # Exit at -22% early
```

### Priority Fees
```env
CU_UNIT_PRICE_MICROLAMPORTS=5000  # Priority fee (2k-10k range)
CU_LIMIT=800000                   # Compute unit limit
```

---

## 🎯 How It Works

### 1. Detection Phase
```
Alpha wallet makes trade → Bot detects in 3s → Extracts new tokens
```

### 2. Safety Phase
```
Check mint authority → Check freeze authority → 
Test buy route → Test sell route → Calculate tax
```

### 3. Execution Phase
```
Rug checks pass → Execute buy with priority fee → 
Send Telegram alert → Start monitoring
```

### 4. Monitoring Phase
```
Sentry: Watch for -22% drawdown (first 2 min)
Exit Manager: Track for 30% TP or 20% trailing stop
```

### 5. Exit Phase
```
Target hit → Execute sell → Report PnL → Close position
```

---

## 📊 Example Telegram Flow

```
👀 Alpha touched new mint ABC123...
   TX: def456...

✅ Bought 0.01 SOL of ABC123... (checks passed)
   TX: https://solscan.io/tx/ghi789...
   Ref price ~ 0.0000012345 SOL/token

🛡️ Sentry monitoring ABC123... for 120s...

🎯 Early TP hit for ABC123...: 0.0000016049 SOL
   Switching to trailing stop...

🛑 Trailing stop exit: ABC123...
   Price: 0.0000014800 SOL
   PnL: +19.8%
   TX: https://solscan.io/tx/jkl012...
```

---

## 🔧 Tuning Guide

### For Faster Fills (High Competition)
```env
CU_UNIT_PRICE_MICROLAMPORTS=10000
CU_LIMIT=1000000
```

### For Safer Entries
```env
MAX_TAX_BPS=300
MAX_PRICE_IMPACT_BPS=2000
SENTRY_MAX_DRAWDOWN_PCT=0.15
```

### For Larger Positions
```env
BUY_SOL=0.05
MAX_PRICE_IMPACT_BPS=5000
```

### For Aggressive Exits
```env
EARLY_TP_PCT=0.5          # 50% profit target
TRAIL_STOP_PCT=0.15       # Tighter stop
```

---

## 🏗️ Architecture

```
index.ts              Main bot orchestration
├── lib/
│   ├── rug_checks.ts   Safety validation via Jupiter API
│   └── priority.ts     Priority fee helpers
├── .env              Configuration
└── test_telegram.ts  Telegram connectivity test
```

### Tech Stack
- **Runtime**: Node.js with TypeScript (tsx)
- **Blockchain**: @solana/web3.js, @solana/spl-token
- **Swaps**: Jupiter V6 Quote & Swap API
- **Alerts**: Telegram Bot API
- **Encoding**: bs58

---

## 🎓 Understanding the Checks

### Mint Authority Check
Verifies the token creator cannot mint unlimited supply (dilute holders).

### Freeze Authority Check
Ensures the creator cannot freeze token accounts (honeypot prevention).

### Tax Check
Compares buy → sell quotes to detect hidden transfer taxes.

### Route Validation
Confirms liquidity exists for both buying and selling.

### Price Impact
Ensures your trade size won't cause excessive slippage.

---

## 💡 Best Practices

### 1. Start Small
Begin with `BUY_SOL=0.001` to test the system.

### 2. Use Premium RPC
Free Solana RPC is rate-limited. Consider:
- [Helius](https://helius.dev) - 100 req/s free tier
- [QuickNode](https://quicknode.com) - Premium endpoints
- [Triton](https://triton.one) - High-performance

### 3. Monitor First Trades
Watch closely for the first 5-10 trades to ensure correct behavior.

### 4. Adjust Priority Fees
Increase `CU_UNIT_PRICE_MICROLAMPORTS` during high-volume periods.

### 5. Run in Background
Use PM2 or screen/tmux for persistent operation:
```bash
npm install -g pm2
pm2 start "npm start" --name alpha-snipes
```

### 6. Secure Your Keys
- Never commit `.env` to version control (already in `.gitignore`)
- Use a dedicated wallet for the bot
- Keep only necessary funds in the wallet

---

## ⚠️ Risks & Disclaimers

**This bot is for educational purposes. Trading carries significant risk.**

- **Loss of Funds**: You can lose your entire investment
- **Smart Contract Risk**: Tokens may have hidden vulnerabilities
- **Rug Pulls**: Safety checks reduce but don't eliminate risk
- **Impermanent Loss**: Volatile tokens can lose value quickly
- **Gas Costs**: Priority fees add to transaction costs
- **RPC Reliability**: Downtime can cause missed trades

**Use at your own risk. Start with small amounts you can afford to lose.**

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| NPM install fails | Run `sudo chown -R $(id -u):$(id -g) "$HOME/.npm"` |
| Invalid private key | Use base58 format from Phantom export |
| No trades detected | Verify alpha wallet is active |
| RPC errors | Switch to premium RPC provider |
| High gas costs | Reduce `CU_UNIT_PRICE_MICROLAMPORTS` |
| Too many rug checks fail | Increase `MAX_TAX_BPS` or `MAX_PRICE_IMPACT_BPS` |

See **[INSTALLATION.md](INSTALLATION.md)** for detailed troubleshooting.

---

## 🚧 Roadmap / Future Enhancements

### Pool-Specific Checks
- Raydium LP burn/lock verification
- Orca Whirlpool liquidity analysis
- Meteora pool validation

### Advanced Execution
- True Jito relayer integration (private mempool)
- Multi-DEX routing
- Sandwich attack protection

### Position Management
- Partial profit-taking (scale out)
- Average down on dips
- Multi-token portfolio tracking

### Analytics
- SQLite/Firestore trade logging
- PnL dashboard
- Win rate statistics

### Multi-Alpha
- Watch multiple wallets with confidence scoring
- Consensus-based entry (2+ alphas touch token)
- Staggered entry sizes

---

## 📞 Support

If you encounter issues:

1. Check console output for error details
2. Verify `.env` configuration
3. Test Telegram: `npm run test:telegram`
4. Ensure wallet has sufficient SOL balance
5. Try a premium RPC endpoint

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🙏 Acknowledgments

- [Solana](https://solana.com) - Blockchain platform
- [Jupiter](https://jup.ag) - DEX aggregator
- [Telegram](https://telegram.org) - Notifications

---

**Built with 💎 for the Solana sniper community**

⚡ **Fast. Safe. Automated.** ⚡

