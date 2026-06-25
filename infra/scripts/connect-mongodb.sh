#!/usr/bin/env bash
# Start MongoDB — reuses existing sous-chef-mongo if present (avoids name conflict after restructure).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker-compose.yml"

if docker ps --filter name=^sous-chef-mongo$ --filter status=running -q | grep -q .; then
  echo "==> MongoDB already running (sous-chef-mongo on :27017)"
  exit 0
fi

if docker ps -a --filter name=^sous-chef-mongo$ -q | grep -q .; then
  echo "==> Starting existing sous-chef-mongo container"
  docker start sous-chef-mongo
  exit 0
fi

echo "==> Creating MongoDB via docker compose"
docker compose -f "$COMPOSE_FILE" up -d mongo
