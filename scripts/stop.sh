#!/bin/bash
# Stop Alpha Snipes bot (local)

echo "🔍 Checking for running instances..."

# Find and kill any running instances
pids=$(ps aux | grep -E "tsx index.ts|alpha.snipes" | grep -v grep | awk '{print $2}')

if [ -z "$pids" ]; then
  echo "✅ No running instances found"
else
  echo "🛑 Stopping processes: $pids"
  kill $pids 2>/dev/null
  sleep 1
fi

# Remove lock file
rm -f /tmp/alpha_snipes.lock

echo "✅ Cleanup complete. You can now run 'npm start'"

