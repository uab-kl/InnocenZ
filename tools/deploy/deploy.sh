#!/usr/bin/env bash
# Stop old containers, remove old images, pull new version, start fresh + log stats.
set -euo pipefail

cd "$(dirname "$0")"

# === LOAD ENV VARIABLES ===
# This pulls in FRONTEND_CONTAINER_NAME and BACKEND_CONTAINER_NAME dynamically
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "Error: .env file not found!"
  exit 1
fi

MAX_ATTEMPTS=5
WAIT_SECONDS=10

# All logs live right inside this single directory
LOG_DIR="deploy_logs/staging"
HISTORY_FILE="${LOG_DIR}/history.json"

echo "=== Stopping and removing old staging containers ==="
docker compose down --remove-orphans

echo "=== Removing old innocenz images (local cache) ==="
# Pulls the image configurations directly out of your docker-compose file setup
FRONTEND_REPO=$(docker compose config --format json | python3 -c "import sys, json; print(json.load(sys.stdin)['services']['frontend']['image'].split(':')[0])")
BACKEND_REPO=$(docker compose config --format json | python3 -c "import sys, json; print(json.load(sys.stdin)['services']['backend']['image'].split(':')[0])")

for repo in "$FRONTEND_REPO" "$BACKEND_REPO"; do
  ids="$(docker images "$repo" --format '{{.ID}}' | sort -u)"
  if [ -n "$ids" ]; then
    echo "Cleaning cache for $repo..."
    echo "$ids" | xargs -r docker rmi -f || true
  fi
done

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "=== Pull attempt $attempt/$MAX_ATTEMPTS ==="
  if docker compose pull "$@"; then
    echo "Pull succeeded."
    echo "=== Starting new containers ==="
    docker compose up -d
    docker compose ps

    # === AUTOMATIC JSON LOGGING ===
    echo "=== Logging deployment info ==="
    mkdir -p "$LOG_DIR"
    
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Grab the active runtime hashes using your dynamic env container names
    FRONTEND_ID=$(docker inspect --format='{{.Image}}' "${FRONTEND_CONTAINER_NAME}" 2>/dev/null || echo "unknown")
    BACKEND_ID=$(docker inspect --format='{{.Image}}' "${BACKEND_CONTAINER_NAME}" 2>/dev/null || echo "unknown")

    # 1. Generate the JSON block for the current deploy
    JSON_OUTPUT=$(cat <<EOF
{
  "environment": "staging",
  "timestamp": "$TIMESTAMP",
  "frontend_container": "${FRONTEND_CONTAINER_NAME}",
  "backend_container": "${BACKEND_CONTAINER_NAME}",
  "frontend_image_id": "$FRONTEND_ID",
  "backend_image_id": "$BACKEND_ID",
  "status": "success"
}
EOF
)
    # Save to current.json
    echo "$JSON_OUTPUT" > "${LOG_DIR}/current.json"

    # 2. Append cleanly to history.json list using native Python
    if [ ! -f "$HISTORY_FILE" ] || [ ! -s "$HISTORY_FILE" ]; then
      echo "[]" > "$HISTORY_FILE"
    fi

    python3 -c "
import json, sys
with open('$HISTORY_FILE', 'r+') as f:
    try:
        data = json.load(f)
    except Exception:
        data = []
    if not isinstance(data, list):
        data = []
    new_log = json.loads(sys.argv[1])
    data.insert(0, new_log) # Prepends the newest deploy at the top
    f.seek(0)
    json.dump(data, f, indent=2)
    f.truncate()
" "$JSON_OUTPUT"

    echo "Saved logs to target folder: ./${LOG_DIR}/"
    exit 0
  fi
  echo "Pull failed. Retrying in ${WAIT_SECONDS}s..."
  sleep "$WAIT_SECONDS"
done

echo "Pull failed after $MAX_ATTEMPTS attempts."
exit 1