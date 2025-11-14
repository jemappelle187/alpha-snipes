#!/bin/bash
# Git Setup Helper Script

echo "🚀 Alpha Snipes - Git Setup Helper"
echo ""

# Check if we're on Mac or Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
  MACHINE="Mac"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  MACHINE="VM (Linux)"
else
  MACHINE="Unknown"
fi

echo "📍 Detected: $MACHINE"
echo ""

if [[ "$MACHINE" == "Mac" ]]; then
  echo "📝 Mac Setup (Development Machine)"
  echo ""
  echo "This will:"
  echo "  1. Initialize git repo (if needed)"
  echo "  2. Add all files"
  echo "  3. Create initial commit"
  echo ""
  read -p "Enter your GitHub username: " GITHUB_USER
  read -p "Enter your repo name (default: alpha-snipes): " REPO_NAME
  REPO_NAME=${REPO_NAME:-alpha-snipes}
  
  GITHUB_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"
  
  echo ""
  echo "🔍 Checking git status..."
  
  if [ ! -d .git ]; then
    echo "📦 Initializing git repo..."
    git init
    git branch -M main
  fi
  
  if ! git remote | grep -q origin; then
    echo "🔗 Adding GitHub remote..."
    git remote add origin "$GITHUB_URL"
  else
    echo "✅ Remote already configured"
    CURRENT_URL=$(git remote get-url origin)
    echo "   Current: $CURRENT_URL"
    read -p "Update to $GITHUB_URL? (y/n): " UPDATE_REMOTE
    if [[ "$UPDATE_REMOTE" == "y" ]]; then
      git remote set-url origin "$GITHUB_URL"
    fi
  fi
  
  echo ""
  echo "📋 Staging files..."
  git add .
  
  echo ""
  echo "💾 Creating commit..."
  git commit -m "Initial commit - Alpha Snipes bot" || echo "⚠️  No changes to commit"
  
  echo ""
  echo "🚀 Pushing to GitHub..."
  echo "   (You may need to authenticate)"
  git push -u origin main || echo "⚠️  Push failed - make sure repo exists on GitHub"
  
  echo ""
  echo "✅ Mac setup complete!"
  echo ""
  echo "Next steps:"
  echo "  1. Make sure repo exists on GitHub: https://github.com/$GITHUB_USER/$REPO_NAME"
  echo "  2. Run this script on VM to clone the repo"
  
elif [[ "$MACHINE" == "VM (Linux)" ]]; then
  echo "📝 VM Setup (Production Server)"
  echo ""
  read -p "Enter your GitHub username: " GITHUB_USER
  read -p "Enter your repo name (default: alpha-snipes): " REPO_NAME
  REPO_NAME=${REPO_NAME:-alpha-snipes}
  
  GITHUB_URL="https://github.com/$GITHUB_USER/$REPO_NAME.git"
  
  echo ""
  echo "⚠️  This will clone the repo to ~/Alpha Snipes"
  echo "   (Will remove existing directory if it exists)"
  read -p "Continue? (y/n): " CONFIRM
  
  if [[ "$CONFIRM" != "y" ]]; then
    echo "❌ Cancelled"
    exit 1
  fi
  
  cd ~
  if [ -d "Alpha Snipes" ]; then
    echo "🗑️  Removing existing directory..."
    rm -rf "Alpha Snipes"
  fi
  
  echo "📥 Cloning from GitHub..."
  git clone "$GITHUB_URL" "Alpha Snipes"
  
  cd "Alpha Snipes"
  
  echo "📦 Installing dependencies..."
  npm install
  
  echo ""
  echo "✅ VM setup complete!"
  echo ""
  echo "Next steps:"
  echo "  1. Copy .env file from Mac:"
  echo "     scp ~/Projects/Alpha\\ Snipes/.env ubuntu@alpha-snipes-vm:~/Alpha\\ Snipes/.env"
  echo "  2. Start bot with PM2:"
  echo "     pm2 start 'tsx index.ts' --name alpha-snipes-paper"
  
else
  echo "❌ Unknown system type"
  exit 1
fi

