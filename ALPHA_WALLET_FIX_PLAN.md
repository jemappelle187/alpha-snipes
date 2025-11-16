# Alpha Wallet Buy/Sell Configuration Fix Plan

## Current Status Analysis

### Alpha Wallet: `8zkJmeQS1J3GUkPvfboeT76bwojADU6dyTZsCBiMdCVp`

**Registry Status:**
- ✅ Active: YES
- ❌ Last Seen: **NEVER** (This is the problem!)
- ❌ Signals: 0

**This means the bot has NEVER detected a signal from this wallet!**

---

## Current Configuration

| Setting | Value | Impact |
|---------|-------|--------|
| `MAX_SIGNAL_AGE_SEC` | 180s (3 min) | Signals older than 3 min are skipped |
| `DUST_SOL_SPENT` | 0.001 SOL | Minimum SOL spent to trigger BUY |
| `MIN_ALPHA_TOKEN_BALANCE` | 1000 tokens | Minimum token balance after BUY |
| `MIN_SIZE_INCREASE_RATIO` | 0.1x | Minimum size increase if existing position |
| `MIN_LIQUIDITY_USD` | $10,000 | Minimum liquidity to trade |
| `BUY_SOL` | 0.01 SOL | Bot's buy size |
| `MAX_ALPHA_ENTRY_MULTIPLIER` | 2x | Max price vs alpha entry |

---

## Problems Identified

### 1. **BUY Detection Issues**

#### Problem A: Alpha Not Detected
- **Symptom:** "Last Seen: Never" despite active transactions
- **Possible Causes:**
  1. `onLogs()` subscription not working
  2. Alpha not in account keys (DEX aggregator swaps)
  3. Transactions filtered out by guards
  4. Signal age too old when processed

#### Problem B: Filters Too Strict
- `MIN_LIQUIDITY_USD: $10,000` - May filter out new tokens
- `DUST_SOL_SPENT: 0.001 SOL` - May miss small buys
- `MIN_ALPHA_TOKEN_BALANCE: 1000` - May miss low-precision tokens

### 2. **SELL Detection Issues**

#### Current Behavior:
- ✅ Bot **detects** SELL signals (logs them)
- ❌ Bot **does NOT** exit positions on alpha SELL
- ❌ Bot only exits based on price targets (+50%, max loss, etc.)

#### What Should Happen:
- When alpha wallet SELLs a token, bot should **immediately exit** that position
- This is the core of "copy trading" - copy both buys AND sells

---

## Fix Plan

### Phase 1: Fix BUY Detection

#### Step 1: Verify Alpha Wallet Monitoring
- [ ] Check if `onLogs()` subscription is active
- [ ] Verify alpha wallet is in `ACTIVE_ALPHAS` list
- [ ] Test with recent transaction

#### Step 2: Relax Filters (Temporarily for Testing)
- [ ] Reduce `MIN_LIQUIDITY_USD` to $1,000 (from $10,000)
- [ ] Reduce `DUST_SOL_SPENT` to 0.0001 SOL (from 0.001)
- [ ] Reduce `MIN_ALPHA_TOKEN_BALANCE` to 100 (from 1000)
- [ ] Increase `MAX_SIGNAL_AGE_SEC` to 300s (5 min) for testing

#### Step 3: Improve Detection for Non-Account-Key Transactions
- [ ] Ensure Birdeye validation works when alpha not in account keys
- [ ] Add fallback detection using token balance changes only

### Phase 2: Implement SELL-Based Exits

#### Step 1: Track Alpha Positions
- [ ] Store which alpha wallet bought which token
- [ ] Map: `{ mint: string, alpha: string, entryTime: number }`

#### Step 2: Detect Alpha SELLs
- [ ] When SELL detected, check if we have open position for that mint
- [ ] If yes, immediately exit (don't wait for price targets)

#### Step 3: Exit Logic
```typescript
// When alpha SELL detected:
if (openPositions[mint] && openPositions[mint].alpha === alphaWallet) {
  // Alpha sold - exit immediately
  await exitPosition(mint, 'alpha_sell');
}
```

### Phase 3: Enhanced Monitoring

#### Step 1: Better Logging
- [ ] Log all alpha transactions (BUY and SELL)
- [ ] Log why transactions are filtered out
- [ ] Track detection success rate

#### Step 2: Health Checks
- [ ] Monitor if alpha wallet is being watched
- [ ] Alert if no signals detected for X hours
- [ ] Verify `onLogs()` subscriptions are active

---

## Testing Plan

### Test 1: Verify Alpha Monitoring
```bash
# Check if alpha is being watched
pm2 logs alpha-snipes-paper | grep "Watching active.*8zkJ"
```

### Test 2: Test BUY Detection
- Wait for alpha to buy a new token
- Check logs for detection
- Verify signal passes all guards

### Test 3: Test SELL Detection
- Open a position manually
- Wait for alpha to sell
- Verify bot exits immediately

---

## Immediate Actions

1. **Check why alpha shows "Last Seen: Never"**
   - Verify `onLogs()` subscription
   - Check recent transactions
   - Review filter logs

2. **Relax filters for testing**
   - Lower liquidity threshold
   - Lower dust thresholds
   - Increase signal age window

3. **Implement SELL-based exits**
   - Track alpha positions
   - Exit on alpha SELL
   - Test with known SELL transaction

---

**Next Steps:** Let's start with Phase 1 - fixing BUY detection.

