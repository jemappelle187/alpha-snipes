# Alpha Snipes Bot - Installation Guide

## 🛠️ Fix NPM Cache Issue (If Needed)

If you encountered npm errors during installation, run this command to fix permissions:

```bash
sudo chown -R $(id -u):$(id -g) "$HOME/.npm"
```

Then clean install:

```bash
rm -rf node_modules package-lock.json
npm install
```

## 📦 Install Dependencies

```bash
npm install
```

This installs:
- `@solana/web3.js` - Solana blockchain interaction
- `@solana/spl-token` - SPL token operations  
- `bs58` - Base58 encoding for private keys
- `dotenv` - Environment variable management
- `node-fetch` - HTTP requests
- `tsx` - TypeScript execution

## ⚙️ Configure Environment Variables

1. **Copy the template:**
   ```bash
   cp env.template .env
   ```

2. **Edit `.env` with your values:**

```env
# Telegram Bot (Already configured from test)
TELEGRAM_TOKEN=7942901226:AAEvyakUM4kK-rzOhDzAkZxQcZpO1RiE2UQ
TELEGRAM_CHAT_ID=-1003291954761

# === Solana RPC & Wallet ===
# Use a premium RPC for better performance (Helius, QuickNode, Triton)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Your wallet private key in base58 format
# Get this from Phantom: Settings → Show Secret Key (export as base58)
WALLET_PRIVATE_KEY=your_base58_private_key_here

# === Alpha Wallet to Watch ===
# The wallet address you want to copy trades from
ALPHA_WALLET=your_alpha_wallet_address_here

# === Trade Size ===
BUY_SOL=0.01              # Amount of SOL to spend per trade
EARLY_TP_PCT=0.3          # 30% early take-profit target
TRAIL_STOP_PCT=0.2        # 20% trailing stop loss

# === Priority fee (Jito-lite) ===
CU_UNIT_PRICE_MICROLAMPORTS=5000    # ~0.005 SOL per 1M CU (tune 2k–10k)
CU_LIMIT=800000                     # Upper bound on compute units

# === Rug/safety ===
REQUIRE_AUTHORITY_REVOKED=true      # Require mint/freeze authority revoked
MAX_TAX_BPS=500                     # 5% max tax (rough heuristic)
MAX_PRICE_IMPACT_BPS=3000           # 30% max price impact for buy size
SENTRY_WINDOW_SEC=120               # Monitor for 2 minutes after entry
SENTRY_MAX_DRAWDOWN_PCT=0.22        # Exit if -22% from entry during sentry
```

## 🔑 Getting Your Wallet Private Key

### From Phantom Wallet:
1. Open Phantom
2. Click Settings (gear icon)
3. Click "Show Secret Recovery Phrase" or "Export Private Key"
4. Copy the base58 encoded key
5. Paste into `WALLET_PRIVATE_KEY` in `.env`

### From Solana CLI:
```bash
solana-keygen new --outfile ~/my-wallet.json
# Then convert to base58
cat ~/my-wallet.json | jq -r '.' | base58
```

⚠️ **Security Warning:** Never commit `.env` to git or share your private key!

## 🎯 Finding an Alpha Wallet

To find a wallet to copy:
1. Check [Solscan](https://solscan.io) or [DexScreener](https://dexscreener.com)
2. Look for wallets with successful early entries
3. Verify their recent trading activity
4. Copy their address into `ALPHA_WALLET`

## 🧪 Test Before Running

1. **Test Telegram (already done):**
   ```bash
   npm run test:telegram
   ```

2. **Check wallet balance:**
   ```bash
   solana balance $(grep WALLET_PRIVATE_KEY .env | cut -d= -f2)
   ```

3. **Verify configuration:**
   ```bash
   cat .env | grep -v "^#" | grep -v "^$"
   ```

## 🚀 Run the Bot

```bash
npm start
```

Or with auto-reload during development:

```bash
npm run dev
```

## 📊 What to Expect

**Bot Commands in Telegram:**
/status – Check bot heartbeat and current pulse  
/pnl – Show realized profit/loss  
/pnl 24h – Realized PnL (last 24 hours)  
/open – Show unrealized PnL (open positions)

**Console:**
```
🚀 Alpha Snipes Bot Starting...
📍 Wallet: YourWalletPublicKey...
👀 Watching: AlphaWalletAddress...
💰 Buy size: 0.01 SOL
🎯 Early TP: 30%
🛑 Trailing stop: 20%
🛡️ Sentry window: 120s (max DD: 22%)
⚙️  Priority: 5000 microLamports, 800000 CU limit
```

**Telegram Channel:**
```
🚀 Alpha Snipes Bot Started
Wallet: YourWalletPublicKey...
Watching: AlphaWalletAddress...
Buy: 0.01 SOL | TP: 30% | Trail: 20%
Sentry: 120s (DD: 22%)
```

You’ll also now see periodic monitoring messages such as:
💓 Heartbeat — shows system uptime and recent signals  
🤫 Silent alert — notifies if no signals were received for 60+ minutes  

## 🎯 Bot Workflow

1. **Detects Alpha Activity:** Monitors target wallet for new transactions
2. **Extracts New Mints:** Finds tokens the alpha wallet interacted with
3. **Runs Rug Checks:**
   - ✅ Mint authority revoked
   - ✅ Freeze authority revoked
   - ✅ Route exists for buy & sell
   - ✅ Tax/slippage under threshold
4. **Executes Buy:** If checks pass, buys with priority fee
5. **Starts Monitoring:**
   - 🛡️ **Sentry**: Monitors for rapid drawdown (first 2 min)
   - 🎯 **Exit Manager**: Watches for early TP or trailing stop

6. **Tracks Profit/Loss:**  
   - 💰 Records trades in persistent ledger (`data/trades.jsonl`)
   - `/pnl` for realized PnL, `/open` for unrealized PnL

7. **Partial Take-Profit (if enabled):**
   - Example: `PARTIAL_TP_PCT=0.5` sells 50% at early TP, trails the rest

## 🔧 Tuning Parameters

### For Faster Fills (High Competition)
```env
CU_UNIT_PRICE_MICROLAMPORTS=10000   # Higher priority
CU_LIMIT=1000000
```

### For Safer Entries (Stricter Checks)
```env
MAX_TAX_BPS=300                     # Lower tax tolerance
MAX_PRICE_IMPACT_BPS=2000           # Stricter slippage
SENTRY_MAX_DRAWDOWN_PCT=0.15        # Exit faster on drawdown
```

### For Aggressive Trading
```env
EARLY_TP_PCT=0.5                    # 50% profit target
TRAIL_STOP_PCT=0.15                 # Tighter trailing stop
```

## ⚠️ Important Notes

1. **RPC Rate Limits:** Free Solana RPC has rate limits. Consider using:
   - [Helius](https://helius.dev) - Free tier: 100 req/s
   - [QuickNode](https://quicknode.com) - Premium endpoints
   - [Triton](https://triton.one) - High-performance RPC

2. **Gas Costs:** Each trade costs:
   - Swap fee: ~0.0001 SOL
   - Priority fee: ~0.004 SOL (at 5000 microLamports)
   - Total: ~0.0041 SOL per trade

3. **Risk Management:** Start with small `BUY_SOL` amounts (0.001-0.01 SOL) while testing

4. **Monitoring:** Keep the bot running in a screen/tmux session or use PM2:
   ```bash
   npm install -g pm2
   pm2 start "npm start" --name alpha-snipes
   pm2 logs alpha-snipes
   ```

5. **Heartbeat & Watchdog:**  
   - Heartbeat interval: `HEARTBEAT_EVERY_MIN` (default 15)  
   - Silent alert threshold: `SILENT_ALERT_MIN` (default 60)
   - Both configurable in `.env`

## 🐛 Troubleshooting

### "Invalid WALLET_PRIVATE_KEY"
- Ensure key is in base58 format (not JSON array)
- No spaces or quotes around the key

### "Failed to get recent blockhash"
- RPC endpoint is down or rate limited
- Switch to a premium RPC provider

### "No route found"
- Token has no liquidity
- Increase `MAX_PRICE_IMPACT_BPS`

### Bot not detecting alpha trades
- Verify `ALPHA_WALLET` is correct
- Check if alpha wallet is active
- Ensure RPC connection is stable

### "Too Many Requests" or "Bad Request"
- Jupiter API rate limit reached
- The bot automatically backs off (20–60s) and retries safely
- Consider a premium Jupiter plan or private RPC for higher limits

## 📞 Support

If you encounter issues:
1. Check console logs for detailed errors
2. Verify all `.env` variables are set correctly
3. Test Telegram connection: `npm run test:telegram`
4. Check wallet balance has sufficient SOL

---

**Ready to snipe? 🎯**


