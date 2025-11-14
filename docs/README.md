# 📚 Alpha Snipes Documentation

Welcome to the Alpha Snipes documentation hub. Everything you need to run, configure, and understand the bot.

## 🎯 What is Alpha Snipes?

Alpha Snipes is an **enterprise-grade Solana copy-trading bot** that automatically mirrors trades from successful "alpha wallets" with comprehensive safety checks, intelligent exit strategies, and full operational monitoring.

### Key Capabilities

- **🔍 Alpha Tracking**: Monitor multiple wallets with auto-scoring and promotion
- **🛡️ Safety First**: Rug checks (authorities, taxes, liquidity) before every trade
- **📈 Smart Exits**: Early TP, partial profit-taking, trailing stops
- **💰 Full Analytics**: Trade ledger, realized/unrealized PnL, win rate tracking
- **📡 Health Monitoring**: Heartbeat, market pulse, silent watchdog
- **💬 Pro Telegram UX**: Inline buttons, USD equivalents, human-friendly messages
- **🔄 API Resilience**: Rate limiting, failure cooldowns, multi-endpoint fallback

### Modes

- **📄 Paper Mode** (default): Risk-free simulation using live quotes
- **💰 Live Mode**: Real on-chain trading with your wallet

---

## 🚀 Getting Started

### For Operators (Traders)

**Start here:** [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md)

- Setup and configuration
- Running in paper mode
- Understanding Telegram commands
- Monitoring bot health
- Going live safely

### For Deployment

**VPS/Cloud setup:** [ORACLE_DEPLOY.md](ORACLE_DEPLOY.md)

- Oracle Cloud Free Tier walkthrough
- PM2 setup for 24/7 uptime
- Security and SSH hardening

### For Developers

**Technical deep-dive:** [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)

- Architecture and data flows
- Error handling strategies
- Adding custom logic
- Testing utilities

---

## 📖 Documentation Index

| Guide | Purpose |
|-------|---------|
| [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md) | Setup, run, and operate the bot |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | Architecture and code internals |
| [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md) | Complete `.env` variable reference |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and solutions |
| [ORACLE_DEPLOY.md](ORACLE_DEPLOY.md) | Deploy to Oracle Cloud Free Tier |
| [CHANGELOG.md](CHANGELOG.md) | Version history and updates |
| [SECURITY_NOTES.md](SECURITY_NOTES.md) | Wallet safety and risk disclosure |

---

## 🎁 What's New

See [CHANGELOG.md](CHANGELOG.md) for the latest features and improvements.

**Recent highlights:**
- ✅ Partial Take-Profit (configurable splits at Early TP)
- ✅ Trade Ledger (persistent JSONL storage)
- ✅ Heartbeat & Watchdog (automated health monitoring)
- ✅ Inline Telegram Buttons (one-tap Solscan links)
- ✅ Failure Cooldowns (429/400 backoff for stability)

---

## 🆘 Need Help?

1. **Common issues?** → [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. **Configuration questions?** → [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md)
3. **How to operate?** → [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md)
4. **Technical deep-dive?** → [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)

---

## 🚀 Quick Links for Operators

```bash
# Test in paper mode (zero risk)
./docs/OPERATOR_GUIDE.md → Section: Paper Mode Setup

# Deploy to VPS
./docs/ORACLE_DEPLOY.md

# Understand all settings
./docs/CONFIG_REFERENCE.md

# Bot not working?
./docs/TROUBLESHOOTING.md
```

---

**Built with 💎 for the Solana alpha trading community**

⚡ **Fast. Safe. Automated.** ⚡




