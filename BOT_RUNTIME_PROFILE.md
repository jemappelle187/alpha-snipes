# Bot Runtime Profile - Auto-Buy Decision Flow

**Generated:** 2025-11-16  
**Purpose:** Document exactly how the bot decides to auto-buy a mint, including all guards, thresholds, and failure points.

---

## 1. Environment & Configuration

### Active Alpha Wallets
- **Source:** `alpha/alpha_registry.json` (active list)
- **Legacy Fallback:** `ALPHA_WALLET` env var (if registry empty)
- **Current Active:** `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp` (from `.env`)

### Critical Thresholds

| Config Variable | Default | Current (VM) | Purpose |
|----------------|---------|--------------|---------|
| `DUST_SOL_SPENT` | 0.001 | **0.0001** | Minimum SOL alpha must spend to trigger BUY |
| `MIN_ALPHA_TOKEN_BALANCE` | 0.000001 | 0.000001 | Minimum tokens alpha must hold post-buy |
| `MIN_SIZE_INCREASE_RATIO` | 0.25 | 0.25 | Existing positions must size up ≥25% |
| `MAX_SIGNAL_AGE_SEC` | 180 | **180** | Skip signals older than 3 minutes |
| `MAX_ALPHA_ENTRY_MULTIPLIER` | 2 | **REMOVED** | ~~Bot entry ≤ 2x alpha entry price~~ (disabled) |
| `MIN_LIQUIDITY_USD` | 10000 | **5000** | Minimum liquidity required before buying |
| `BUY_SOL` | 0.01 | 0.01 | Base position size (SOL) |
| `MIN_BUY_SOL` | 0.005 | 0.005 | Minimum position size |
| `MAX_BUY_SOL` | 0.05 | 0.05 | Maximum position size |

### Global Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `TRADE_MODE` | `paper` | `paper` = simulation, `live` = real trades |
| `PAPER_MODE` | `true` (if `TRADE_MODE=paper`) | Disables real transactions |
| `DISABLE_AUTO_BUY` | ❌ Not implemented | Would globally disable auto-buy (not in code) |
| `MAX_OPEN_POSITIONS` | ❌ Not implemented | Would limit concurrent positions (not in code) |
| `ENABLE_WATCHLIST` | `true` | Monitor illiquid tokens for later auto-buy |
| `REQUIRE_AUTHORITY_REVOKED` | `true` | Require mint/freeze authority revoked |
| `MAX_TAX_BPS` | 500 | Maximum 5% tax |
| `MAX_PRICE_IMPACT_BPS` | 3000 | Maximum 30% price impact |

### Birdeye Integration

| Config | Status | Purpose |
|--------|--------|---------|
| `BIRDEYE_API_KEY` | ✅ Configured | Used for startup backfill and validation |
| **Birdeye Plan** | ⚠️ **Free tier** | **Wallet trades endpoint requires paid plan ($99/mo)** |
| **Impact** | ⚠️ **Backfill disabled** | Birdeye backfill won't work (401 Unauthorized) |

---

## 2. Alpha Detection Path

### Flow: `onLogs()` → `handleAlphaTransaction()` → `classifyAlphaSignals()` → `executeCopyTradeFromSignal()`

#### Step 1: Transaction Detection

**Location:** `index.ts:1931-1946` (`watchAddress()` → `onLogs()`)

```typescript
connection.onLogs(alphaPublicKey, async (logs) => {
  if (logs.err) return; // Skip failed transactions
  await handleAlphaTransaction(logs.signature, alpha, label);
}, 'confirmed');
```

**Backup Mechanisms:**
1. **Polling Backup:** Every 15 seconds, checks last 30 seconds of transactions (`index.ts:1984-2046`)
2. **Startup Scan:** On bot start, scans last 15 minutes (`index.ts:3305-3379`)
3. **Birdeye Backfill:** On startup, fetches last 30 minutes (⚠️ **Disabled on free tier**)

#### Step 2: Transaction Parsing

**Location:** `index.ts:2052-2072` (`handleAlphaTransaction()`)

```typescript
const tx = await safeGetParsedTx(connection, sig);
if (!tx || !tx.meta) return; // Skip if can't parse

const signals = classifyAlphaSignals(tx, signer, sig);
if (signals.length === 0) return; // No BUY signals
```

**Failure Points:**
- ❌ Transaction parse fails → Skip silently
- ❌ No meta data → Skip silently
- ❌ No BUY signals classified → Skip silently

#### Step 3: BUY Signal Classification

**Location:** `index.ts:489-700` (`classifyAlphaSignals()`)

**Method 1: SOL Balance Change (if alpha in account keys)**

```typescript
const alphaIndex = keys.findIndex(k => normalize(k) === alpha);
if (alphaIndex !== -1) {
  const preLamports = tx.meta.preBalances[alphaIndex];
  const postLamports = tx.meta.postBalances[alphaIndex];
  solSpent = (preLamports - postLamports) / 1e9;
}
```

**Guards:**
- ✅ `solSpent >= DUST_SOL_SPENT` (0.0001 SOL) → **PASS**
- ❌ `solSpent < DUST_SOL_SPENT` → **REJECT** - "skip tx: solSpent < dust"

**Method 2: Token Balance Change (if alpha NOT in account keys)**

```typescript
if (alphaIndex === -1) {
  // Alpha not in account keys - check token balances
  // Use Birdeye to get actual SOL spent later
}
```

**Token Balance Checks:**
- ✅ `delta > 0` (tokens increased) → **PASS**
- ✅ `postAmount >= MIN_ALPHA_TOKEN_BALANCE` (0.000001) → **PASS**
- ❌ `delta <= 0` → **REJECT** - Skip (no token increase)
- ❌ `postAmount < MIN_ALPHA_TOKEN_BALANCE` → **REJECT** - "skip mint: post-balance < dust"

**Size Increase Check (for existing positions):**
- ✅ `delta / preAmount >= MIN_SIZE_INCREASE_RATIO` (0.25) → **PASS**
- ❌ `delta / preAmount < 0.25` → **REJECT** - "skip mint: size increase < 25%"

**Entry Price Calculation:**
```typescript
const alphaEntryPrice = solSpent > 0 && tokenDelta > 0 
  ? solSpent / tokenDelta 
  : null;
```

**Output:** `AlphaSignal[]` with:
- `mint`, `solSpent`, `tokenDelta`, `alphaEntryPrice`, `blockTimeMs`, `signalAgeSec`, `source: 'rpc'`

#### Step 4: Birdeye Validation (Optional)

**Location:** `index.ts:2084-2117`

```typescript
if (signal.source === 'rpc' && signal.txHash && BIRDEYE_API_KEY) {
  const validation = await validateBuyWithBirdeye(alpha, mint, txHash, blockTimeSec);
  if (validation.confirmed && validation.trade) {
    // Update SOL spent if not available from RPC
    if (signal.solSpent === 0 && validation.trade.amountSol > 0) {
      signal.solSpent = validation.trade.amountSol;
      signal.alphaEntryPrice = validation.trade.amountSol / signal.tokenDelta;
    }
  }
}
```

**Status:** ⚠️ **Optional** - Bot proceeds with RPC signal even if Birdeye fails or not configured

**Failure Impact:**
- ❌ Birdeye API error → Log warning, continue with RPC signal
- ❌ Birdeye doesn't confirm → Log warning, continue with RPC signal
- ⚠️ **Free tier limitation:** Wallet trades endpoint returns 401 → Validation skipped

#### Step 5: Execute Copy Trade

**Location:** `index.ts:2150-2400` (`executeCopyTradeFromSignal()`)

---

## 3. Guards in `executeCopyTradeFromSignal()`

### Guard 1: Time Window ⏰

**Location:** `index.ts:2185-2199`

```typescript
if (!skipTimeGuard && MAX_SIGNAL_AGE_SEC > 0) {
  const age = signal.signalAgeSec ?? 0;
  const pass = age <= MAX_SIGNAL_AGE_SEC; // 180 seconds
  if (!pass) {
    await alert(`⛔️ Skipping: Signal too old (${age}s > ${MAX_SIGNAL_AGE_SEC}s)`);
    return 'skipped';
  }
}
```

**Check:** `signalAgeSec <= 180` (3 minutes)

**Failure:** ❌ **REJECT** - "Signal too old"

### Guard 2: Liquidity 💧

**Location:** `index.ts:2204-2225`

```typescript
const liquidity = await getLiquidityResilient(mintStr);
const liquidityUsd = liquidity.ok && liquidity.liquidityUsd ? liquidity.liquidityUsd : 0;
const liqPass = liquidityUsd >= MIN_LIQUIDITY_USD; // 5000 USD
if (!liqPass) {
  await alert(`⛔️ Skipping: Liquidity $${liquidityUsd} < $${MIN_LIQUIDITY_USD}`);
  // Add to watchlist if from alpha signal
  if (source === 'alpha') {
    await queueWatchlistAdd(signal, alpha, 'low_liquidity', txSig);
  }
  return 'skipped';
}
```

**Check:** `liquidityUsd >= 5000` (from `.env`)

**Failure:** ❌ **REJECT** - "Liquidity < $5000" → Added to watchlist

**Liquidity Fetch Details:**
- **Source:** DexScreener API (`lib/liquidity.ts`)
- **Caching:** 10 seconds cache
- **Retries:** 1 retry on failure
- **Timeout:** 10 seconds
- **Rate Limit Handling:** Exponential backoff on 429 errors

**Failure Scenarios:**
- ❌ DexScreener 429 (rate limit) → Retry once, then fail
- ❌ DexScreener timeout → Fail
- ❌ No pairs found → `liquidityUsd = 0` → **REJECT**

### Guard 3: Rug Checks 🛡️

**Location:** `index.ts:2227-2260`

```typescript
const report = await basicRugChecks(connection, mintPk, BUY_SOL, {
  requireAuthorityRevoked: REQUIRE_AUTH_REVOKED, // true
  maxTaxBps: MAX_TAX_BPS, // 500 (5%)
  maxImpactBps: MAX_PRICE_IMPACT_BPS, // 3000 (30%)
});

if (!report.ok) {
  const primaryReason = report.reasons[0];
  await alert(`⛔️ Skipping due to: ${primaryReason}`);
  return 'skipped';
}
```

**Checks:**
1. ✅ **Mint Authority:** Must be revoked (`null` or `11111111111111111111111111111111`)
2. ✅ **Freeze Authority:** Must be revoked (`null` or `11111111111111111111111111111111`)
3. ✅ **Tax Check:** Tax < 5% (500 bps)
4. ✅ **Price Impact:** Price impact < 30% (3000 bps) for buy size
5. ✅ **Route Validation:** Valid swap route exists on Jupiter

**Failure:** ❌ **REJECT** - Reason provided (e.g., "authority not revoked", "high tax", "no route")

### Guard 4: Price Guard 💰 (DISABLED)

**Location:** `index.ts:2269-2278`

**Status:** ✅ **REMOVED** - Bot enters regardless of price vs alpha entry

```typescript
// Price guard removed - bot will enter regardless of price vs alpha entry
if (isValidPrice(signal.alphaEntryPrice) && isValidPrice(start)) {
  const ratio = start / signal.alphaEntryPrice;
  dbg(`[GUARD] Price guard (DISABLED) | ratio=${ratio.toFixed(2)}x | (limit removed - entering anyway)`);
}
```

**Previous Behavior (now disabled):**
- ❌ `botEntryPrice / alphaEntryPrice > 2` → **REJECT** - "Price too high vs alpha entry"

**Current Behavior:**
- ✅ **No limit** - Bot enters even if price is 5x, 10x, or higher than alpha entry
- ✅ **Logs ratio** for monitoring but doesn't block

### Guard 5: Reference Price 📊

**Location:** `index.ts:2262-2267`

```typescript
const start = report.entryPrice ?? (await getQuotePrice(mintPk)) ?? 0;
if (!isValidPrice(start)) {
  await alert(`⚠️ Skipping: Reference price unavailable`);
  return 'skipped';
}
```

**Check:** Must have valid price (from rug checks or `getQuotePrice()`)

**Price Fetch Order:**
1. **Rug checks entry price** (from Jupiter quote)
2. **DexScreener price** (`getLiquidityResilient()`)
3. **Jupiter SELL quote** (1M tokens → SOL)
4. **Jupiter BUY quote** (0.1 SOL → tokens) - fallback for new tokens

**Failure:** ❌ **REJECT** - "Reference price unavailable"

### Guard 6: Position Sizing 📏

**Location:** `index.ts:2280-2289`

```typescript
const sizing = computePositionSize({
  baseBuySol: BUY_SOL, // 0.01
  minBuySol: MIN_BUY_SOL, // 0.005
  maxBuySol: MAX_BUY_SOL, // 0.05
  liquidityUsd,
  alphaSolSpent: signal.solSpent,
  signalAgeSec: signal.signalAgeSec ?? 0,
  watchlistRetry: source === 'watchlist',
});
const buySol = sizing.sizeSol;
```

**Output:** Position size between `MIN_BUY_SOL` (0.005) and `MAX_BUY_SOL` (0.05)

**No rejection** - Always calculates a size (may be reduced based on liquidity/age)

---

## 4. Birdeye Integration Details

### `validateBuyWithBirdeye()`

**Location:** `lib/birdeye.ts:264-311`

**Purpose:** Cross-check RPC BUY signal with Birdeye wallet trades

**Flow:**
1. Fetch wallet trades since `timestamp - 60` seconds
2. Find matching trade (same `txHash` or `mint`, `side === 'buy'`, within 2 minutes)
3. If found → Return `{ confirmed: true, trade }`
4. If SELL found for same mint → Return `{ confirmed: false }` (invalidates BUY)

**Status:** ⚠️ **Optional** - Bot proceeds even if validation fails

**Free Tier Limitation:**
- ❌ Wallet trades endpoint requires **Starter plan ($99/mo)** or higher
- ❌ Free tier returns **401 Unauthorized**
- ✅ Bot continues with RPC signal (primary method)

### `birdeyeStartupBackfill()`

**Location:** `index.ts:3385-3497`

**Purpose:** Fetch missed alpha trades from Birdeye on startup

**Window:** Last 30 minutes (`BACKFILL_WINDOW_SEC = 30 * 60`)

**Flow:**
1. For each active alpha, fetch trades since `now - 30 minutes`
2. Filter BUY trades only
3. Validate: `solSpent >= DUST_SOL_SPENT`, `tokenDelta >= MIN_ALPHA_TOKEN_BALANCE`
4. Check time window: `signalAgeSec <= MAX_SIGNAL_AGE_SEC` (180s)
5. Convert to `AlphaSignal` and execute copy trade

**Status:** ⚠️ **Disabled on free tier** (401 Unauthorized)

---

## 5. Liquidity & Price Guards - Full Implementation

### `getLiquidityResilient()`

**Location:** `lib/liquidity.ts`

**Flow:**
1. **Check cache** (10 seconds max age)
2. **Fetch DexScreener:** `https://api.dexscreener.com/latest/dex/tokens/{mint}`
3. **Select best pair:** Highest liquidity USD
4. **Extract data:**
   - `liquidityUsd` (from `liquidity.usd` or `liquidityUsd`)
   - `priceSol` (from `priceNative`)
   - `tokenName`, `tokenSymbol` (from `baseToken`)
   - `pairAddress` (for chart link)

**Error Handling:**
- **429 Rate Limit:** Retry with exponential backoff (up to 3 retries)
- **Timeout:** Return `{ ok: false, error: 'timeout' }`
- **No pairs:** Return `{ ok: false, liquidityUsd: 0 }`

**Fail-Open Behavior:**
- ❌ If DexScreener fails → `liquidityUsd = 0` → **REJECT** by liquidity guard
- ✅ No fallback to other sources (Jupiter doesn't provide liquidity data)

### `getQuotePrice()`

**Location:** `index.ts:1793-1884`

**Price Fetch Order:**
1. **DexScreener** (from `getLiquidityResilient()`)
2. **Jupiter SELL quote** (1M tokens → SOL)
3. **Jupiter BUY quote** (0.1 SOL → tokens) - fallback for new tokens

**Failure Handling:**
- ❌ All methods fail → Return `null` → **REJECT** by reference price guard

**Special Cases:**
- **New tokens (0 decimals):** BUY quote fallback handles this
- **Price sanity checks:** Filters out unreasonably small/large prices

---

## 6. Logging

### Log Prefixes

| Prefix | Location | Purpose |
|--------|----------|---------|
| `[CLASSIFY]` | `classifyAlphaSignals()` | BUY/SELL classification |
| `[GUARD]` | `executeCopyTradeFromSignal()` | Guard pass/fail |
| `[LIQ]` | `getLiquidityResilient()` | Liquidity fetch |
| `[PRICE]` | `getQuotePrice()` | Price fetch |
| `[SWAP]` | `swapSOLforToken()` | Swap execution |
| `[BIRDEYE]` | `validateBuyWithBirdeye()` | Birdeye validation |
| `[NOTIFY]` | `executeCopyTradeFromSignal()` | Telegram notifications |

### Successful BUY Log Flow

```
[CLASSIFY] BUY | Alpha: 8zkJ... | Mint: Eqgc... | solSpent=0.414 | tokens=15.4M
[BIRDEYE] RPC BUY signal confirmed by Birdeye | Eqgc... | Birdeye SOL: 0.4140
[NOTIFY] Sending "Alpha touched" message for Eqgc...
[GUARD] Time window | signalAge=45.2s | max=180s | ✅ PASS
[GUARD] Liquidity | liquidity=$33900 | min=$5000 | ✅ PASS | source=dexscreener
[GUARD] Price guard (DISABLED) | ratio=1.2x | (limit removed - entering anyway)
[SWAP] Buy swap completed | txid: [PAPER-BUY] | dex: jupiter
✅ Bought KITTYCASH EqgcKbi...
```

### Skipped Signal Log Flow

```
[CLASSIFY] BUY | Alpha: 8zkJ... | Mint: Eqgc... | solSpent=0.414
[GUARD] Time window | signalAge=250.5s | max=180s | ❌ FAIL
⛔️ Skipping Eqgc...: Signal too old (250.5s > 180s)
```

---

## 7. KITTYCASH Scenario Analysis

### Given: KITTYCASH (mint: `EqgcKbiKnVFf2LcyEAFBx3okfMZUHamabWNvRa14moon`)

**Alpha:** `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp` ✅  
**Alpha BUY:** ~0.414 SOL ✅  
**Liquidity:** $33.9K ✅  
**Taxes:** 0.5% ✅  
**Chart:** Clean early ramp ✅

### Expected Flow (with current config)

#### Step 1: Alpha Detection ✅
- **RPC `onLogs()`** detects transaction
- **OR** Polling backup (15s interval) catches it
- **OR** Startup scan (15 min window) catches it
- **OR** Birdeye backfill (30 min window) - ⚠️ **Disabled on free tier**

#### Step 2: Classification ✅
- **SOL spent:** 0.414 SOL >= 0.0001 (DUST_SOL_SPENT) → **PASS**
- **Token delta:** > 0 → **PASS**
- **Post balance:** >= 0.000001 (MIN_ALPHA_TOKEN_BALANCE) → **PASS**
- **Output:** `[CLASSIFY] BUY | Alpha: 8zkJ... | Mint: Eqgc... | solSpent=0.414`

#### Step 3: Birdeye Validation ⚠️
- **Status:** Optional (proceeds even if fails)
- **Free tier:** 401 Unauthorized → Validation skipped
- **Impact:** None (RPC signal is primary)

#### Step 4: Guards

**Guard 1: Time Window ✅**
- **Check:** `signalAgeSec <= 180`
- **Expected:** ✅ **PASS** (if detected within 3 minutes)

**Guard 2: Liquidity ✅**
- **Check:** `liquidityUsd >= 5000`
- **Given:** $33.9K >= $5K → ✅ **PASS**
- **Fetch:** DexScreener API
- **Potential Issue:** ⚠️ DexScreener 429 rate limit → Retry once, then fail → **REJECT**

**Guard 3: Rug Checks ✅**
- **Authority:** Must be revoked → ✅ **PASS** (assumed)
- **Tax:** 0.5% < 5% → ✅ **PASS**
- **Price Impact:** < 30% → ✅ **PASS** (assumed)
- **Route:** Valid route exists → ✅ **PASS** (assumed)

**Guard 4: Price Guard ✅**
- **Status:** **DISABLED** → ✅ **PASS** (no limit)

**Guard 5: Reference Price ✅**
- **Check:** Valid price from rug checks or `getQuotePrice()`
- **Expected:** ✅ **PASS** (rug checks provide entry price)

**Guard 6: Position Sizing ✅**
- **Output:** 0.005 - 0.05 SOL (based on liquidity/age)
- **No rejection** → ✅ **PASS**

#### Step 5: Execution ✅
- **Swap:** Jupiter swap (paper mode)
- **Expected:** ✅ **SUCCESS** → "✅ Bought KITTYCASH"

---

## 8. Potential Failure Points for KITTYCASH

### ❌ Failure Point 1: Signal Age > 180s

**Scenario:** Bot detects transaction 4+ minutes after alpha buy

**Log:**
```
[GUARD] Time window | signalAge=250.5s | max=180s | ❌ FAIL
⛔️ Skipping Eqgc...: Signal too old (250.5s > 180s)
```

**Fix:** Increase `MAX_SIGNAL_AGE_SEC` or improve detection speed

### ❌ Failure Point 2: DexScreener Rate Limit

**Scenario:** DexScreener returns 429 (rate limit) during liquidity fetch

**Log:**
```
[LIQ] DexScreener failed: HTTP 429 (rate limit) for EqgcKbiK... - retrying...
[LIQ] DexScreener failed after retries for EqgcKbiK...: dexscreener-429
[GUARD] Liquidity | liquidity=$0 | min=$5000 | ❌ FAIL
⛔️ Skipping Eqgc...: Liquidity $0.00 < $5,000.00
```

**Fix:** 
- Add longer retry delay for 429 errors
- Add fallback liquidity source (Birdeye, Jupiter)
- Reduce cache age to minimize API calls

### ❌ Failure Point 3: Transaction Not Detected

**Scenario:** `onLogs()` misses transaction, polling backup misses, startup scan misses

**Log:** No logs for this mint

**Fix:**
- Increase polling frequency (currently 15s)
- Increase polling window (currently 30s)
- Increase startup scan window (currently 15 min)
- Enable Birdeye backfill (requires paid plan)

### ❌ Failure Point 4: Alpha Not in Account Keys

**Scenario:** Alpha uses DEX aggregator, not direct signer

**Log:**
```
[CLASSIFY] alpha 8zkJ... not in account keys for tx ..., checking token balances...
```

**Impact:** 
- ✅ Still detects via token balance change
- ⚠️ `solSpent` may be 0 (relies on Birdeye to update)
- ⚠️ Birdeye validation fails on free tier → `solSpent` remains 0

**Fix:**
- Enable Birdeye paid plan to get actual SOL spent
- OR improve RPC detection to catch aggregator swaps

### ❌ Failure Point 5: Rug Checks Fail

**Scenario:** Authority not revoked, high tax, or no route

**Log:**
```
⛔️ Skipping Eqgc... due to: authority not revoked
```

**Fix:** Adjust `REQUIRE_AUTHORITY_REVOKED`, `MAX_TAX_BPS`, or `MAX_PRICE_IMPACT_BPS`

---

## 9. Log Evidence for KITTYCASH

**From VM logs (2025-11-16 23:02-23:03):**

```
[DBG][QUOTE] url = https://lite-api.jup.ag/swap/v1/quote?inputMint=EqgcKbiKnVFf2LcyEAFBx3okfMZUHamabWNvRa14moon&outputMint=So11111111111111111111111111111111111111112&amount=1000000&slippageBps=1000
[LIQ] DexScreener failed: HTTP 429 (rate limit) for EqgcKbiK... - retrying...
[LIQ] DexScreener failed after retries for EqgcKbiK...: dexscreener-429
```

**Analysis:**
- ✅ Bot **DID detect** KITTYCASH (attempting quotes)
- ❌ DexScreener **rate limited** (429 error)
- ❌ Liquidity fetch **failed** → `liquidityUsd = 0`
- ❌ Liquidity guard **REJECTED** → "Liquidity $0 < $5,000"

**Root Cause:** DexScreener rate limit during liquidity fetch

**Solution:**
1. Add longer retry delay for 429 errors
2. Add fallback liquidity source (Birdeye token snapshot)
3. Reduce cache age to minimize API calls
4. Add exponential backoff for 429 errors

---

## 10. Recommendations

### Immediate Fixes

1. **Fix DexScreener Rate Limit Handling**
   - Add exponential backoff for 429 errors (currently only 1 retry)
   - Add Birdeye fallback for liquidity (if API key available)
   - Increase cache age to reduce API calls

2. **Improve Detection Speed**
   - Reduce polling interval (currently 15s → 10s)
   - Increase polling window (currently 30s → 60s)
   - Increase startup scan window (currently 15 min → 30 min)

3. **Enable Birdeye Backfill** (if paid plan available)
   - Upgrade to Starter plan ($99/mo) for wallet trades endpoint
   - Enables 30-minute backfill on startup
   - Provides actual SOL spent for aggregator swaps

### Long-Term Improvements

1. **Multiple Liquidity Sources**
   - DexScreener (primary)
   - Birdeye token snapshot (fallback)
   - Jupiter quote-based liquidity estimate (last resort)

2. **Enhanced Rate Limit Handling**
   - Global rate limit tracking
   - Intelligent request throttling
   - Circuit breaker pattern

3. **Detection Redundancy**
   - Multiple RPC endpoints
   - WebSocket subscriptions (if available)
   - Birdeye real-time feed (if available)

---

**End of Profile**

