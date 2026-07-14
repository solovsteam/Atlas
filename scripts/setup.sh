#!/bin/bash
# First-time setup after cloning the repo.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Atlas setup"
echo "==========="

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (20+). Install from https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ required. You have: $(node -v)"
  exit 1
fi

echo "Installing dependencies..."
npm install

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo ""
  echo "Created .env.local — add your Supabase URL and anon key before running the app."
  echo "See README.md → One-time Supabase setup."
else
  echo ".env.local already exists (unchanged)."
fi

echo ""
echo "Setup done."
echo ""
echo "Next:"
echo "  macOS:  double-click scripts/Atlas Dev.app (or drag it to the Dock)"
echo "  any OS: npm run dev  →  open http://localhost:5173"
