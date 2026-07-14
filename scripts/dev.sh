#!/bin/bash
# Start Atlas dev server (macOS/Linux). Run scripts/setup.sh first.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "Run scripts/setup.sh first."
  exit 1
fi

if [ ! -f .env.local ]; then
  echo "Missing .env.local — run scripts/setup.sh and add Supabase credentials."
  exit 1
fi

npm run dev
