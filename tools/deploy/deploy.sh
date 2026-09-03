#!/usr/bin/env bash
# Stop old containers, remove old images, pull new version, start fresh + log stats.
set -euo pipefail

cd "$(dirname "$0")"

# === LOAD ENV VARIABLES ===
# Image tags + optional DEPLOY_ENV / container names (written by deploy.mjs).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "Error: .env file not found!"
  exit 1
fi

DEPLOY_ENV="${DEPLOY_ENV:-staging}"
FRONTEND_CONTAINER_NAME="${FRONTEND_CONTAINER_NAME:-innocenz-frontend}"
BACKEND_CONTAINER_NAME="${BACKEND_CONTAINER_NAME:-innocenz-backend}"

MAX_ATTEMPTS=5
WAIT_SECONDS=10

LOG_DIR="deploy_logs/${DEPLOY_ENV}"
HISTORY_FILE="${LOG_DIR}/history.json"

if [ ! -f .env.backend ]; then
  echo "Error: .env.backend missing — backend would boot with no DATABASE_URL / R2."
  echo "Upload tools/deploy/.env.backend.${DEPLOY_ENV} via deploy, or scp one here."
  exit 1
fi

echo "=== Deploy config ==="
echo "FRONTEND_IMAGE=${FRONTEND_IMAGE}"
echo "BACKEND_IMAGE=${BACKEND_IMAGE}"
echo "Containers: ${FRONTEND_CONTAINER_NAME}, ${BACKEND_CONTAINER_NAME}"
echo "Backend env file: .env.backend (DB/R2 come from here — not from deploy.sh)"

echo "=== Stopping and removing old ${DEPLOY_ENV} containers ==="
docker compose down --remove-orphans

echo "=== Removing old innocenz images (local cache) ==="
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
    # --force-recreate so a changed .env.backend / .env.frontend is re-applied
    # even when the image tag did not move.
    docker compose up -d --force-recreate
    docker compose ps

    echo "=== Logging deployment info ==="
    mkdir -p "$LOG_DIR"

    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    FRONTEND_ID=$(docker inspect --format='{{.Image}}' "${FRONTEND_CONTAINER_NAME}" 2>/dev/null || echo "unknown")
    BACKEND_ID=$(docker inspect --format='{{.Image}}' "${BACKEND_CONTAINER_NAME}" 2>/dev/null || echo "unknown")

    JSON_OUTPUT=$(cat <<EOF
{
  "environment": "${DEPLOY_ENV}",
  "timestamp": "$TIMESTAMP",
  "frontend_container": "${FRONTEND_CONTAINER_NAME}",
  "backend_container": "${BACKEND_CONTAINER_NAME}",
  "frontend_image_id": "$FRONTEND_ID",
  "backend_image_id": "$BACKEND_ID",
  "status": "success"
}
EOF
)
    echo "$JSON_OUTPUT" > "${LOG_DIR}/current.json"

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
    data.insert(0, new_log)
    f.seek(0)
    json.dump(data, f, indent=2)
    f.truncate()
" "$JSON_OUTPUT"

    echo "Saved logs to target folder: ./${LOG_DIR}/"
    echo "=== Backend runtime check (DB / R2 bucket) ==="
    sleep 2
    docker compose exec -T backend printenv DATABASE_URL POSTGRES_HOST POSTGRES_DB R2_BUCKET_NAME R2_PUBLIC_URL 2>/dev/null \
      | sed 's#://[^@]*@#://***:***@#' || true
    # The printenv above is what the backend was GIVEN; this is the database
    # it actually connected to.
    docker logs "${BACKEND_CONTAINER_NAME}" 2>&1 | grep '\[db\]' | tail -1 || true
    exit 0
  fi
  echo "Pull failed. Retrying in ${WAIT_SECONDS}s..."
  sleep "$WAIT_SECONDS"
done

echo "Pull failed after $MAX_ATTEMPTS attempts."
exit 1
