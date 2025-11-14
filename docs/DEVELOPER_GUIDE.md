# 🛠️ Developer Guide

**For engineers** - Architecture, data flows, testing, and extending Alpha Snipes.

---

## 📐 Architecture Overview

### Component Map

```
Alpha Snipes Bot
├── index.ts                    Main loop, orchestration
├── lib/
│   ├── quote_client.ts         Resilient Jupiter quote fetcher
│   ├── jupiter_endpoints.ts    Centralized API endpoints
│   ├── sol_price.ts            SOL→USD price cache
│   ├── ledger.ts               Trade history (JSONL)
│   ├── telegram_helpers.ts     Inline keyboards, formatting
│   ├── format.ts               Number/address formatters
│   ├── explain.ts              Human-readable skip reasons
│   ├── rug_checks.ts           Preflight safety validation
│   └── priority.ts             Jito-lite priority fees
├── alpha/
│   └── alpha_registry.ts       Alpha wallet scoring/promotion
├── tools/
│   ├── quote_smoke.ts          Jupiter API smoke test
│   └── dedupe_registry.ts      Registry cleanup utility
└── data/
    ├── trades.jsonl            Trade ledger (auto-created)
    └── alpha/
        └── registry.json       Alpha state (auto-created)
```

---

## 🔄 Data Flows

### 1. Alpha Transaction Detection

```
Solana RPC (onLogs)
  ↓
handleAlphaTransaction(signature)
  ↓
safeGetParsedTx(signature)  [multi-layered fallback]
  ↓
extractMints(tx)  [compare pre/post token balances]
  ↓
for each new mint:
  ├─ candidate? → score + maybe promote
  └─ active? → validate + buy
```

**Key Functions:**
- `safeGetParsedTx()`: 3-layer fallback (getParsedTransaction → getTransaction → raw JSON-RPC)
- `extractMints()`: Detect new tokens from balance changes
- `maybePromote()`: Auto-promote candidates after N signals

---

### 2. Buy Flow (Active Alpha)

```
New mint detected from active wallet
  ↓
runRugChecks(mint)  [authority, tax, Jupiter route]
  ↓
  ├─ fail? → skip + log reason + explainSkip()
  └─ pass? → continue
      ↓
fetchQuoteResilient(SOL→TOKEN)  [rate-limited, multi-endpoint]
  ↓
  ├─ fail/cooldown? → skip + record cooldown
  └─ success? → continue
      ↓
paperBuy() or liveBuy()
  ↓
Record to ledger (buy entry)
  ↓
Telegram alert (inline buttons)
  ↓
Start sentry monitoring (2 min window)
  ↓
Start exit management loop
```

**Key Functions:**
- `runRugChecks()`: Validates authorities, tax, and Jupiter route
- `fetchQuoteResilient()`: Multi-endpoint fallback with retries
- `paperBuy()` / `liveBuy()`: Simulate or execute swap
- `recordTrade()`: Append to JSONL ledger

---

### 3. Exit Management

```
Position opened
  ↓
Every 10 seconds:
  ├─ Fetch current price (quote)
  ├─ Update high watermark
  ├─ Check sentry (first 2 min)
  │   └─ DD > threshold? → emergency exit
  └─ Check exit phase:
      ├─ EARLY TP:
      │   └─ Price > target?
      │       ├─ PARTIAL_TP > 0? → sell fraction, record
      │       └─ Switch to TRAILING
      └─ TRAILING:
          └─ Price < (high × (1 - TRAIL_STOP_PCT))?
              └─ Exit, record to ledger, send alert
```

**Key Logic:**
- Phase 1: Wait for Early TP (`EARLY_TP_PCT`)
- Phase 2: Trailing stop (`TRAIL_STOP_PCT` from high)
- Sentry: Emergency exit if rapid drawdown in first 2 minutes

---

### 4. Ledger & Reporting

```
Trade events
  ↓
recordTrade({ t, kind, mode, mint, alpha, ... })
  ↓
Append to data/trades.jsonl
  ↓
Commands:
  ├─ /pnl [filter] → readTrades() + summarize()
  └─ /open → fetch current quotes + calculate unrealized
```

**JSONL Format:**
- One JSON object per line
- Resistant to crashes (append-only)
- Easy to parse (`grep`, `jq`, or `readTrades()`)

---

## 🔌 Key Subsystems

### Quote Client (`lib/quote_client.ts`)

**Purpose:** Resilient Jupiter quote fetching with rate limiting and failure handling.

**Features:**
- **Multi-endpoint fallback**: `lite-api.jup.ag` → `quote-api.jup.ag` → `quoting.jup.ag`
- **DNS override**: Force Cloudflare/Google DNS for stability
- **Rate limiting**:
  - Global: 5 calls/sec
  - Per-key: 3s cooldown
- **Failure cooldowns**:
  - 429 (rate limit): 20s backoff
  - 400 (bad request): 60s backoff
- **Exponential backoff**: Jittered delays for 429 responses

**Core Functions:**
```typescript
fetchQuoteResilient({ inputMint, outputMint, amount, slippageBps }, options)
  → { ok: boolean, quote?: JupiterQuote, error?: Error }
```

**Error Handling:**
- Sanitizes invalid base URLs
- Skips cooldown keys automatically
- Returns structured `{ ok, quote, error }` for predictable handling

---

### Jupiter Endpoints (`lib/jupiter_endpoints.ts`)

**Purpose:** Single source of truth for Jupiter API URLs.

```typescript
export const JUP_QUOTE_BASE = process.env.JUP_QUOTE_BASE?.trim() 
  || 'https://lite-api.jup.ag/swap/v1/quote';
export const JUP_SWAP_BASE = process.env.JUP_SWAP_BASE?.trim()
  || 'https://lite-api.jup.ag/swap/v1/swap';
```

**Why:**
- Centralized configuration
- Prevents URL fragmentation
- Easy to override per environment

**Startup Banner:**
```
🔁 JUP_QUOTE_BASE override: https://lite-api.jup.ag/swap/v1/quote
🔁 JUP_SWAP_BASE override: https://lite-api.jup.ag/swap/v1/swap
```

---

### SOL Price Cache (`lib/sol_price.ts`)

**Purpose:** Fetch and cache SOL→USD price for USD equivalents in alerts.

```typescript
getSolUsd() → Promise<number>
```

**Mechanism:**
- Uses `fetchQuoteResilient(SOL→USDC)`
- 60-second TTL cache
- Returns 0 on failure (graceful degradation)

**Usage:**
```typescript
const solUsd = await getSolUsd();
const buyUsd = buySol * solUsd;
console.log(`Buy: ${formatSol(buySol)} (${formatUsd(buyUsd)})`);
```

---

### Trade Ledger (`lib/ledger.ts`)

**Purpose:** Persistent trade history in JSONL format.

```typescript
export type TradeEntry = {
  t: number;                // ms timestamp
  kind: 'buy'|'sell';
  mode: 'paper'|'live';
  mint: string;
  alpha?: string;
  sizeSol?: number;
  entryPriceSol?: number;
  exitPriceSol?: number;
  pnlSol?: number;
  pnlUsd?: number;
  pnlPct?: number;
  durationSec?: number;
  tx?: string;
};

recordTrade(entry: TradeEntry): void
readTrades(limit?: number): TradeEntry[]
summarize(trades: TradeEntry[], sinceMs?: number): Summary
```

**Storage:**
- Path: `data/trades.jsonl`
- Format: One JSON object per line (JSONL)
- Crash-resistant (append-only)

---

### Telegram Helpers (`lib/telegram_helpers.ts`)

**Purpose:** Generate inline keyboard markup for Solscan links.

```typescript
linkRow({ mint, alpha, tx, extraRows })
  → { reply_markup, parse_mode: 'HTML', disable_web_page_preview: true }
```

**Example:**
```typescript
await bot.sendMessage(
  chatId,
  `✅ Bought ${formatSol(size)} of ${short(mint)}`,
  linkRow({ mint, alpha, tx })
);
```

**Renders as:**
```
✅ Bought 0.01 SOL of EPjFWd…Dt1v

[🪙 Mint] [👤 Alpha] [🔗 TX]  ← clickable buttons
```

---

### Format Utilities (`lib/format.ts`)

**Purpose:** Consistent number and address formatting.

```typescript
formatSol(n: number): string        // "0.01234 SOL"
formatUsd(n: number): string        // "$2.38"
short(addr: string): string         // "EPjFWd…Dt1v"
lamportsToSol(l: number): number    // 1_000_000_000 → 1
```

---

### Rug Checks (`lib/rug_checks.ts`)

**Purpose:** Preflight safety validation before buying.

```typescript
runRugChecks(mint: PublicKey)
  → Promise<{ ok: boolean, reasons: string[], entryPrice?: number }>
```

**Checks:**
1. **Mint authority**: Revoked? (prevents infinite minting)
2. **Freeze authority**: Revoked? (prevents wallet freezing)
3. **Transfer tax**: Within `MAX_TAX_BPS`?
4. **Jupiter route**: Valid buy route exists?
5. **Price impact**: Within `MAX_PRICE_IMPACT_BPS`?

**Returns:**
- `ok: true` → Safe to buy
- `ok: false` → Skip, reasons explain why

---

### Alpha Registry (`alpha/alpha_registry.ts`)

**Purpose:** Manage alpha wallet tracking with auto-promotion.

```typescript
readRegistry(): Registry
addCandidate(addr: string): void
addActive(addr: string): void
bumpScore(addr: string): void
maybePromote(addr: string, threshold: number, windowMs: number): boolean
```

**State:**
```json
{
  "active": ["wallet1", "wallet2"],
  "candidates": ["wallet3", "wallet4"],
  "scores": {
    "wallet3": { "signals": 2, "lastSeen": 1699651234567 },
    "wallet4": { "signals": 1, "lastSeen": 1699651234567 }
  }
}
```

**Features:**
- Atomic writes (prevents race conditions)
- Deduplication on read (self-healing)
- Score decay (24-hour window)
- Promotion debouncing (prevents duplicate alerts)

---

## 🧪 Testing Utilities

### Quote Smoke Test (`tools/quote_smoke.ts`)

**Purpose:** Verify Jupiter API connectivity.

```bash
tsx tools/quote_smoke.ts
```

**Output:**
```
🧪 Quote Smoke Test
━━━━━━━━━━━━━━━━━━━━━
✅ SOL→USDC: 238.45 USDC/SOL
✅ SOL→BONK: 123456789 BONK/SOL

DNS: 1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4
Endpoints: https://lite-api.jup.ag/swap/v1/quote
```

**Use cases:**
- Verify `.env` configuration
- Test RPC/DNS after changes
- Confirm Jupiter API access

---

### Registry Deduplication (`tools/dedupe_registry.ts`)

**Purpose:** Self-heal alpha registry state.

```bash
tsx tools/dedupe_registry.ts
```

**Effect:**
- Removes duplicates from active/candidate lists
- Ensures no wallet is both active AND candidate
- Persists fixed state atomically

---

### Debug Flags

**Enable verbose logging:**
```env
DEBUG_TX=true              # Log why txs don't produce signals
DEBUG_TO_TELEGRAM=true     # Echo debug to Telegram DM
DEBUG_QUOTE=1              # Log all Jupiter API attempts
```

**Example debug output:**
```
[DBG] considering tx abc123… (preTokens: 2, postTokens: 3)
[DBG][QUOTE] url = https://lite-api.jup.ag/swap/v1/quote?inputMint=...
[DBG][QUOTE] skip cooldown So111…:EPjF…:10000000 until 2025-11-11T12:34:56Z
```

---

## 🔧 Extending the Bot

### Adding a Custom Check

**1. Create check function in `lib/rug_checks.ts`:**

```typescript
async function checkLiquidity(mint: PublicKey): Promise<boolean> {
  // Your logic here
  const liquidity = await fetchLiquidity(mint);
  return liquidity > 10_000; // $10k minimum
}
```

**2. Add to `runRugChecks()`:**

```typescript
const liquidityOk = await checkLiquidity(mint);
if (!liquidityOk) {
  reasons.push('insufficient_liquidity');
}
```

**3. Add explanation in `lib/explain.ts`:**

```typescript
case 'insufficient_liquidity':
  return 'Token has less than $10k liquidity — too risky.';
```

**4. Test in paper mode** and verify skip messages.

---

### Adding a Custom Exit Strategy

**1. In `index.ts`, find the exit management loop** (search for "manageExit" or "trailing stop").

**2. Add your custom logic:**

```typescript
// Example: Time-based exit (max hold 30 min)
const holdTimeSec = (Date.now() - position.entryTime) / 1000;
if (holdTimeSec > 1800) { // 30 minutes
  console.log(`[TIME EXIT] ${mintStr} held for ${holdTimeSec}s`);
  // Execute sell logic here
}
```

**3. Record to ledger:**

```typescript
recordTrade({
  t: Date.now(),
  kind: 'sell',
  mode: IS_PAPER ? 'paper' : 'live',
  mint: mintStr,
  exitPriceSol: currentPrice,
  exitUsd: exitSol * solUsd,
  pnlSol, pnlUsd, pnlPct,
  durationSec: Math.round(holdTimeSec),
  tx: exitTx
});
```

---

### Adding a Custom Command

**1. In `index.ts`, add command handler:**

```typescript
bot.onText(/^\/balance$/, async (msg) => {
  if (!isAdmin(msg)) return;
  
  const balance = await connection.getBalance(wallet.publicKey);
  const balanceSol = balance / 1_000_000_000;
  
  await bot.sendMessage(
    msg.chat.id,
    `💰 Bot wallet balance: ${formatSol(balanceSol)}`,
    { parse_mode: 'HTML' }
  );
});
```

**2. Update `/help` text:**

```typescript
/balance - Check bot wallet balance
```

---

## 🔍 Code Conventions

### TypeScript & ESM

- **Module system**: ES modules (`"type": "module"` in `package.json`)
- **TypeScript target**: ES2022
- **Strict mode**: Enabled (`tsconfig.json`)
- **Import syntax**: 
  ```typescript
  import { Connection } from '@solana/web3.js';
  import type { ParsedTransactionWithMeta } from '@solana/web3.js'; // type-only
  ```

### Error Handling

**Structured returns:**
```typescript
async function fetchData(): Promise<{ ok: boolean; data?: T; error?: Error }> {
  try {
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e as Error };
  }
}
```

**Graceful degradation:**
```typescript
const solUsd = await getSolUsd().catch(() => 0);
// Continue with solUsd = 0 if fetch fails
```

### Logging

**Structured tags:**
```
[PAPER] - Paper mode alert
[LIVE] - Live mode alert
[DBG] - Debug output
[HB] - Heartbeat
[QUOTE] - Quote client
```

**Pattern:**
```typescript
const tag = IS_PAPER ? '[PAPER] ' : '';
console.log(`${tag}✅ Bought ${formatSol(size)} of ${short(mint)}`);
```

---

## 🔐 Security Considerations

### Environment Variables

**Never log:**
```typescript
// ❌ BAD
console.log(process.env.WALLET_PRIVATE_KEY);

// ✅ GOOD
console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
```

### Wallet Key Handling

**In code:**
```typescript
const walletKeypair = Keypair.fromSecretKey(
  bs58.decode(process.env.WALLET_PRIVATE_KEY!)
);

// Never serialize back to string after loading
```

**Storage:**
- Keep in `.env` (already in `.gitignore`)
- Never commit to git
- Consider OS keychain for production

---

## 🧩 Dependency Management

### Core Dependencies

```json
{
  "@solana/web3.js": "^1.95.0",
  "@solana/spl-token": "^0.4.0",
  "node-telegram-bot-api": "^0.66.0",
  "bs58": "^5.0.0",
  "dotenv": "^16.0.0"
}
```

### Dev Dependencies

```json
{
  "typescript": "^5.0.0",
  "tsx": "^4.0.0",
  "@types/node": "^20.0.0"
}
```

### Upgrading Solana Web3.js

**If you see `meta.costUnits` errors:**

1. Upgrade to 1.95.0+:
   ```bash
   npm install @solana/web3.js@latest
   ```

2. The bot's `safeGetParsedTx()` handles this gracefully with fallbacks.

---

## 📊 Performance Optimization

### Rate Limit Tuning

**Built-in limits (hardcoded):**
```typescript
const GLOBAL_MAX_CALLS = 5;        // calls/sec
const PER_KEY_MIN_GAP_MS = 3000;   // 3s per mint
const COOLDOWN_429_MS = 20_000;    // 20s after 429
const COOLDOWN_400_MS = 60_000;    // 60s after 400
```

**Why hardcoded:**
- Prevents overwhelming Jupiter API
- Automatic recovery from errors
- User-friendly (no tuning needed)

**If you need custom limits:**
1. Fork `lib/quote_client.ts`
2. Adjust constants
3. Test thoroughly with `tools/quote_smoke.ts`

---

### RPC Optimization

**Use premium RPC:**
```env
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=xxx
```

**Benefits:**
- Higher rate limits
- Better reliability
- Faster response times
- WebSocket support for `onLogs`

---

### DNS Stability

**Force reliable resolvers:**
```env
DNS_OVERRIDE=1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4
```

**Effect:**
- Bypasses flaky ISP DNS
- Reduces `ENOTFOUND` errors
- Improves Jupiter API reachability

---

## 🧪 Testing Workflow

### 1. Smoke Test

```bash
tsx tools/quote_smoke.ts
```

Verify:
- ✅ SOL→USDC quote succeeds
- ✅ SOL→BONK quote succeeds
- ✅ DNS override active
- ✅ Jupiter endpoints correct

---

### 2. Paper Mode Test

```bash
npm start
# or
pm2 start ecosystem.config.cjs
pm2 logs alpha-snipes-paper
```

Verify:
- ✅ Banner shows `📄 PAPER MODE`
- ✅ Telegram bot responds to `/help`
- ✅ Alpha wallet monitoring starts
- ✅ Heartbeat appears every 15 minutes

---

### 3. Test Commands

```
/status    → Shows heartbeat
/list      → Shows alpha wallets
/open      → Shows no positions (initially)
/pnl       → Shows no trades (initially)
```

---

### 4. Simulate Trade

**Option A: Wait for real alpha signal**

**Option B: Force test with `/force_exit`** (paper only)
- Requires open position first
- Manually triggers exit logic

---

### 5. Validate Ledger

```bash
cat data/trades.jsonl
```

Verify:
- ✅ Valid JSON per line
- ✅ Buy/sell pairs match
- ✅ PnL calculations correct

---

## 🐛 Debugging Common Issues

### "Invalid URL" Errors

**Cause:** Empty or malformed `JUP_QUOTE_BASE`.

**Fix:**
```typescript
// lib/quote_client.ts has sanitization:
const RAW_BASES = [
  process.env.JUP_QUOTE_BASE,
  'https://lite-api.jup.ag/swap/v1/quote',
  // ...
];

function sanitizeBases(bases: (string | undefined)[]): string[] {
  return bases
    .filter(b => b && /^https?:\/\//i.test(b))
    .filter((v, i, a) => a.indexOf(v) === i);
}
```

---

### "429 Too Many Requests"

**Cause:** Hitting Jupiter rate limits.

**Fix:**
- Built-in 20s cooldown activates automatically
- Check logs for `[DBG][QUOTE] skip cooldown`
- If persistent, use premium RPC

---

### "DNS Resolution Failed"

**Cause:** ISP DNS issues.

**Fix:**
```env
DNS_OVERRIDE=1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4
```

Restart bot to apply.

---

### "No Signals for X Minutes"

**Cause:** Alpha wallet inactive or filters too strict.

**Debug:**
1. Check alpha on Solscan (recent transactions?)
2. Use `/list` to verify active wallets
3. Try `/add <other_wallet>` to diversify
4. Check skip reasons in logs

---

## 📖 Architecture Decisions

### Why JSONL for Ledger?

- **Append-only**: Crash-resistant
- **Line-based**: Easy to parse (`grep`, `tail`)
- **Human-readable**: Inspect with any text editor
- **No schema**: Add fields without migration

### Why Inline Keyboards?

- **Cleaner UX**: Links as buttons, not text
- **One-tap**: Direct to Solscan
- **HTML parse mode**: Supports formatting (bold, code)

### Why Multi-Endpoint Fallback?

- **Resilience**: Single endpoint failure doesn't kill bot
- **Load balancing**: Distributes requests
- **Rate limit avoidance**: Different endpoints = different limits

### Why Hardcoded Rate Limits?

- **Simplicity**: No user tuning required
- **Safety**: Prevents accidental API abuse
- **Tested**: Values proven stable over 50+ trades

---

## 🚀 Future Extension Ideas

### Analytics Dashboard

- Parse `data/trades.jsonl`
- Generate win rate, avg profit, per-alpha stats
- Web UI with charts (React + D3.js)

### Multi-Wallet Support

- Track multiple bot wallets
- Aggregate PnL across all
- Compare performance

### ML-Based Exit

- Train model on historical trades
- Predict optimal exit timing
- Backtest on ledger data

### Discord Integration

- Mirror Telegram alerts to Discord
- Slash commands (`/pnl`, `/open`)
- Embed charts in messages

### Advanced Rug Checks

- On-chain liquidity analysis
- Holder concentration metrics
- Social sentiment (Twitter API)

---

## 📚 Further Reading

- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)
- [Jupiter Aggregator API](https://station.jup.ag/docs/apis/swap-api)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [JSONL Spec](https://jsonlines.org/)

---

## 🤝 Contributing

**Code style:**
- TypeScript strict mode
- ESM imports
- Descriptive variable names
- Structured error handling

**Testing:**
- Smoke test before PR
- Paper mode validation
- Update relevant docs

**Documentation:**
- Update `docs/` when adding features
- Add examples for new commands
- Explain trade-offs

---

**Built with 💎 for the Solana dev community** ⚡




