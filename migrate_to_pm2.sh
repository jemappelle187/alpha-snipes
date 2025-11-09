#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="/Users/emmanuelyeboah/Projects/Alpha Snipes"
APP_NAME="alpha-snipes-paper"

echo "▶ PM2 migration starting…"
cd "$PROJECT_DIR"

# 0) Check PM2
if ! command -v pm2 >/dev/null 2>&1; then
  echo "❌ PM2 not installed."
  echo "Run this once in your terminal, then re-run this script:"
  echo "    sudo npm install -g pm2"
  exit 1
fi

# 1) Kill any foreground instances
echo "▶ Stopping foreground bot instances (if any)…"
pkill -f "tsx index.ts" || true

# 2) Start under PM2
echo "▶ Starting $APP_NAME with PM2…"
# Try to start only our app if ecosystem exists; otherwise just start the file
if [ -f "ecosystem.config.js" ]; then
  # If already running, restart; else start
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME"
  else
    pm2 start ecosystem.config.js --only "$APP_NAME"
  fi
else
  # Fallback: direct start
  pm2 start tsx --name "$APP_NAME" -- index.ts
fi

# 3) Save current PM2 process list
echo "▶ Saving PM2 process list…"
pm2 save

# 4) Enable startup on reboot (requires sudo outside Cursor)
echo "▶ Preparing startup on reboot…"
STARTUP_CMD="$(pm2 startup | tail -n 1 || true)"
if [ -n "$STARTUP_CMD" ]; then
  echo "⚠️  Copy-paste this in your own terminal (Cursor cannot run sudo):"
  echo ""
  echo "    $STARTUP_CMD"
  echo ""
  echo "Then run:"
  echo "    pm2 save"
else
  echo "ℹ️ pm2 startup already configured or not required."
fi

# 5) Show status and recent logs
echo "▶ Status:"
pm2 status "$APP_NAME" || true

echo "▶ Tail logs (10 lines):"
pm2 logs "$APP_NAME" --lines 10 --raw --nostream || true

echo "✅ Migration script completed. If you ran the sudo startup command, remember to 'pm2 save' afterwards."


