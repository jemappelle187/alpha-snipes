# 🔐 Security & Risk Disclosure

**Important security considerations and risk warnings for Alpha Snipes operators.**

---

## ⚠️ Risk Disclosure

### Trading Risks

**Alpha Snipes is experimental software. Use at your own risk.**

- ❌ **No guarantees**: Past performance ≠ future results
- ❌ **High volatility**: Tokens can go to zero
- ❌ **Rug pulls**: Even with checks, scams exist
- ❌ **Impermanent loss**: Price can drop while holding
- ❌ **MEV exposure**: Front-running, sandwich attacks
- ❌ **Slippage**: Executed price may differ from quote
- ❌ **Gas costs**: Reduce net profit

**Never trade with funds you cannot afford to lose.**

---

## 🔑 Wallet Key Security

### Private Key Handling

**Your private key = full control of funds.**

#### ✅ Best Practices

1. **Use dedicated wallet**
   - Create new wallet ONLY for bot
   - Never use your main wallet
   - Keep only needed funds (1-2 SOL)

2. **Secure storage**
   - Store in `.env` (already in `.gitignore`)
   - Never commit to git
   - Never share publicly
   - Consider OS keychain for production

3. **Access control**
   - Restrict `.env` file permissions:
     ```bash
     chmod 600 .env
     ```
   - Only bot user should read it

4. **Backup safely**
   - Encrypted backup (e.g., KeePass, 1Password)
   - Offline storage (USB, paper wallet)
   - Multiple copies in secure locations

#### ❌ Never Do This

- **Don't hardcode** keys in source code
- **Don't commit** `.env` to git
- **Don't share** `.env` file via email/chat
- **Don't screenshot** key (may leak metadata)
- **Don't store** in cloud without encryption
- **Don't reuse** key across multiple bots/apps

---

### Key Format

**Required format for `.env`:**
```env
WALLET_PRIVATE_KEY=5J7Wn...base58_encoded_key...XyZ
```

**Converting from JSON array:**
```javascript
const bs58 = require('bs58');
const key = bs58.encode(Buffer.from([123, 45, 67, ...]));
console.log(key); // Use this in .env
```

**Verify it's correct:**
```bash
# In Solana CLI
solana-keygen pubkey /path/to/keypair.json
# Should match bot startup banner
```

---

## 🛡️ Operational Security

### Environment Setup

#### Production `.env` Checklist

- [ ] `WALLET_PRIVATE_KEY` is for dedicated wallet only
- [ ] Wallet has minimal funds (1-2 SOL max)
- [ ] `TRADE_MODE=paper` for initial testing
- [ ] `ADMIN_USER_ID` set to YOUR Telegram ID
- [ ] Telegram bot token is unique (not shared)
- [ ] `.env` permissions: `chmod 600`
- [ ] `.env` backed up securely

#### VPS/Cloud Security

**If running on Oracle/AWS/DigitalOcean:**

1. **SSH hardening**
   - Disable password auth (key-only)
   - Change default SSH port
   - Use fail2ban for brute-force protection

2. **Firewall**
   - Block all inbound (bot is outbound-only)
   - Only allow SSH from your IP
   - Use security groups/firewall rules

3. **System updates**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

4. **User permissions**
   - Don't run as root
   - Create dedicated user: `botuser`
   - Restrict `.env` to that user only

**See [ORACLE_DEPLOY.md](ORACLE_DEPLOY.md) for detailed VPS setup.**

---

### Telegram Security

#### Bot Token Protection

**Your bot token = full bot control.**

- Store in `.env` only
- Never commit to git
- Regenerate if leaked (via @BotFather)

#### Admin User ID

```env
ADMIN_USER_ID=123456789
```

**Why it matters:**
- All bot commands require this ID
- Prevents unauthorized control
- Get YOUR ID from @userinfobot

**If compromised:**
- Change `ADMIN_USER_ID` immediately
- Restart bot: `pm2 restart alpha-snipes-paper --update-env`

---

## 🚨 Attack Vectors & Mitigations

### Wallet Compromise

**Scenario:** Attacker gains access to `WALLET_PRIVATE_KEY`.

**Impact:**
- ✅ Limited to bot wallet funds (1-2 SOL)
- ❌ Cannot access your main wallet (if separated)

**Mitigation:**
- Use dedicated wallet with minimal funds
- Monitor balance daily
- Rotate wallet monthly (create new, migrate)

---

### Telegram Bot Hijacking

**Scenario:** Attacker gets your bot token.

**Impact:**
- Can send fake alerts
- Can read command responses
- Cannot control trading (needs `ADMIN_USER_ID`)

**Mitigation:**
- Regenerate token if suspected
- Use separate `COMMAND_CHAT_ID` (private DM)
- Monitor for unexpected messages

---

### VPS Intrusion

**Scenario:** Attacker gains SSH access to your VPS.

**Impact:**
- Can read `.env` and steal wallet key
- Can modify bot behavior
- Can install malware

**Mitigation:**
- SSH key-only auth (no passwords)
- Keep only minimal funds in bot wallet
- Regular security audits
- Monitor PM2 logs for unexpected restarts

---

### Supply Chain Attack

**Scenario:** Malicious npm package in dependencies.

**Impact:**
- Can exfiltrate `.env` contents
- Can modify trade logic
- Can send funds elsewhere

**Mitigation:**
- Audit `package.json` before `npm install`
- Use `npm audit` to check vulnerabilities
- Pin dependency versions (no `^` or `~`)
- Review code changes on git pull

---

## 📋 Token-Specific Risks

### Rug Checks Are Not Foolproof

**Even with all checks passed, tokens can:**

| Risk | Explanation | Mitigation |
|------|-------------|------------|
| **Liquidity rug** | Creator removes LP | Sentry system (early exit on drawdown) |
| **Honeypot** | Can buy but not sell | Jupiter route check helps but not perfect |
| **Dev dump** | Large holder sells | Diversify across multiple tokens |
| **Smart contract exploit** | Token contract has hidden backdoor | No perfect defense; trade small sizes |
| **Market manipulation** | Coordinated pump & dump | Use trailing stops, don't FOMO |

### Rug Check Limitations

**What the bot checks:**
- ✅ Mint authority revoked?
- ✅ Freeze authority revoked?
- ✅ Transfer tax within limits?
- ✅ Jupiter route exists?
- ✅ Price impact acceptable?

**What the bot CANNOT check:**
- ❌ Liquidity lock duration
- ❌ Holder distribution (whale concentration)
- ❌ Contract backdoors (arbitrary logic)
- ❌ Off-chain social engineering scams
- ❌ Creator intent or history

**Conclusion:** Rug checks reduce risk but cannot eliminate it.

---

### Sentry System (Early Exit)

**Protection:**
- Monitors for rapid drawdown in first 2 minutes
- Default: Exit at -22% within 2-minute window

**Configuration:**
```env
SENTRY_WINDOW_SEC=120           # 2-minute window
SENTRY_MAX_DRAWDOWN_PCT=0.22    # Exit at -22%
```

**Trade-off:**
- Tighter threshold (e.g., 0.15) = more protective, more false positives
- Wider threshold (e.g., 0.30) = less protective, fewer early exits

---

## 💰 Financial Risk Management

### Position Sizing

**Recommended limits:**

| Mode | Position Size | Total Capital | Risk Tolerance |
|------|---------------|---------------|----------------|
| Paper | Any | N/A | Zero (simulation) |
| Live (Conservative) | 0.005-0.01 SOL | 1-2 SOL | Low |
| Live (Balanced) | 0.01-0.02 SOL | 2-5 SOL | Medium |
| Live (Aggressive) | 0.05-0.1 SOL | 10+ SOL | High |

**Never risk more than you can afford to lose.**

---

### Diversification

**Don't rely on single alpha wallet:**
- Track 3-5 alphas minimum
- Use `/add <wallet>` to diversify
- Monitor individual alpha performance in ledger

**Example:**
```bash
# Diversify alpha sources
/add 7xKXtg2CWiaqJ1vFqUvGMEPNvZp8p5K92iFNQ2cxCGpX
/add HU3KnqVGmXoBDi8bRo9PJxwYJuG9YPtCpqq3r7F8XBh2
/add Gfg3imTpZvxF7r9PJxwYJuG9YPtCpqq3r7FmzU9XkQw4
```

---

### Stop Loss Discipline

**Exit strategy is critical:**
```env
EARLY_TP_PCT=0.3       # Take profit at +30%
TRAIL_STOP_PCT=0.2     # Stop at -20% from high
PARTIAL_TP_PCT=0.5     # Lock 50% at Early TP
```

**Why this matters:**
- Prevents holding bags on dumps
- Locks in profits on pumps
- Removes emotion from exits

**Never disable exit management** (even if you think token will moon).

---

## 🧪 Paper Mode (Risk-Free Testing)

### Always Test First

**Before going live:**
1. Run in paper mode for 48+ hours
2. Verify win rate > 60%
3. Check `/pnl 24h` is positive
4. Understand skip reasons
5. Confirm exit strategy works

### Paper Mode Limitations

**What paper mode simulates:**
- ✅ Alpha detection
- ✅ Rug checks
- ✅ Jupiter quotes (live pricing)
- ✅ Position tracking
- ✅ Exit management
- ✅ PnL calculations

**What paper mode CANNOT simulate:**
- ❌ Real gas costs (~0.005 SOL per trade)
- ❌ Actual slippage (may be worse than quote)
- ❌ MEV (front-running, sandwich attacks)
- ❌ Fill speed (priority fees matter in live)
- ❌ Partial fills (Jupiter may not fill full size)

**Conclusion:** Paper mode proves logic, not profitability.

---

## 🔍 Monitoring & Auditing

### Daily Checklist

**Every 24 hours:**
- [ ] Check `/open` (any stuck positions?)
- [ ] Check `/pnl 24h` (profitable?)
- [ ] Review `pm2 logs` for errors
- [ ] Verify wallet balance on Solscan
- [ ] Check alpha activity (still trading?)

### Weekly Checklist

**Every 7 days:**
- [ ] Review `data/trades.jsonl` for patterns
- [ ] Audit skip reasons (too strict?)
- [ ] Check win rate (above 55%?)
- [ ] Rotate wallet if needed
- [ ] Update dependencies: `npm update`

### Monthly Checklist

**Every 30 days:**
- [ ] Backup ledger: `cp data/trades.jsonl backups/`
- [ ] Review alpha performance (remove inactive)
- [ ] Tune parameters based on results
- [ ] Security audit (SSH logs, VPS logs)
- [ ] Consider wallet rotation (new dedicated wallet)

---

## 🚫 What NOT to Do

### Common Mistakes

| Mistake | Why Bad | Fix |
|---------|---------|-----|
| **Use main wallet** | Risk all funds | Dedicated wallet only |
| **Skip paper testing** | Don't understand bot | Test 48h in paper first |
| **Disable rug checks** | High scam risk | Keep `REQUIRE_AUTHORITY_REVOKED=true` |
| **Increase size without testing** | Magnify losses | Scale gradually (0.001 → 0.01 → 0.02) |
| **Disable exit management** | Hold bags forever | Always use TP + trailing stop |
| **Add random alphas** | Copy bad traders | Vet alphas on Solscan first |
| **Run multiple instances** | Telegram 409 errors | Use PM2 (single instance) |
| **Ignore alerts** | Miss critical issues | Monitor Telegram daily |

---

## 📞 Incident Response

### Suspected Wallet Compromise

**Immediate actions:**
1. Stop bot: `pm2 stop alpha-snipes-paper`
2. Check balance on Solscan
3. Transfer remaining funds to secure wallet
4. Regenerate wallet key
5. Audit VPS/system for intrusion
6. Change all credentials (SSH, Telegram bot)

### Unexpected Behavior

**If bot is doing something wrong:**
1. Stop immediately: `pm2 stop alpha-snipes-paper`
2. Review logs: `pm2 logs alpha-snipes-paper --lines 500`
3. Check `/open` (any positions?)
4. Manually close positions if needed (Solscan)
5. Debug in paper mode before restarting

### Data Loss

**If `data/trades.jsonl` or `alpha/registry.json` lost:**
- Ledger cannot be recovered (no backups)
- Registry will reset (re-add alphas with `/add`)
- Consider daily backups:
  ```bash
  cp data/trades.jsonl backups/trades-$(date +%F).jsonl
  ```

---

## ⚖️ Legal & Compliance

### Disclaimer

**Alpha Snipes is provided "as is" without warranty.**

- ✅ Open source (audit the code)
- ❌ No guarantee of profit
- ❌ No liability for losses
- ❌ Not financial advice

### Regulatory Considerations

**Depending on your jurisdiction:**
- Crypto trading may be regulated
- Tax obligations apply to profits
- KYC/AML may be required for exchanges
- Consult local tax professional

**Alpha Snipes does NOT:**
- Provide tax reporting (you must calculate from ledger)
- Handle KYC/AML compliance
- Offer financial advice

---

## 🎓 Security Best Practices Summary

### Critical (Must Do)

- ✅ Use dedicated wallet with minimal funds (1-2 SOL)
- ✅ Store private key in `.env` only (chmod 600)
- ✅ Test in paper mode first (48+ hours)
- ✅ Set `ADMIN_USER_ID` to YOUR Telegram ID
- ✅ Monitor daily with `/open` and `/pnl`
- ✅ Enable rug checks (`REQUIRE_AUTHORITY_REVOKED=true`)
- ✅ Use exit management (TP + trailing stop)

### Recommended (Should Do)

- ✅ Use premium RPC (Helius, QuickNode)
- ✅ Enable DNS override for stability
- ✅ Track 3-5 alpha wallets (diversification)
- ✅ Enable partial TP (lock profits early)
- ✅ Backup ledger weekly
- ✅ Audit dependencies (`npm audit`)
- ✅ Use VPS with firewall

### Optional (Nice to Have)

- ✅ Rotate wallet monthly
- ✅ Use OS keychain for key storage
- ✅ Set up log rotation
- ✅ Monitor with external uptime service
- ✅ Enable heartbeat alerts

---

## 📖 Further Reading

- [OPERATOR_GUIDE.md](OPERATOR_GUIDE.md) - How to operate safely
- [CONFIG_REFERENCE.md](CONFIG_REFERENCE.md) - Secure configuration
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Handle issues
- [ORACLE_DEPLOY.md](ORACLE_DEPLOY.md) - VPS security setup

---

**Security is a mindset, not a feature. Stay vigilant!** 🔐✨




