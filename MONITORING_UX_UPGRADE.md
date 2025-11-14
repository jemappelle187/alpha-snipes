# Monitoring UX Upgrade

## Overview
Comprehensive activity tracking, heartbeat system, market pulse, and silent period watchdog for better bot visibility and health monitoring.

## Features Implemented

### 1. Activity Event Tracking

**Event Types:**
```typescript
type BotEvent =
  | { t: number; kind: 'touch'; mint: string; alpha: string; tx: string }
  | { t: number; kind: 'buy'; mint: string; alpha: string; sol: number; usd: number; tx: string }
  | { t: number; kind: 'skip'; mint?: string; alpha?: string; reason: string }
  | { t: number; kind: 'exit'; mint: string; pnlUsd: number; pnlPct: number; tx: string }
  | { t: number; kind: 'partial'; mint: string; usd: number; pnlPct: number; tx: string };
```

**Tracked Events:**
- `touch` - Alpha wallet touched a new mint
- `buy` - Successfully bought a token
- `skip` - Token skipped (with reason)
- `exit` - Position closed (trailing stop or sentry)
- `partial` - Partial TP executed

**Rolling Buffer:**
- Last 50 events kept in memory
- Oldest events automatically purged
- No disk I/O overhead

---

### 2. Periodic Heartbeat (Every 15 minutes)

**Default:** Every 15 minutes (configurable via `HEARTBEAT_EVERY_MIN`)

**Example Message:**
```
[BOT] 💓 Heartbeat
• Watching: 3 active, 4 candidates
• Last activity: 2m
• Last signal: 8m
• Last trade: 45m

📊 Market pulse (latest 5):
✅ 2m | buy   | EPjFWd…Dt1v for 0.010 SOL ($2.38)
👀 8m | touch | HU3Knq…8XBh by 97vkwM…bWor
⛔ 12m | skip  | mint authority not revoked
🛑 45m | exit  | Gfg3im…FmzU9 +$0.40 (+17.0%)
💡 46m | pTP   | Gfg3im…FmzU9 $1.19 (+15.0%)
```

**Shows:**
- Number of alphas being watched
- Time since last activity/signal/trade
- Recent events (configurable count)
- Event timeline with timestamps

**Benefits:**
- ✅ Proof bot is alive and monitoring
- ✅ Quick glance at recent activity
- ✅ Identify slow periods
- ✅ Verify bot health without manual commands

---

### 3. Silent Period Watchdog

**Threshold:** 60 minutes of no signals (configurable via `SILENT_ALERT_MIN`)

**Triggers when:**
- No `touch` or `buy` events for 60+ minutes
- Only fires once until activity resumes

**Example Alert:**
```
[BOT] 🤫 Silent period
No new signals for 62 minutes.

• Watching 3 active, 4 candidates
• Tip: increase alpha list or relax filters if desired.
```

**Auto-Recovery:**
- Alert sent once
- Flag resets when new signal detected
- No repeated spam

**Benefits:**
- ✅ Early warning of inactivity
- ✅ Prompts to check alpha wallet selection
- ✅ Helps identify market slow periods
- ✅ Prevents "is it working?" anxiety

---

### 4. `/status` Command

**Usage:**
```
/status
```
or
```
/health
```

**Response:** Same as periodic heartbeat

**Use Cases:**
- Quick health check before leaving computer
- Verify bot after configuration changes
- Check activity after quiet periods
- Share status with team

---

### 5. Configuration

**New Environment Variables:**

```bash
# === Monitoring & Heartbeat ===
HEARTBEAT_EVERY_MIN=15        # how often to send heartbeat
SILENT_ALERT_MIN=60           # alert if no signals for this long
PULSE_MAX_ROWS=5              # how many recent events to include
```

**Defaults:**
- Heartbeat: 15 minutes
- Silent alert: 60 minutes
- Pulse rows: 5 events

**To Disable:**
```bash
HEARTBEAT_EVERY_MIN=0  # Disables periodic heartbeat (on-demand still works)
```

---

## Technical Implementation

### Activity Timestamps
```typescript
let LAST_ACTIVITY_AT = Date.now(); // any event
let LAST_SIGNAL_AT = Date.now();   // touch or buy
let LAST_TRADE_AT = 0;             // buy, exit, or partial
let SILENT_ALERT_SENT = false;     // idempotency flag
```

### Event Instrumentation Points

**Alpha Touched** (line ~996):
```typescript
pushEvent({ t: Date.now(), kind: 'touch', mint, alpha, tx });
```

**Buy Success** (line ~1093):
```typescript
pushEvent({ t: Date.now(), kind: 'buy', mint, alpha, sol, usd, tx });
```

**Skip** (line ~1033):
```typescript
pushEvent({ t: Date.now(), kind: 'skip', mint, alpha, reason });
```

**Partial TP** (line ~1152):
```typescript
pushEvent({ t: Date.now(), kind: 'partial', mint, usd, pnlPct, tx });
```

**Exit** (lines ~1218, ~1301):
```typescript
pushEvent({ t: Date.now(), kind: 'exit', mint, pnlUsd, pnlPct, tx });
```

### Heartbeat Timer
```typescript
if (HEARTBEAT_EVERY_MIN > 0) {
  setInterval(sendHeartbeat, HEARTBEAT_EVERY_MIN * 60_000);
}
```

### Watchdog Timer
```typescript
setInterval(async () => {
  const idleMin = (Date.now() - LAST_SIGNAL_AT) / 60000;
  if (!SILENT_ALERT_SENT && idleMin >= SILENT_ALERT_MIN) {
    SILENT_ALERT_SENT = true;
    await alert('Silent period alert...');
  }
  // Reset flag on new activity
  if (SILENT_ALERT_SENT && idleMin < SILENT_ALERT_MIN) {
    SILENT_ALERT_SENT = false;
  }
}, 60_000); // Check every minute
```

---

## Example Output

### Heartbeat (Active Bot)
```
[BOT] 💓 Heartbeat
• Watching: 3 active, 4 candidates
• Last activity: <1m
• Last signal: 2m
• Last trade: 15m

📊 Market pulse (latest 5):
✅ 2m | buy   | EPjFWd…Dt1v for 0.010 SOL ($2.38)
👀 3m | touch | HU3Knq…8XBh by 97vkwM…bWor
👀 5m | touch | Gfg3im…FmzU9 by 8zkJme…dCVp
⛔ 8m | skip  | freeze authority not revoked
🛑 15m | exit  | 3zvC5z…Jbm7x +$0.42 (+17.8%)
```

### Heartbeat (Quiet Period)
```
[BOT] 💓 Heartbeat
• Watching: 3 active, 4 candidates
• Last activity: 35m
• Last signal: 35m
• Last trade: 2h

📊 Market pulse (latest 5):
⛔ 20m | skip  | price impact too high
👀 35m | touch | HWQGte…moon by 4rNgv2…UHrA
⛔ 40m | skip  | high tax
⛔ 48m | skip  | no route
🛑 2h | exit  | J8dLyp…2gjL -$0.15 (-6.2%)
```

### Silent Period Alert
```
[BOT] 🤫 Silent period
No new signals for 62 minutes.

• Watching 3 active, 4 candidates
• Tip: increase alpha list or relax filters if desired.
```

---

## Benefits

### Operational Visibility
✅ **Know bot is alive** - Periodic heartbeat proves it's running  
✅ **Activity at a glance** - See recent events quickly  
✅ **Early warnings** - Silent period alerts prompt action  
✅ **On-demand checks** - /status anytime  

### Troubleshooting
✅ **Identify issues** - See if alphas are inactive  
✅ **Filter tuning** - Know if skips are too aggressive  
✅ **Market conditions** - Understand slow vs fast periods  
✅ **Performance tracking** - See win/loss patterns  

### Team Coordination
✅ **Share status** - Forward /status to team  
✅ **Historical record** - Heartbeats in Telegram history  
✅ **Confidence** - Regular updates build trust  

---

## Configuration Options

### Aggressive Monitoring (More frequent)
```bash
HEARTBEAT_EVERY_MIN=5     # Every 5 minutes
SILENT_ALERT_MIN=30       # Alert after 30 minutes
PULSE_MAX_ROWS=10         # Show 10 events
```

### Conservative Monitoring (Less frequent)
```bash
HEARTBEAT_EVERY_MIN=30    # Every 30 minutes
SILENT_ALERT_MIN=120      # Alert after 2 hours
PULSE_MAX_ROWS=3          # Show 3 events
```

### Disable Heartbeat (Keep watchdog)
```bash
HEARTBEAT_EVERY_MIN=0     # No periodic heartbeat
SILENT_ALERT_MIN=60       # Still alert on silence
```
*Note: /status still works*

---

## Event Timeline Format

```
[emoji] [time] | [kind] | [details]
```

**Examples:**
```
👀 2m | touch | EPjFWd…Dt1v by 97vkwM…bWor
✅ 5m | buy   | HU3Knq…8XBh for 0.010 SOL ($2.38)
💡 8m | pTP   | Gfg3im…FmzU9 $1.19 (+15.0%)
🛑 12m | exit  | 3zvC5z…Jbm7x +$0.40 (+17.0%)
⛔ 15m | skip  | mint authority not revoked
```

**Time Format:**
- `<1m` - Less than 1 minute
- `5m` - 5 minutes
- Shows relative time, not absolute timestamp

---

## Testing

### Immediate Tests
```bash
# In Telegram
/status    → See current heartbeat
/help      → Verify /status is listed
```

### Wait for Timers
```bash
# After 15 minutes (default)
→ [BOT] 💓 Heartbeat appears automatically

# After 60 minutes of no signals
→ [BOT] 🤫 Silent period alert (if no activity)
```

### Trigger Activity
```bash
# When alpha touches a mint
→ Event tracked
→ Next /status shows it in pulse
→ Silent alert resets if it was active
```

---

## Integration Points

### Existing Systems
- ✅ Works with existing Telegram alerts
- ✅ Compatible with /open and /pnl commands
- ✅ Uses existing formatUsd and short helpers
- ✅ Respects IS_PAPER flag

### Timers Summary
```
Every 5min:  Daily recap check (midnight only)
Every 15min: Heartbeat (if enabled)
Every 60sec: Silent watchdog check
Every 30sec: Alpha wallet refresh
Every 60sec: Refresh watchers
```

---

## Files Modified

### `index.ts`
- Added BotEvent types
- Added RECENT buffer and timestamps
- Added pushEvent() and ago() helpers
- Instrumented 5 event points (touch, buy, skip, partial, exit)
- Added buildPulseBlock() function
- Added sendHeartbeat() function
- Added heartbeat timer
- Added silent watchdog timer
- Added /status command

### `env.template`
- Added HEARTBEAT_EVERY_MIN=15
- Added SILENT_ALERT_MIN=60
- Added PULSE_MAX_ROWS=5

---

## Migration Notes

### No Breaking Changes
- All existing functionality preserved
- Timers run in background
- No performance impact
- Events tracked passively

### Memory Footprint
- ~50 events × ~100 bytes = ~5KB
- Negligible compared to bot's overall memory
- Auto-pruning keeps it bounded

---

## Bot Status

```
┌─────────────────────┬─────────┬─────────┐
│ alpha-snipes-paper  │ online  │ ✅      │
├─────────────────────┼─────────┼─────────┤
│ PID: 32753          │ Active  │ 54 ↺    │
│ Mode: PAPER         │ Working │ Healthy │
│ Monitoring: 3+4     │ Stable  │ Ready   │
│ Heartbeat: 15m      │ Active  │ ✅      │
│ Watchdog: 60m       │ Armed   │ ✅      │
└─────────────────────┴─────────┴─────────┘
```

### Timers Active
- ✅ Heartbeat: Every 15 minutes
- ✅ Watchdog: Check every 1 minute
- ✅ Daily recap: Check every 5 minutes (midnight only)
- ✅ Alpha refresh: Every 30 seconds
- ✅ Watcher refresh: Every 60 seconds

---

## Command Reference

| Command | Description |
|---------|-------------|
| `/status` or `/health` | On-demand heartbeat with market pulse |
| `/help` | Updated to include /status |
| `/open` | View open positions (unrealized PnL) |
| `/pnl [24h\|today]` | View realized PnL |

---

## What Users Will See

### Every 15 Minutes (Automatic)
```
[BOT] 💓 Heartbeat
• Watching: 3 active, 4 candidates
• Last activity: 2m
• Last signal: 5m
• Last trade: 18m

📊 Market pulse (latest 5):
[recent events listed]
```

### After 60 Minutes of Silence (Once)
```
[BOT] 🤫 Silent period
No new signals for 62 minutes.

• Watching 3 active, 4 candidates
• Tip: increase alpha list or relax filters if desired.
```

### On-Demand (`/status`)
```
[BOT] 💓 Heartbeat
[same as periodic heartbeat]
```

---

## Troubleshooting Scenarios

### Scenario 1: Bot seems inactive
```bash
/status
→ Last activity: <1m ✅ (bot is working)
→ Last signal: 2h ⚠️ (alphas may be inactive)
```
**Action:** Check alpha wallet activity on Solscan

### Scenario 2: Too many skips
```bash
/status
→ Pulse shows: 5 skips in a row
→ All say "authority not revoked"
```
**Action:** Consider relaxing REQUIRE_AUTHORITY_REVOKED if desired

### Scenario 3: Silent alert triggered
```bash
[BOT] 🤫 Silent period (62 minutes)
```
**Action:**
- Check if alpha wallets are still active
- Consider adding more alphas with /add
- Market may be slow (normal)

---

## Performance Impact

### CPU: Negligible
- Event tracking: array push (O(1))
- Heartbeat: once per 15min
- Watchdog: simple comparison every 60sec

### Memory: Minimal
- 50 events × ~100 bytes = 5KB
- Auto-pruning prevents growth

### Network: Minimal
- 1 Telegram message per 15min
- Silent alert: at most 1 per quiet period
- /status: only on user request

---

## Testing Checklist

### Immediate
- ✅ Bot started successfully (PID: 32753)
- ✅ No crashes on startup
- ✅ `/status` command registered
- ✅ Event tracking initialized

### Within 15 Minutes
- ⏳ First heartbeat should appear
- ⏳ Should show recent events (if any)

### Within 60 Minutes
- ⏳ If no signals, watchdog alert fires
- ⏳ Alert only sent once

### User Commands
```bash
/status   → Heartbeat on demand ✅
/help     → Shows /status in list ✅
```

---

## Example Timeline

### 00:00 - Bot Start
```
🚀 Bot started
Last activity: <1m
Last signal: <1m
```

### 00:15 - First Heartbeat
```
[BOT] 💓 Heartbeat
Last activity: 5m
Last signal: 8m
Market pulse: 2 touches, 1 buy
```

### 00:30 - Second Heartbeat
```
[BOT] 💓 Heartbeat
Last activity: 3m
Last signal: 12m
Market pulse: 3 skips, 1 touch
```

### 01:00 - Silent Alert (if no signals)
```
[BOT] 🤫 Silent period
No new signals for 60 minutes
```

### 01:30 - Heartbeat (after silence)
```
[BOT] 💓 Heartbeat
Last activity: <1m
Last signal: 92m ⚠️
[shows only skips in pulse]
```

---

## Future Enhancements (Optional)

1. **Hourly Summary**: Aggregate stats every hour
2. **Performance Graph**: Visual charts in Telegram
3. **Alert Thresholds**: Warn if win rate drops below X%
4. **Alpha Leaderboard**: Best performing alpha in pulse
5. **Event Export**: Download RECENT as JSON

---

## Files Modified

- `index.ts`: All monitoring features
- `env.template`: Monitoring configuration

---

## Summary

This upgrade adds **comprehensive visibility** into bot health and activity:

1. **Periodic Heartbeat** - Automated status updates
2. **Market Pulse** - Recent event timeline
3. **Silent Watchdog** - Early warning system
4. **On-Demand Status** - /status command

**The bot now provides full operational transparency!** 🎯💓

---

## Quick Start

```bash
# In Telegram, try:
/status

# You should see:
[BOT] 💓 Heartbeat
• Watching: 3 active, 4 candidates
• Last activity: <1m
• Last signal: <1m

📊 Market pulse (latest 5):
— no recent events —
```

**Wait 15 minutes for first automatic heartbeat!** ⏰
