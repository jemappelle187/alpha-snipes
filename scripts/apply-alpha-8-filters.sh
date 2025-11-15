#!/bin/bash
# Apply optimized filter configuration for alpha wallet 8zkJme...

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

echo "🔧 Applying optimized filters for alpha wallet 8zkJme..."
echo "📝 Updating $ENV_FILE..."

# Backup .env
cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d_%H%M%S)"

# Remove old filter settings if they exist
sed -i.bak '/^DUST_SOL_SPENT=/d' "$ENV_FILE"
sed -i.bak '/^MIN_ALPHA_TOKEN_BALANCE=/d' "$ENV_FILE"
sed -i.bak '/^MIN_SIZE_INCREASE_RATIO=/d' "$ENV_FILE"
sed -i.bak '/^MIN_LIQUIDITY_USD=/d' "$ENV_FILE"
sed -i.bak '/^DEBUG_TX=/d' "$ENV_FILE"

# Add optimized filter settings
cat >> "$ENV_FILE" << 'EOF'

# === Optimized Filters for Alpha Wallet 8zkJme... ===
# Relaxed thresholds to catch more transactions
DUST_SOL_SPENT=0.0001                    # Lowered from 0.001 (10x more sensitive)
MIN_ALPHA_TOKEN_BALANCE=0.0000001        # Lowered from 0.000001 (10x more sensitive)
MIN_SIZE_INCREASE_RATIO=0.1              # Lowered from 0.25 (catches 10%+ increases)
MIN_LIQUIDITY_USD=5000                   # Lowered from 10000 (catch smaller tokens)
DEBUG_TX=true                            # Enable detailed classification logging
EOF

echo "✅ Filters updated!"
echo ""
echo "📊 New filter values:"
echo "   DUST_SOL_SPENT=0.0001 (was 0.001)"
echo "   MIN_ALPHA_TOKEN_BALANCE=0.0000001 (was 0.000001)"
echo "   MIN_SIZE_INCREASE_RATIO=0.1 (was 0.25)"
echo "   MIN_LIQUIDITY_USD=5000 (was 10000)"
echo ""
echo "🔄 Restart the bot with:"
echo "   pm2 restart alpha-snipes-paper --update-env"
echo ""
echo "📝 Backup saved to: ${ENV_FILE}.bak.*"

