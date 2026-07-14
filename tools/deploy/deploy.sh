#!/usr/bin/env bash
# Stop old containers, remove old images, pull new version, start fresh.
set -euo pipefail

cd "$(dirname "$0")"

MAX_ATTEMPTS=5
WAIT_SECONDS=10

echo "=== Stopping and removing old containers ==="
docker compose down --remove-orphans

echo "=== Removing old innocenz images (local cache) ==="
for repo in juneyou/innocenz-frontend juneyou/innocenz-backend; do
  ids="$(docker images "$repo" --format '{{.ID}}' | sort -u)"
  if [ -n "$ids" ]; then
    echo "$ids" | xargs -r docker rmi -f
  fi
done

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "=== Pull attempt $attempt/$MAX_ATTEMPTS ==="
  if docker compose pull "$@"; then
    echo "Pull succeeded."
    echo "=== Starting new containers ==="
    docker compose up -d
    docker compose ps
    exit 0
  fi
  echo "Pull failed. Retrying in ${WAIT_SECONDS}s..."
  sleep "$WAIT_SECONDS"
done

echo "Pull failed after $MAX_ATTEMPTS attempts."
echo "Try again later, or: docker pull <image> manually a few times."
exit 1
