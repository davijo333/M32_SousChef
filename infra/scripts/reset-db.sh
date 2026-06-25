#!/usr/bin/env bash
# Full database reset: wipe MongoDB data volume, clear all local file storage.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MONGO_URI="${MONGODB_URI:-mongodb://localhost:27017/sous_chef}"
DB_NAME="${MONGO_URI##*/}"
DB_NAME="${DB_NAME%%\?*}"

wait_for_mongo() {
  echo "==> Waiting for MongoDB to be ready"
  for _ in $(seq 1 45); do
    if docker exec sous-chef-mongo mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q 1; then
      return 0
    fi
    sleep 1
  done
  echo "MongoDB did not become ready in time." >&2
  exit 1
}

mongo_collection_count() {
  docker exec sous-chef-mongo mongosh --quiet --eval \
    "db.getSiblingDB('$DB_NAME').getCollectionNames().length" 2>/dev/null || echo "?"
}

echo "==> Full MongoDB reset (database: $DB_NAME)"

COMPOSE_FILE="$ROOT/infra/docker-compose.yml"

if docker ps -a --format '{{.Names}}' | grep -q '^sous-chef-mongo$'; then
  echo "    Stopping and removing sous-chef-mongo container"
  docker stop sous-chef-mongo >/dev/null 2>&1 || true
  docker rm -f sous-chef-mongo >/dev/null 2>&1 || true
fi

echo "    Removing MongoDB data volumes"
while IFS= read -r vol; do
  [[ -z "$vol" ]] && continue
  echo "    Removing volume: $vol"
  docker volume rm -f "$vol" >/dev/null 2>&1 || true
done < <(docker volume ls -q | grep -E 'mongo-data$' || true)

echo "    Starting fresh MongoDB container"
docker compose -f "$COMPOSE_FILE" up -d mongo
wait_for_mongo

echo "==> Dropping database (if any collections remain)"
docker exec sous-chef-mongo mongosh --quiet --eval "db.getSiblingDB('$DB_NAME').dropDatabase()" >/dev/null

REMAINING="$(mongo_collection_count)"
if [[ "$REMAINING" != "0" ]]; then
  echo "Warning: $REMAINING collection(s) still present after reset." >&2
else
  echo "    Verified: 0 collections in $DB_NAME"
fi

echo "==> Clearing local bill and catalog file storage"
R2_ROOT="${R2_STORAGE_ROOT:-$ROOT/storage/r2}"
if [[ -d "$R2_ROOT" ]]; then
  find "$R2_ROOT" -mindepth 1 ! -name 'README.md' ! -name '.gitkeep' -delete 2>/dev/null || true
  find "$R2_ROOT" -mindepth 1 -type d -empty -delete 2>/dev/null || true
  echo "    Cleared: $R2_ROOT"
fi

echo ""
echo "==> Done — database and storage fully cleared."
echo "    Restart the web app if it was running: npm run start:schef"
echo "    Sign up again at http://localhost:3000 and pick a kitchen name."
