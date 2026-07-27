#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install
fi

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "Starting web-looper..."
echo "Local:   http://localhost:5173"
if [ -n "${IP:-}" ]; then
  echo "Network: http://$IP:5173"
fi

exec npm run dev -- --host
