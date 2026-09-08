#!/usr/bin/env bash
# Stop old containers, remove old images, pull new version, start fresh + log stats.
set -euo pipefail

cd "$(dirname "$0")"

# === LOAD ENV VARIABLES ===
# Image tags + optional DEPLOY_ENV / container names (written by deploy.mjs).
# CI exports DEPLOY_ENV over ssh, but `source .env` below re-defines it from
# whatever the box was provisioned as — which made a PRODUCTION rollout write
# its logs to logs/staging/. The caller's value has to survive the
# source, so remember it first and let it win.
DEPLOY_ENV_FROM_CALLER="${DEPLOY_ENV:-}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "Error: .env file not found!"
  exit 1
fi

DEPLOY_ENV="${DEPLOY_ENV_FROM_CALLER:-${DEPLOY_ENV:-staging}}"
FRONTEND_CONTAINER_NAME="${FRONTEND_CONTAINER_NAME:-innocenz-frontend}"
BACKEND_CONTAINER_NAME="${BACKEND_CONTAINER_NAME:-innocenz-backend}"

MAX_ATTEMPTS=5
WAIT_SECONDS=10

LOG_DIR="logs/${DEPLOY_ENV}"
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

# Pull BEFORE stopping anything. This used to run `compose down` and then
# `docker rmi -f` on the old images FIRST, so the site was offline for the
# whole download — and a failed pull left it dead with its rollback target
# already deleted. Pulling first costs nothing: the old containers keep
# serving traffic throughout, and a pull that never succeeds leaves the
# previous version running.
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "=== Pull attempt $attempt/$MAX_ATTEMPTS ==="
  if docker compose pull "$@"; then
    echo "Pull succeeded."
    echo "=== Starting new containers ==="
    # --force-recreate so a changed .env.backend / .env.frontend is re-applied
    # even when the image tag did not move. compose replaces each service in
    # place, so the outage is a container restart and not a download.
    docker compose up -d --force-recreate --remove-orphans
    docker compose ps

    # Reclaim disk only AFTER the new containers are up: until this moment the
    # old images are the rollback target. No -f, so an image still referenced
    # by a running container is refused rather than pulled out from under it.
    echo "=== Removing superseded innocenz images ==="
    FRONTEND_REPO=$(docker compose config --format json | python3 -c "import sys, json; print(json.load(sys.stdin)['services']['frontend']['image'].split(':')[0])")
    BACKEND_REPO=$(docker compose config --format json | python3 -c "import sys, json; print(json.load(sys.stdin)['services']['backend']['image'].split(':')[0])")
    # Full sha256 digests of what is running now; `docker images` prints the
    # short id, which is a prefix of that digest, so a substring test matches.
    KEEP="$(docker inspect --format='{{.Image}}' "${FRONTEND_CONTAINER_NAME}" "${BACKEND_CONTAINER_NAME}" 2>/dev/null || true)"
    for repo in "$FRONTEND_REPO" "$BACKEND_REPO"; do
      for id in $(docker images "$repo" --format '{{.ID}}' | sort -u); do
        case "$KEEP" in
          *"$id"*) continue ;;
        esac
        docker rmi "$id" >/dev/null 2>&1 || true
      done
    done

    echo "=== Logging deployment info ==="
    # A failed log write must NOT fail the deploy — the new containers are
    # already serving by this point. Under `set -e` a redirect into an
    # unwritable logs/ (owned by another user) aborted the script with
    # exit 1, reporting a successful production rollout as a failed one.
    if ! mkdir -p "$LOG_DIR" 2>/dev/null || ! touch "${LOG_DIR}/.writetest" 2>/dev/null; then
      echo "WARNING: ${LOG_DIR} is not writable — skipping logs."
      echo "  The deployment itself SUCCEEDED. Fix logging with:"
      echo "    sudo chown -R \"\$(id -un)\":\"\$(id -gn)\" $(pwd)/logs"
      LOG_DIR=""
    else
      rm -f "${LOG_DIR}/.writetest"
    fi

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
    if [ -n "$LOG_DIR" ]; then
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
    fi
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
