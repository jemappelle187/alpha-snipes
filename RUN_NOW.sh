#!/bin/bash
# Quick start script - runs bot in background without PM2

cd "/Users/emmanuelyeboah/Projects/Alpha Snipes"

# Stop any existing instances
pkill -f "tsx index.ts" 2>/dev/null || true
sleep 1

# Start in background with logging
echo "🚀 Starting Alpha Snipes Bot..."
nohup npx tsx index.ts > logs/bot_$(date +%Y%m%d_%H%M%S).log 2>&1 &

BOT_PID=$!
echo "✅ Bot started with PID: $BOT_PID"
echo "📝 Logs: logs/bot_*.log"
echo ""
echo "Commands:"
echo "  View logs:  tail -f logs/bot_*.log"
echo "  Stop bot:   kill $BOT_PID"
echo "  Or:         pkill -f 'tsx index.ts'"
echo ""
echo "📱 Check your Telegram channel for [PAPER] Bot Started message!"


