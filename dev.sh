#!/bin/bash
# IceSight — start everything with one command
# Usage: bash dev.sh

set -e

if [ ! -f .env.local ]; then
  echo ""
  echo "❌  .env.local not found."
  echo "    Run: cp .env.local.example .env.local"
  echo "    Then add your ANTHROPIC_API_KEY and re-run."
  echo ""
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦  node_modules missing — running npm install..."
  npm install
fi

echo ""
echo "🏒  Starting IceSight..."
echo "    Frontend + API → http://localhost:3000"
echo ""

npm run dev
