#!/bin/bash
# PM2 Verification Script

echo "🔍 Alpha Snipes PM2 Health Check"
echo "================================"
echo ""

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "✅ PM2 is installed"
    pm2 --version
else
    echo "❌ PM2 is NOT installed"
    echo "   Run: sudo npm install -g pm2"
    exit 1
fi

echo ""

# Check if bot is running
if pm2 list | grep -q "alpha-snipes-paper"; then
    echo "✅ Bot is running under PM2"
    pm2 list
else
    echo "❌ Bot is NOT running under PM2"
    echo "   Run: pm2 start ecosystem.config.js"
    exit 1
fi

echo ""
echo "📊 Process Details:"
pm2 info alpha-snipes-paper 2>/dev/null || echo "   No details available"

echo ""
echo "📝 Recent Logs (last 10 lines):"
pm2 logs alpha-snipes-paper --lines 10 --nostream

echo ""
echo "✅ PM2 Health Check Complete!"
echo ""
echo "Useful commands:"
echo "  pm2 status                     # Check status"
echo "  pm2 logs alpha-snipes-paper    # View logs"
echo "  pm2 restart alpha-snipes-paper # Restart bot"
echo "  pm2 monit                      # Live monitoring"


