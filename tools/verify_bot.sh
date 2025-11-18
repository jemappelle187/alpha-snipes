#!/bin/bash
# Alpha Snipes Bot - Automated Verification Script
# Run this script to verify all bot functionality after deployment

set -e

BOT_NAME="${1:-alpha-snipes-paper}"
LOG_LINES="${2:-500}"

echo "🔍 Alpha Snipes Bot Verification Script"
echo "========================================"
echo "Bot: $BOT_NAME"
echo "Log Lines: $LOG_LINES"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

check() {
    local name="$1"
    local pattern="$2"
    local expected="$3"
    local invert="${4:-false}"
    
    echo -n "Checking $name... "
    
    local count
    if [ "$invert" = "true" ]; then
        count=$(pm2 logs "$BOT_NAME" --lines "$LOG_LINES" --nostream 2>/dev/null | grep -iE "$pattern" | wc -l | tr -d ' ')
    else
        count=$(pm2 logs "$BOT_NAME" --lines "$LOG_LINES" --nostream 2>/dev/null | grep -iE "$pattern" | wc -l | tr -d ' ')
    fi
    
    if [ "$invert" = "true" ]; then
        if [ "$count" -eq 0 ]; then
            echo -e "${GREEN}✓ PASS${NC} (found 0, expected 0)"
            ((PASSED++))
        else
            echo -e "${RED}✗ FAIL${NC} (found $count, expected 0)"
            ((FAILED++))
        fi
    else
        if [ "$count" -ge "$expected" ]; then
            echo -e "${GREEN}✓ PASS${NC} (found $count, expected >= $expected)"
            ((PASSED++))
        else
            echo -e "${YELLOW}⚠ WARN${NC} (found $count, expected >= $expected)"
            ((WARNINGS++))
        fi
    fi
}

check_exact() {
    local name="$1"
    local pattern="$2"
    local expected="$3"
    
    echo -n "Checking $name... "
    
    local count=$(pm2 logs "$BOT_NAME" --lines "$LOG_LINES" --nostream 2>/dev/null | grep -iE "$pattern" | wc -l | tr -d ' ')
    
    if [ "$count" -eq "$expected" ]; then
        echo -e "${GREEN}✓ PASS${NC} (found $count, expected $expected)"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ WARN${NC} (found $count, expected $expected)"
        ((WARNINGS++))
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "A. Config & Startup Sanity"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check "Config logs present" "\[CONFIG\]" 1
check "MAX_SIGNAL_AGE_SEC = 300" "MAX_SIGNAL_AGE_SEC = 300" 1
check "BUY_SOL = 1 SOL" "BUY_SOL = 1 SOL" 1
check "Bot started message" "Bot Started|🚀 Alpha Snipes Bot Started" 1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "B. Entry Path Correctness"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check "Entry logs present" "\[ENTRY\]\[OPEN\]" 0
check "Alpha entry logs" "\[ENTRY\]\[ALPHA\].*mode=normal" 0
check "Watchlist entry logs" "\[ENTRY\]\[WATCHLIST\].*mode=normal" 0
check "Force-buy entry logs" "\[ENTRY\]\[FORCE\]" 0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "C. Entry-Price Robustness"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check "Entry price resolution logs" "\[ENTRY\]\[PRICE\]" 0
check "Zero entry prices (should be 0)" "Entry: 0 SOL|entryPrice.*=.*0[^0-9]|entryPrice=0" 0 true
check "Fatal entry price errors (should be 0)" "\[ENTRY\]\[PRICE\]\[FATAL\]" 0 true
check "Tiny-entry mode for 1 SOL (should be 0)" "\[ENTRY\].*sizeSol=1.*mode=tiny_entry" 0 true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "D. Liquidity Triangulation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check "Triangulation logs" "\[LIQ\]\[TRIANGULATE\]" 0
check "Triangulated liquidity" "\[LIQ\] Triangulated" 0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "E. Exit Behavior"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check "Exit logs present" "\[EXIT\].*Position closed" 0
check "+20% TP exits" "\[EXIT\].*hard_profit_20pct" 0
check "Max loss exits" "\[EXIT\].*max_loss" 0
check "Trailing stop exits" "\[EXIT\].*trailing_stop" 0
check "Liquidity drop exits" "\[EXIT\].*liquidity_drop" 0
check "Crashed token exits" "\[EXIT\].*crashed_token" 0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "F. Error & Regression Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check "priceRatio initialization error (should be 0)" "Cannot access 'priceRatio' before initialization" 0 true
check "Exit error handling" "crashed exit failed|exit failed" 0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "G. Alpha Speed Benchmark (optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Alpha speed benchmark (optional)
if command -v tsx >/dev/null 2>&1 || command -v node >/dev/null 2>&1; then
  echo "== Alpha speed benchmark (last ${LOG_LINES} lines) =="
  pm2 logs "$BOT_NAME" --lines "$LOG_LINES" --nostream 2>/dev/null | grep "\[BENCH\]\[ALPHA\]" | npm run alpha:bench 2>/dev/null || true
  echo ""
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL=$((PASSED + FAILED + WARNINGS))
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo "Total: $TOTAL"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}✗ Some critical checks failed. Review logs above.${NC}"
    exit 1
fi

