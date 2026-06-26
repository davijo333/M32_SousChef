#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q -r requirements.txt

if [[ ! -f .env ]]; then
  if [[ -f ../../.env ]]; then
    cp ../../.env .env
    grep -q '^AGENT_SERVICE_PORT=' .env || echo 'AGENT_SERVICE_PORT=8000' >> .env
  else
    echo "Missing .env — run from repo root: cp .env.example .env"
    exit 1
  fi
fi

PORT="${AGENT_SERVICE_PORT:-8000}"
exec .venv/bin/python -m uvicorn main:app --reload --port "${PORT}"
