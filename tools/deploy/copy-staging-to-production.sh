#!/usr/bin/env bash
# COPY THE STAGING DATABASE OVER PRODUCTION'S — ONCE, BACKUP FIRST.
#
# Owner, 19 Nov 2026: "then why is that prodoction and staging different ? fix
# it" → "follow the staging" → "Copy staging into live once" (live holds only
# our own testing). Each server keeps its own .env.backend naming its own
# database, so innocenz.net ran on a copy of the test data taken around
# 9-10 Sep and nothing added on staging since (team memberships, logos) ever
# reached it. The production backend also never runs migrations on start, so
# that copy can lag the code's schema as well. This replaces production's data
# with staging's; production keeps its OWN database afterwards, so later
# testing on staging does not reach live users.
#
# Run ON the production server, from the production deploy folder (the one
# holding .env.backend). Needs docker; pg_dump/psql run in $PG_IMAGE.
#
#   bash copy-staging-to-production.sh STAGING_ENV [PRODUCTION_ENV]          preview, changes nothing
#   bash copy-staging-to-production.sh STAGING_ENV [PRODUCTION_ENV] --apply  backup, then copy
#   bash copy-staging-to-production.sh --rollback BACKUP.sql.gz [PRODUCTION_ENV]
#
# STAGING_ENV is a file with the POSTGRES_HOST/PORT/USER/PASSWORD/DB of the
# database the STAGING site uses (and its MFA_SECRET_KEY) — a copy of the
# staging server's .env.backend is fine. PRODUCTION_ENV defaults to
# ./.env.backend.
#
# --apply:
#   1. backs up production, and dumps staging, into ./backups/ (plain SQL,
#      gzip) and checks both are complete before going on;
#   2. in ONE transaction drops production's `main` and `drizzle` schemas (all
#      the app's tables plus the migration ledger) and loads staging's — any
#      error rolls the whole thing back and production is left as it was;
#   3. compares every table's row count with staging, then restarts the backend
#      so no cached role or permission outlives the old data.
#
# Never writes to staging. Never prints a password (it reaches the container
# through the environment, not the command line). Refuses when both files name
# the same database, when the client is older than either server, and when an
# admin authenticator would stop working (see MFA below).
#
# MFA: admin authenticator secrets are sealed with MFA_SECRET_KEY. Copied rows
# only open on live if production's .env.backend carries the SAME key as
# staging; otherwise the script stops. Set the key first, or pass
# --allow-mfa-reset to accept that those admins re-enrol.
#
# NOT done here — FILES. Rows store storage keys, and the live site reads the
# production bucket, so copy the staging bucket INTO it once (adds only):
#     rclone copy <remote>:<staging-bucket> <remote>:innocenz --progress
# Never `rclone sync` — sync deletes whatever the source lacks.
#
# Port: if POSTGRES_PORT is a connection pooler and pg_dump fails on it, put the
# direct Postgres port in a copy of the env file and pass that instead.
set -Eeuo pipefail

PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

die() { printf '\n✗ %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

# KEY=value from an env file without sourcing it (JWT keys and quotes would
# break `source`). Last assignment wins, `export ` and surrounding quotes are
# dropped, a missing key reads as empty.
env_val() {
	local file=$1 key=$2 line
	line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n 1 || true)"
	line="${line#*=}"
	line="${line%$'\r'}"
	if [[ ${#line} -ge 2 && ( ${line:0:1} == '"' || ${line:0:1} == "'" ) && ${line: -1} == "${line:0:1}" ]]; then
		line="${line:1:${#line}-2}"
	fi
	printf '%s' "$line"
}

# ---- arguments --------------------------------------------------------------
MODE=preview
ALLOW_MFA_RESET=0
POS=()
while [[ $# -gt 0 ]]; do
	case "$1" in
	--apply) MODE=apply ;;
	--rollback) MODE=rollback ;;
	--allow-mfa-reset) ALLOW_MFA_RESET=1 ;;
	-h | --help) awk 'NR > 1 && /^set -Eeuo/ { exit } NR > 1' "$0"; exit 0 ;;
	--*) die "Unknown option $1 (see --help)." ;;
	*) POS+=("$1") ;;
	esac
	shift
done

if [[ $MODE == rollback ]]; then
	BACKUP_FILE="${POS[0]:-}"
	DST_ENV="${POS[1]:-./.env.backend}"
	[[ -n $BACKUP_FILE && -f $BACKUP_FILE ]] || die "--rollback needs the backup file written by --apply."
	SRC_ENV=""
else
	SRC_ENV="${POS[0]:-}"
	DST_ENV="${POS[1]:-./.env.backend}"
	[[ -n $SRC_ENV ]] || die "Name the STAGING env file first (see --help)."
	[[ -f $SRC_ENV ]] || die "Staging env file not found: $SRC_ENV"
fi
[[ -f $DST_ENV ]] || die "Production env file not found: $DST_ENV"

declare -A DB
load_side() { # side file
	local side=$1 file=$2 k
	for k in POSTGRES_HOST POSTGRES_PORT POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB; do
		DB[$side.$k]="$(env_val "$file" "$k")"
	done
	DB[$side.POSTGRES_PORT]="${DB[$side.POSTGRES_PORT]:-5432}"
	for k in POSTGRES_HOST POSTGRES_USER POSTGRES_DB; do
		[[ -n ${DB[$side.$k]} ]] || die "$k is empty in $file."
	done
}
[[ -n $SRC_ENV ]] && load_side src "$SRC_ENV"
load_side dst "$DST_ENV"

where() { printf '%s:%s/%s' "${DB[$1.POSTGRES_HOST]}" "${DB[$1.POSTGRES_PORT]}" "${DB[$1.POSTGRES_DB]}"; }

say "Production (overwritten): $(where dst)"
[[ -n $SRC_ENV ]] && say "Staging    (read only):   $(where src)"
if [[ -n $SRC_ENV && "$(where src)" == "$(where dst)" ]]; then
	die "Both files name the same database — nothing to copy, and the copy would destroy it."
fi

# MFA keys are compared by hash, never shown.
key_hash() { local v; v="$(env_val "$1" MFA_SECRET_KEY)"; [[ -z $v ]] && { printf 'unset'; return; }; printf '%s' "$v" | sha256sum | cut -c1-12; }

[[ ${COPY_STAGING_DRY_PARSE:-0} == 1 ]] && { say "(parse check only — stopping before any database call)"; exit 0; }

# ---- database helpers ---------------------------------------------------------
command -v docker >/dev/null || die "docker is required (pg_dump/psql run in $PG_IMAGE)."

pg() { # side tool args... — password through the environment only
	local side=$1; shift
	PGPASSWORD="${DB[$side.POSTGRES_PASSWORD]}" docker run --rm -i --network host -e PGPASSWORD "$PG_IMAGE" "$@"
}
conn() { printf '%s\n' -h "${DB[$1.POSTGRES_HOST]}" -p "${DB[$1.POSTGRES_PORT]}" -U "${DB[$1.POSTGRES_USER]}" -d "${DB[$1.POSTGRES_DB]}"; }
q() { # side sql → unaligned rows
	local side=$1 sql=$2 args
	mapfile -t args < <(conn "$side")
	pg "$side" psql -X -At -v ON_ERROR_STOP=1 "${args[@]}" -c "$sql"
}

COUNTS_SQL="select table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables where table_schema = 'main' and table_type = 'BASE TABLE' order by 1"

check_versions() {
	local client server side
	client="$(docker run --rm "$PG_IMAGE" pg_dump --version | grep -oE '[0-9]+' | head -n 1)"
	for side in "$@"; do
		server="$(q "$side" "show server_version_num")"
		server=$((server / 10000))
		((server <= client)) || die "$(where "$side") runs Postgres $server but $PG_IMAGE has pg_dump $client — set PG_IMAGE=postgres:$server-alpine."
	done
	say "Postgres client $client is new enough."
}

restart_backend() {
	local name
	name="$(env_val .env BACKEND_CONTAINER_NAME 2>/dev/null || true)"
	name="${name:-innocenz-backend}"
	say "Restarting $name …"
	docker restart "$name" >/dev/null
	for _ in $(seq 1 30); do
		[[ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$name" 2>/dev/null)" =~ ^(healthy|running)$ ]] && { say "✓ $name is up."; return; }
		sleep 2
	done
	say "⚠ $name did not report healthy within 60 s — check: docker logs --tail 50 $name"
}

# Drop `main` + `drizzle` and load a dump inside ONE explicit transaction.
# ON_ERROR_STOP ends psql at the first error, and a session that ends inside
# an open transaction is rolled back — so production is replaced whole or not
# at all. (No --single-transaction: it would wrap our own BEGIN/COMMIT and
# commit half-way.)
load_into_production() { # gz file
	local args
	mapfile -t args < <(conn dst)
	{
		printf 'BEGIN;\nDROP SCHEMA IF EXISTS main CASCADE;\nDROP SCHEMA IF EXISTS drizzle CASCADE;\n'
		# A broken read must never reach the COMMIT below.
		gzip -dc "$1" || exit 1
		printf 'COMMIT;\n'
	} | pg dst psql -X -q -v ON_ERROR_STOP=1 "${args[@]}" >/dev/null
}

dump_to() { # side file
	local args
	mapfile -t args < <(conn "$1")
	pg "$1" pg_dump --no-owner --no-privileges -n main -n drizzle "${args[@]}" | gzip >"$2"
	gzip -t "$2" || die "$2 is not a complete gzip file."
	gzip -dc "$2" | grep -q 'CREATE TABLE main\.' || die "$2 holds no app tables — refusing to use it."
	say "✓ $2 ($(du -h "$2" | cut -f1))"
}

# ---- rollback ---------------------------------------------------------------
if [[ $MODE == rollback ]]; then
	check_versions dst
	gzip -t "$BACKUP_FILE" || die "$BACKUP_FILE is not a complete gzip file."
	read -r -p "Type the production database name (${DB[dst.POSTGRES_DB]}) to restore $BACKUP_FILE over it: " ans
	[[ $ans == "${DB[dst.POSTGRES_DB]}" ]] || die "Not confirmed — nothing changed."
	load_into_production "$BACKUP_FILE"
	say "✓ Production restored from $BACKUP_FILE."
	restart_backend
	exit 0
fi

# ---- preview (always) ---------------------------------------------------------
check_versions src dst

# Every read lands in a variable FIRST: a failed query inside <(…) is silent,
# and would print "nothing differs" or "0 accounts" about a read that never ran.
count_diff() { # → "table staging production" for every table that differs
	local s d
	s="$(q src "$COUNTS_SQL" | sort)"
	d="$(q dst "$COUNTS_SQL" | sort)"
	join -a1 -a2 -e '-' -o 0,1.2,2.2 <(printf '%s\n' "$s") <(printf '%s\n' "$d") | awk 'NF && $2 != $3'
}

say ""
say "Rows per table — staging → production (only tables that differ):"
BEFORE="$(count_diff)"
printf '%s\n' "$BEFORE" | awk 'NF { printf "  %-34s staging %-8s production %s\n", $1, $2, $3 }'

SRC_IDS="$(q src 'select id from main."user" order by 1' | sort)"
DST_IDS="$(q dst 'select id from main."user" order by 1' | sort)"
ONLY_LIVE="$(comm -13 <(printf '%s\n' "$SRC_IDS") <(printf '%s\n' "$DST_IDS") | grep -c . || true)"
say ""
say "Accounts that exist ONLY on production (removed by the copy, kept in the backup): $ONLY_LIVE"

MFA_ROWS="$(q src 'select count(*) from main.admin_mfa' 2>/dev/null || echo 0)"
if [[ $MFA_ROWS != 0 && "$(key_hash "$SRC_ENV")" != "$(key_hash "$DST_ENV")" ]]; then
	say ""
	say "⚠ Staging holds $MFA_ROWS admin authenticator(s), and production's MFA_SECRET_KEY differs from staging's."
	say "  Copy staging's MFA_SECRET_KEY into production's .env.backend first, or those admins must re-enrol."
	[[ $ALLOW_MFA_RESET == 1 ]] || MFA_BLOCK=1
fi

if [[ $MODE != apply ]]; then
	say ""
	say "Preview only — nothing changed. Re-run with --apply to copy."
	exit 0
fi
[[ ${MFA_BLOCK:-0} == 1 ]] && die "Stopped for the MFA key (see above). Fix it, or pass --allow-mfa-reset."

# ---- apply ------------------------------------------------------------------------
say ""
read -r -p "Type the production database name (${DB[dst.POSTGRES_DB]}) to replace its data with staging's: " ans
[[ $ans == "${DB[dst.POSTGRES_DB]}" ]] || die "Not confirmed — nothing changed."

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
PROD_BACKUP="$BACKUP_DIR/production-$STAMP.sql.gz"
STAGING_DUMP="$BACKUP_DIR/staging-$STAMP.sql.gz"
say "Backing up production …"
dump_to dst "$PROD_BACKUP"
say "Dumping staging …"
dump_to src "$STAGING_DUMP"

say "Replacing production's data with staging's (one transaction) …"
load_into_production "$STAGING_DUMP"

DIFF="$(count_diff)"
if [[ -n $DIFF ]]; then
	say "⚠ Row counts differ after the copy (staging may have changed meanwhile):"
	say "$DIFF"
else
	say "✓ Every table's row count now matches staging."
fi
restart_backend
say ""
say "Done. Undo with: bash $0 --rollback $PROD_BACKUP $DST_ENV"
say "Still to do: copy the staging bucket into the production one (rclone copy, see the top of this file)."
