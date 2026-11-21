#!/usr/bin/env bash
# Payment Hub restore (P7.5) — restore a backup set made by scripts/backup.sh.
#
# Usage: scripts/restore.sh [--env-file FILE] [SET_DIR|latest] --target-db NAME [--force]
#                           [--files] [--dir BACKUP_DIR]
#   SET_DIR       backup set directory (default: latest in BACKUP_DIR)
#   --target-db   database to restore into (DB server / credentials of DATABASE_URL). Refused when
#                 it already has tables unless --force (then it is DROPPED and re-created).
#   --files       also upload the stored files back to the storage of the environment (S3_* /
#                 STORAGE_LOCAL_DIR) — same keys, existing objects overwritten.
#
# Steps of a real recovery: documents/DR-Runbook-PaymentHub.md §4 (stop app + workers first,
# restore, `npm run db:migrate` if the code is newer, start, check /api/v1/health).

source "$(dirname "${BASH_SOURCE[0]}")/backup-lib.sh"

SET=""
TARGET=""
FORCE=false
WITH_FILES=false
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) load_env_file "$2"; shift 2 ;;
    --target-db) TARGET="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    --files) WITH_FILES=true; shift ;;
    --dir) BACKUP_DIR="$2"; shift 2 ;;
    -h | --help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) die "unknown option $1" ;;
    *) SET="$1"; shift ;;
  esac
done
[ -n "$TARGET" ] || die "--target-db is required"
case "$TARGET" in *[!A-Za-z0-9_]*) die "invalid database name: $TARGET" ;; esac

parse_db_url
write_defaults
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
[ -z "$SET" ] || [ "$SET" = "latest" ] && SET="$(latest_set "$BACKUP_DIR")"
SET="$(cd "$SET" && pwd)"
STARTED="$(date +%s)"

log "restore $(basename "$SET") → $TARGET@$DB_HOST:$DB_PORT"
verify_checksums "$SET"

EXISTING="$(sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = $(sql_str "$TARGET")")"
if [ "$EXISTING" -gt 0 ]; then
  [ "$FORCE" = "true" ] || die "database $TARGET has $EXISTING tables — use --force to drop and replace it"
  log "dropping existing database $TARGET ($EXISTING tables)"
  sql -e "DROP DATABASE \`$TARGET\`"
fi
sql -e "CREATE DATABASE IF NOT EXISTS \`$TARGET\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

restore_dump "$SET" "$TARGET"
TABLES="$(sql -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = $(sql_str "$TARGET") AND table_type = 'BASE TABLE'")"
log "database restored: $TABLES tables"

FILES=0
if [ "$WITH_FILES" = "true" ]; then
  ARCHIVE="$(ls "$SET"/files.tar.gz* 2>/dev/null | head -1 || true)"
  if [ -z "$ARCHIVE" ]; then
    log "no files archive in the set — skipped"
  else
    FILES_TMP="$(mktemp -d "${TMPDIR:-/tmp}/payhub-files.XXXXXX")"
    TMP_FILES+=("$FILES_TMP")
    decrypt_file "$ARCHIVE" | tar -xzf - -C "$FILES_TMP"
    if [ -f "$APP_DIR/dist/backup-files.mjs" ]; then
      SUMMARY="$(cd "$APP_DIR" && node dist/backup-files.mjs import "$FILES_TMP")"
    else
      SUMMARY="$(cd "$APP_DIR" && node_modules/.bin/tsx scripts/backup-files.ts import "$FILES_TMP")"
    fi
    FILES="$(printf '%s' "$SUMMARY" | sed -E 's/.*"files":([0-9]+).*/\1/')"
    log "files restored: $SUMMARY"
  fi
fi

DUR=$(($(date +%s) - STARTED))
record_run "$TARGET" restore success "$(basename "$SET")" "$STARTED" "" \
  "{\"target\":$(json_str "$TARGET"),\"tables\":$TABLES,\"files\":$FILES}"
log "restore done in $DUR s — next: npm run db:migrate (newer code), start app + workers, check /api/v1/health"
