#!/usr/bin/env bash
set -euo pipefail

# Base system
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git ufw

# Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# PM2 + logrotate
sudo npm i -g pm2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14

# Basic firewall
sudo ufw allow OpenSSH
sudo ufw --force enable

# Deploy app
mkdir -p ~/apps && cd ~/apps
if [ ! -d alpha-snipes ]; then
  git clone https://github.com/YOUR_GITHUB/alpha-snipes.git alpha-snipes
fi
cd alpha-snipes

# Expect user to paste .env after this step; do not overwrite existing .env
if [ ! -f .env ]; then
  echo ">> No .env found. Create it now (paste and save), then press Ctrl+D when done."
  cat > .env
fi

npm ci || npm install

# Ensure PM2 ecosystem file exists (CommonJS)
cat > ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [
    {
      name: "alpha-snipes-paper",
      script: "node",
      args: "--import=tsx --env-file=.env index.ts",
      cwd: process.cwd(),
      env: { NODE_ENV: "production" },
      autorestart: true,
      time: true,
      max_restarts: 20,
      restart_delay: 3000
    }
  ]
}
EOF

pm2 start ecosystem.config.cjs --only "alpha-snipes-paper"
pm2 save
pm2 startup systemd -u $USER --hp $HOME | tail -n 1 | bash
pm2 save

# Daily backup of alpha/registry.json
mkdir -p ~/backups
( crontab -l 2>/dev/null; echo '0 3 * * * mkdir -p ~/backups && cp -f ~/apps/alpha-snipes/alpha/registry.json ~/backups/registry-$(date +\%F).json 2>/dev/null || true' ) | crontab -

echo ">> Deployment complete. View logs with: pm2 logs alpha-snipes-paper"

