#!/bin/bash
# Complete PM2 Setup Script
# Run this after installing PM2: sudo npm install -g pm2

echo "🚀 Alpha Snipes - PM2 Migration Script"
echo "========================================"
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed!"
    echo ""
    echo "Please run first:"
    echo "  sudo npm install -g pm2"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ PM2 is installed (version: $(pm2 --version))"
echo ""

# Step 1: Stop any existing instances
echo "📍 Step 1: Stopping existing bot instances..."
pkill -f "tsx index.ts" 2>/dev/null && echo "   ✅ Stopped existing instances" || echo "   ℹ️  No running instances found"
sleep 2

# Step 2: Start with PM2
echo ""
echo "📍 Step 2: Starting bot with PM2..."
cd "/Users/emmanuelyeboah/Projects/Alpha Snipes"
pm2 start ecosystem.config.js

# Step 3: Save configuration
echo ""
echo "📍 Step 3: Saving PM2 configuration..."
pm2 save

# Step 4: Setup startup
echo ""
echo "📍 Step 4: PM2 Startup Configuration"
echo "   The next command will print a 'sudo' command."
echo "   COPY and RUN that command, then press Enter here to continue..."
echo ""
pm2 startup

echo ""
read -p "   Press Enter after running the sudo command above..."

# Step 5: Save again
echo ""
echo "📍 Step 5: Saving startup configuration..."
pm2 save

# Step 6: Verify
echo ""
echo "📍 Step 6: Verification"
echo ""
pm2 status

echo ""
echo "✅ PM2 Setup Complete!"
echo ""
echo "📊 Useful Commands:"
echo "   pm2 status                     # Check status"
echo "   pm2 logs alpha-snipes-paper    # View logs"
echo "   pm2 restart alpha-snipes-paper # Restart bot"
echo "   pm2 stop alpha-snipes-paper    # Stop bot"
echo "   pm2 monit                      # Live monitoring"
echo ""
echo "📱 Check your Telegram channel for [PAPER] Bot Started message!"
echo ""
echo "🎯 Next: Add alpha candidates with /alpha_add in Telegram"


