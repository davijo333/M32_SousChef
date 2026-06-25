#!/usr/bin/env bash
# Copy catalog images from storage/r2 → test/storage/r2 (commit to git).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$ROOT/test/storage/r2"

for dir in dishes ingredients addons; do
  SRC="$ROOT/storage/r2/$dir"
  if [ -d "$SRC" ]; then
    mkdir -p "$DEST/$dir"
    rsync -a "$SRC/" "$DEST/$dir/"
    echo "  $dir"
  fi
done

COUNT="$(find "$DEST" -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "Captured $COUNT files to test/storage/r2"
