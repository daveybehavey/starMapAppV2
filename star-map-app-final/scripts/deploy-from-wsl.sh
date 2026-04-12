#!/usr/bin/env bash
# Run from WSL after: cd /mnt/c/Users/<you>/dev/starMapAppV2/star-map-app-final
# Usage: bash scripts/deploy-from-wsl.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
echo "==> $(pwd)"
echo "==> node $(node -v)"
npm ci
npm run deploy:verify
