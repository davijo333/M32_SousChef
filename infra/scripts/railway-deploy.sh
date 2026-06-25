#!/usr/bin/env bash
# Deploy Sous Chef to a new Railway project (agent service + web + MongoDB).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI: https://docs.railway.com/guides/cli" >&2
  exit 1
fi

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing .env — cp .env.example .env and fill secrets." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

PROJECT_NAME="${RAILWAY_PROJECT_NAME:-M32-SousChef}"

echo "==> Creating Railway project: $PROJECT_NAME"
railway init --name "$PROJECT_NAME" 2>/dev/null || railway link

echo "==> Adding MongoDB"
railway add --database mongo 2>/dev/null || true

echo "==> Creating services"
railway service create agent-service 2>/dev/null || true
railway service create web 2>/dev/null || true

echo "==> Deploy agent-service"
railway service agent-service
railway variables set \
  OPENAI_API_KEY="$OPENAI_API_KEY" \
  MONGODB_URI='${{MongoDB.MONGO_URL}}' \
  --service agent-service
railway up --service agent-service --path-as-root backend/agent-service --detach

AGENT_URL="$(railway domain --service agent-service 2>/dev/null | tail -1 || true)"
if [[ -z "$AGENT_URL" ]]; then
  railway domain create --service agent-service || true
  AGENT_URL="$(railway domain --service agent-service 2>/dev/null | tail -1 || true)"
fi
if [[ -n "$AGENT_URL" && "$AGENT_URL" != http* ]]; then
  AGENT_URL="https://${AGENT_URL}"
fi

echo "==> Deploy web"
railway service web
WEB_URL="$(railway domain --service web 2>/dev/null | tail -1 || true)"
if [[ -z "$WEB_URL" ]]; then
  railway domain create --service web || true
  WEB_URL="$(railway domain --service web 2>/dev/null | tail -1 || true)"
fi
if [[ -n "$WEB_URL" && "$WEB_URL" != http* ]]; then
  NEXTAUTH_URL="https://${WEB_URL}"
else
  NEXTAUTH_URL="${WEB_URL:-http://localhost:3000}"
fi

railway variables set \
  OPENAI_API_KEY="$OPENAI_API_KEY" \
  MONGODB_URI='${{MongoDB.MONGO_URL}}' \
  NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  NEXTAUTH_URL="$NEXTAUTH_URL" \
  AGENT_SERVICE_URL="${AGENT_URL:-http://localhost:8000}" \
  USE_LANGCHAIN_AGENTS="${USE_LANGCHAIN_AGENTS:-true}" \
  --service web

railway up --service web --detach

echo ""
echo "==> Deployments triggered"
echo "Web:    $NEXTAUTH_URL"
echo "Agent:  ${AGENT_URL:-set AGENT_SERVICE_URL on web after agent domain is ready}"
echo "Project: $(railway status 2>/dev/null | head -5 || echo 'see railway dashboard')"
