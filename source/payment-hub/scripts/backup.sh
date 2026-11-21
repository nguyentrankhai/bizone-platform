#!/usr/bin/env bash
# Payment Hub backup (P7.5) — database + stored files → one backup set:
#
#   $BACKUP_DIR/payhub-YYYYmmdd-HHMMSS/
#     db.sql.gz[.enc]      mariadb-dump --single-transaction (consistent, no lock): tables, data,
#                          triggers (append-only audit rules!), routines, events
#     files.tar.gz[.enc]   every object of the storage (MinIO / S3 bucket or local dir)
#     manifest.json        what was backed up (tables, row counts, triggers, migrations, sizes)
#     rows.tsv triggers.txt migrations.txt   same data for scripts/backup-verify.sh
#     SHA256SUMS
#
# Then: optional off-site copy (BACKUP_UPLOAD_CMD), retention (sets older than
# BACKUP_RETENTION_DAYS = 30 deleted), one row in backup_runs (health check / runbook).
#
# Usage: scripts/backup.sh [--env-file FILE] [--dir DIR] [--no-files]
# Env:   DATABASE_URL, BACKUP_DIR (./backups), BACKUP_RETENTION_DAYS (30),
#        BACKUP_ENCRYPTION_KEY_FILE (passphrase file → AES-256), BACKUP_FILES (auto|true|false),
#        BACKUP_UPLOAD_CMD ("rclone copy {} remote:payhub/" — {} = set directory),
#        BACKUP_DB_SSL (false), BACKUP_RECORD (true), storage env of lib/storage.ts (S3_* …)
# Exit:  0 ok · 1 failed (nothing kept) · 3 local backup kept but off-site copy failed

source "$(dirname "${BASH_SOURCE[0]}")/backup-lib.sh"

WITH_FILES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) load_env_file "$2"; shift 2 ;;
    --dir) BACKUP_DIR="$2"; shift 2 ;;
    --no-files) WITH_FILES=false; shift ;;
    -h | --help) sed -n '2,25p' "$0"; exit 0 ;;
    *) die "unknown option $1" ;;
  esac
done

[ -n "$DUMP_BIN" ] || die "mariadb-dump / mysqldump not found"
parse_db_url
write_defaults

BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"

STARTED="$(date +%s)"
NAME="payhub-$(fmt_epoch "$STARTED")"
WORK="$BACKUP_DIR/.partial-$NAME"
FINAL="$BACKUP_DIR/$NAME"
ENC=""
[ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ] && ENC=".enc"
if [ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ] && [ ! -r "$BACKUP_ENCRYPTION_KEY_FILE" ]; then
  die "BACKUP_ENCRYPTION_KEY_FILE not readable: $BACKUP_ENCRYPTION_KEY_FILE"
fi

DONE=false
on_exit() {
  local code=$?
  if [ "$DONE" != "true" ]; then
    rm -rf "$WORK"
    record_run "$DB_NAME" backup failed "$NAME" "$STARTED" "" "{}" "${FAIL_REASON:-backup.sh exited with code $code}"
    log "backup FAILED: ${FAIL_REASON:-exit code $code}"
  fi
  cleanup_tmp
}
trap on_exit EXIT
step() { FAIL_REASON="$1"; log "$1"; }

mkdir -p "$WORK"
log "backup $NAME of $DB_NAME@$DB_HOST:$DB_PORT → $FINAL${ENC:+ (encrypted)}"

# ── manifest data (taken right before the dump; writes during the dump may add rows) ──
step "reading table list and row counts"
SERVER_VERSION="$(sql -e "SELECT VERSION()")"
TABLES="$(sql "$DB_NAME" -e "SELECT table_name FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name")"
[ -n "$TABLES" ] || die "database $DB_NAME has no tables"
COUNT_SQL=""
for t in $TABLES; do
  COUNT_SQL="${COUNT_SQL:+$COUNT_SQL UNION ALL }SELECT '$t', COUNT(*) FROM \`$t\`"
done
sql "$DB_NAME" -e "$COUNT_SQL" >"$WORK/rows.tsv"
sql "$DB_NAME" -e "SELECT trigger_name FROM information_schema.triggers
  WHERE trigger_schema = DATABASE() ORDER BY trigger_name" >"$WORK/triggers.txt"
sql "$DB_NAME" -e "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
  AND rolled_back_at IS NULL ORDER BY migration_name" >"$WORK/migrations.txt" 2>/dev/null || : >"$WORK/migrations.txt"

# ── database dump ──
step "dumping database"
"$DUMP_BIN" --defaults-extra-file="$DEFAULTS_FILE" --single-transaction --quick --routines \
  --triggers --events --hex-blob --no-tablespaces "$DB_NAME" |
  gzip -6 | encrypt_stream >"$WORK/db.sql.gz$ENC"
# a dump that stopped half-way has no completion line
decrypt_file "$WORK/db.sql.gz$ENC" | gzip -dc | tail -1 | grep -q "Dump completed" ||
  die "dump incomplete (no 'Dump completed' trailer)"

# ── stored files ──
FILES_COUNT=0
FILES_BYTES=0
FILES_DRIVER="skipped"
if [ "$WITH_FILES" != "false" ] && [ "${BACKUP_FILES:-auto}" != "false" ]; then
  if [ -n "${BACKUP_FILES_CMD:-}" ]; then
    FILES_CMD="$BACKUP_FILES_CMD"
  elif [ -f "$APP_DIR/dist/backup-files.mjs" ]; then
    FILES_CMD="node $APP_DIR/dist/backup-files.mjs"
  elif [ -x "$APP_DIR/node_modules/.bin/tsx" ]; then
    FILES_CMD="$APP_DIR/node_modules/.bin/tsx $APP_DIR/scripts/backup-files.ts"
  else
    FILES_CMD=""
  fi
  if [ -z "$FILES_CMD" ]; then
    [ "${BACKUP_FILES:-auto}" = "true" ] && die "no backup-files command (build:jobs or tsx)"
    log "warning: files skipped (no dist/backup-files.mjs / tsx)"
  else
    step "exporting stored files"
    FILES_TMP="$(mktemp -d "${TMPDIR:-/tmp}/payhub-files.XXXXXX")"
    TMP_FILES+=("$FILES_TMP")
    SUMMARY="$(cd "$APP_DIR" && $FILES_CMD export "$FILES_TMP")"
    FILES_COUNT="$(printf '%s' "$SUMMARY" | sed -E 's/.*"files":([0-9]+).*/\1/')"
    FILES_BYTES="$(printf '%s' "$SUMMARY" | sed -E 's/.*"bytes":([0-9]+).*/\1/')"
    FILES_DRIVER="$(printf '%s' "$SUMMARY" | sed -E 's/.*"driver":"([a-z0-9]+)".*/\1/')"
    tar -czf - -C "$FILES_TMP" . | encrypt_stream >"$WORK/files.tar.gz$ENC"
  fi
fi

# ── manifest + checksums ──
step "writing manifest"
DB_SIZE="$(file_size "$WORK/db.sql.gz$ENC")"
FILES_SIZE=0
[ -f "$WORK/files.tar.gz$ENC" ] && FILES_SIZE="$(file_size "$WORK/files.tar.gz$ENC")"
ROWS_JSON="$(awk -F'\t' 'BEGIN{printf "{"} {printf "%s\"%s\":%s", (NR>1?",":""), $1, $2} END{printf "}"}' "$WORK/rows.tsv")"
list_json() { awk 'BEGIN{printf "["} {printf "%s\"%s\"", (NR>1?",":""), $0} END{printf "]"}' "$1"; }
TOTAL_ROWS="$(awk -F'\t' '{s+=$2} END{print s+0}' "$WORK/rows.tsv")"
cat >"$WORK/manifest.json" <<EOF
{
  "name": $(json_str "$NAME"),
  "service": "payment-hub",
  "createdAt": $(json_str "$(date -u +%Y-%m-%dT%H:%M:%SZ)"),
  "host": $(json_str "$(hostname)"),
  "database": $(json_str "$DB_NAME"),
  "serverVersion": $(json_str "$SERVER_VERSION"),
  "dumpClient": $(json_str "$("$DUMP_BIN" --version 2>/dev/null | head -1)"),
  "encrypted": $([ -n "$ENC" ] && echo true || echo false),
  "tables": $(wc -l <"$WORK/rows.tsv" | tr -d ' '),
  "totalRows": $TOTAL_ROWS,
  "rows": $ROWS_JSON,
  "triggers": $(list_json "$WORK/triggers.txt"),
  "migrations": $(list_json "$WORK/migrations.txt"),
  "files": { "count": $FILES_COUNT, "bytes": $FILES_BYTES, "driver": $(json_str "$FILES_DRIVER") },
  "sizes": { "db": $DB_SIZE, "files": $FILES_SIZE }
}
EOF
(cd "$WORK" && sha256 db.sql.gz* $(ls files.tar.gz* 2>/dev/null) manifest.json rows.tsv triggers.txt migrations.txt >SHA256SUMS)
mv "$WORK" "$FINAL"
DONE=true
TOTAL_SIZE=$((DB_SIZE + FILES_SIZE))
log "backup $NAME ok: $(wc -l <"$FINAL/rows.tsv" | tr -d ' ') tables, $TOTAL_ROWS rows, $FILES_COUNT files, $TOTAL_SIZE bytes in $(($(date +%s) - STARTED)) s"

# ── off-site copy ──
UPLOAD_STATUS="none"
EXIT_CODE=0
if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  log "off-site copy"
  if sh -c "${BACKUP_UPLOAD_CMD//\{\}/$FINAL}"; then
    UPLOAD_STATUS="ok"
  else
    UPLOAD_STATUS="failed"
    EXIT_CODE=3
    log "warning: off-site copy FAILED — local set kept"
  fi
fi

# ── retention ──
CUTOFF="payhub-$(fmt_epoch $((STARTED - RETENTION_DAYS * 86400)))"
PRUNED=0
for d in "$BACKUP_DIR"/payhub-[0-9]*-[0-9]*; do
  [ -d "$d" ] || continue
  if [[ "$(basename "$d")" < "$CUTOFF" ]]; then
    rm -rf "$d"
    PRUNED=$((PRUNED + 1))
    log "retention: removed $(basename "$d") (> $RETENTION_DAYS days)"
  fi
done
# stale partial sets of crashed runs
find "$BACKUP_DIR" -maxdepth 1 -name '.partial-*' -mmin +1440 -exec rm -rf {} + 2>/dev/null || true
sql "$DB_NAME" -e "DELETE FROM backup_runs WHERE finished_at < NOW() - INTERVAL 400 DAY" 2>/dev/null || true

DETAILS="{\"tables\":$(wc -l <"$FINAL/rows.tsv" | tr -d ' '),\"rows\":$TOTAL_ROWS,\"files\":$FILES_COUNT,\"filesBytes\":$FILES_BYTES,\"encrypted\":$([ -n "$ENC" ] && echo true || echo false),\"upload\":\"$UPLOAD_STATUS\",\"pruned\":$PRUNED,\"dir\":$(json_str "$FINAL")}"
if [ "$UPLOAD_STATUS" = "failed" ]; then
  record_run "$DB_NAME" backup failed "$NAME" "$STARTED" "$TOTAL_SIZE" "$DETAILS" "off-site copy failed (local set kept)"
else
  record_run "$DB_NAME" backup success "$NAME" "$STARTED" "$TOTAL_SIZE" "$DETAILS"
fi
printf '%s\n' "$FINAL"
exit $EXIT_CODE
