#!/usr/bin/env bash
set -euo pipefail

command -v timeout >/dev/null || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

echo "Running bounded Vite build..."
timeout \
  --signal=TERM \
  --kill-after="${BUILD_KILL_AFTER:-10s}" \
  "${BUILD_TIMEOUT:-3m}" \
  npm run build
