#!/usr/bin/env bash
# Full frontend restart: stop existing dev server, clear Next.js cache, start fresh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
PORT="${PORT:-3000}"

echo "==> Stopping anything on port $PORT"
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [[ -n "$PIDS" ]]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

echo "==> Clearing Next.js and build caches"
rm -rf "$WEB/.next"
rm -rf "$WEB/node_modules/.cache"
rm -f "$WEB/tsconfig.tsbuildinfo"
rm -f "$WEB/.eslintcache"

echo "==> Starting web app (clean dev server)"
cd "$WEB"
ulimit -n 65536 2>/dev/null || true
exec npm run dev
