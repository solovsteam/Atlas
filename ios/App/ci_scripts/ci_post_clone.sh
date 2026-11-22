#!/bin/sh
set -eu

cd "${CI_PRIMARY_REPOSITORY_PATH:?Missing the path to the Atlas repository}"
: "${VITE_SUPABASE_URL:?Set the Atlas Supabase URL in the Xcode Cloud workflow}"
: "${VITE_SUPABASE_ANON_KEY:?Set the Atlas Supabase client key in the Xcode Cloud workflow}"

export HOMEBREW_NO_AUTO_UPDATE=1
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 24 ? 0 : 1)'; then
  brew install node@24
  export PATH="$(brew --prefix node@24)/bin:$PATH"
fi

npm ci --include=dev
npm run ios:prepare
