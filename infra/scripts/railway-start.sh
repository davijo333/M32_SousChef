#!/usr/bin/env bash
set -euo pipefail

AGENT_PORT="${AGENT_INTERNAL_PORT:-8000}"
WEB_PORT="${PORT:-3000}"

cd /app/agent
uvicorn main:app --host 127.0.0.1 --port "$AGENT_PORT" &
AGENT_PID=$!

cd /app/apps/web
export PORT="$WEB_PORT"
export AGENT_SERVICE_URL="http://127.0.0.1:${AGENT_PORT}"
export HOSTNAME="0.0.0.0"

npm start &
WEB_PID=$!

trap 'kill "$AGENT_PID" "$WEB_PID" 2>/dev/null; wait' EXIT TERM INT
wait -n "$AGENT_PID" "$WEB_PID"
