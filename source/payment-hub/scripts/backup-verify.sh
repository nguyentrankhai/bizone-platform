#!/usr/bin/env bash
# Payment Hub restore test (P7.5) — proves a backup set can be restored, without touching the
# live database: restore into a scratch database on the same server, compare with the manifest,
# drop it. Run after every backup in the scheduler (BACKUP_VERIFY=true) and monthly by hand
# (documents/DR-Runbook-PaymentHub.md §6).
#
# Usage: scripts/backup-verify.sh [--env-file FILE] [SET_DIR|latest] [--keep] [--dir BACKUP_DIR]
#   scratch database: $BACKUP_VERIFY_DB (default <db>_restore_check) — dropped unless --keep
#
# Checks (any FAIL → exit 1):
#   1 checksums of every file (SHA256SUMS)
#   2 the dump restores without error
#   3 every table of the manifest exists; row counts equal (a difference is a WARNING: rows
#     written while the dump ran); a table restored empty that had rows = FAIL
#   4 every trigger exists, and the append-only rule still holds (UPDATE audit_logs refused)
#   5 the same Prisma migrations are recorded
#   6 the files archive extracts and holds the manifest's file count
# Result + duration (≈ RTO of a restore) → backup_runs (kind "verify") of the live database.

source "$(dirname "${BASH_SOURCE[0]}")/backup-lib.sh"

SET=""
KEEP=false
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) load_env_file "$2"; shift 2 ;;
    --keep) KEEP=true; shift ;;
    --dir) BACKUP_DIR="$2"; shift 2 ;;
    -h | --help) sed -n '2,20p' "$0"; exit 0 ;;
    -*) die "unknown option $1" ;;
    *) SET="$1"; shift ;;
  esac
done

parse_db_url
write_defaults
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
{ [ -z "$SET" ] || [ "$SET" = "latest" ]; } && SET="$(latest_set "$BACKUP_DIR")"
SET="$(cd "$SET" && pwd)"
NAME="$(basename "$SET")"
SCRATCH="${BACKUP_VERIFY_DB:-${DB_NAME}_restore_check}"
case "$SCRATCH" in *[!A-Za-z0-9_]*) die "invalid scratch database name" ;; esac
[ "$SCRATCH" != "$DB_NAME" ] || die "scratch database must differ from the live database"
STARTED="$(date +%s)"

FAILS=0
WARNS=0
REPORT=""
ok() { REPORT="$REPORT\n  ✔ $*"; }
warn() { REPORT="$REPORT\n  ⚠ $*"; WARNS=$((WARNS + 1)); }
fail() { REPORT="$REPORT\n  ✘ $*"; FAILS=$((FAILS + 1)); }

finish() {
  local code=$?
  if [ "$KEEP" != "true" ]; then sql -e "DROP DATABASE IF EXISTS \`$SCRATCH\`" 2>/dev/null || true; fi
  local dur=$(($(date +%s) - STARTED)) status=success
  [ "$FAILS" -eq 0 ] && [ "$code" -eq 0 ] || status=failed
  [ "$code" -ne 0 ] && [ "$FAILS" -eq 0 ] && fail "aborted (exit $code)"
  printf "restore test %s → %s: %s (%d fail, %d warning, %d s)%b\n" "$NAME" "$SCRATCH" \
    "$status" "$FAILS" "$WARNS" "$dur" "$REPORT"
  record_run "$DB_NAME" verify "$status" "$NAME" "$STARTED" "" \
    "{\"scratchDb\":$(json_str "$SCRATCH"),\"fails\":$FAILS,\"warnings\":$WARNS,\"restoreSeconds\":${RESTORE_S:-null}}" \
    "$([ "$status" = failed ] && printf '%b' "$REPORT" | grep '✘' | head -5 | tr '\n' ' ')"
  cleanup_tmp
  [ "$status" = success ] || exit 1
}
trap finish EXIT

log "restore test of $NAME into $SCRATCH"

# 1 checksums
if (cd "$SET" && sha256 -c SHA256SUMS >/dev/null 2>&1); then
  ok "checksums ($(wc -l <"$SET/SHA256SUMS" | tr -d ' ') files)"
else
  fail "checksum mismatch"
  exit 1
fi

# 2 restore
sql -e "DROP DATABASE IF EXISTS \`$SCRATCH\`"
sql -e "CREATE DATABASE \`$SCRATCH\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
R0="$(date +%s)"
if restore_dump "$SET" "$SCRATCH"; then
  RESTORE_S=$(($(date +%s) - R0))
  ok "dump restored in ${RESTORE_S} s ($(file_size "$(ls "$SET"/db.sql.gz* | head -1)") bytes compressed)"
else
  fail "dump restore failed"
  exit 1
fi

# 3 tables + row counts
COUNT_SQL=""
while IFS=$'\t' read -r t _; do
  [ -n "$t" ] || continue
  COUNT_SQL="${COUNT_SQL:+$COUNT_SQL UNION ALL }SELECT '$t', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '$t')"
done <"$SET/rows.tsv"
MISSING="$(sql "$SCRATCH" -e "$COUNT_SQL" | awk -F'\t' '$2 == 0 {print $1}')"
if [ -n "$MISSING" ]; then
  fail "missing tables: $(echo $MISSING)"
else
  ok "$(wc -l <"$SET/rows.tsv" | tr -d ' ') tables present"
  COUNT_SQL=""
  while IFS=$'\t' read -r t _; do
    COUNT_SQL="${COUNT_SQL:+$COUNT_SQL UNION ALL }SELECT '$t', COUNT(*) FROM \`$t\`"
  done <"$SET/rows.tsv"
  sql "$SCRATCH" -e "$COUNT_SQL" >"$SET/.verify-rows.tsv.$$"
  TMP_FILES+=("$SET/.verify-rows.tsv.$$")
  DIFFS="$(awk -F'\t' 'NR==FNR {m[$1]=$2; next} ($1 in m) && m[$1] != $2 {printf "%s %s→%s; ", $1, m[$1], $2}' "$SET/rows.tsv" "$SET/.verify-rows.tsv.$$")"
  EMPTIED="$(awk -F'\t' 'NR==FNR {m[$1]=$2; next} ($1 in m) && m[$1] > 0 && $2 == 0 {print $1}' "$SET/rows.tsv" "$SET/.verify-rows.tsv.$$")"
  TOTAL="$(awk -F'\t' '{s+=$2} END{print s+0}' "$SET/.verify-rows.tsv.$$")"
  if [ -n "$EMPTIED" ]; then
    fail "tables restored empty: $(echo $EMPTIED)"
  elif [ -n "$DIFFS" ]; then
    warn "row counts differ from the manifest (writes during the dump?): $DIFFS"
  else
    ok "row counts match the manifest ($TOTAL rows)"
  fi
fi

# 4 triggers + append-only rule
sql "$SCRATCH" -e "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = DATABASE() ORDER BY trigger_name" >"$SET/.verify-trg.$$"
TMP_FILES+=("$SET/.verify-trg.$$")
if diff -q "$SET/triggers.txt" "$SET/.verify-trg.$$" >/dev/null; then
  ok "$(wc -l <"$SET/triggers.txt" | tr -d ' ') triggers present"
else
  fail "triggers differ: $(diff "$SET/triggers.txt" "$SET/.verify-trg.$$" | grep '^[<>]' | tr '\n' ' ')"
fi
if grep -q "^audit_logs"$'\t' "$SET/rows.tsv"; then
  if [ "$(sql "$SCRATCH" -e "SELECT COUNT(*) FROM audit_logs")" -gt 0 ]; then
    if sql "$SCRATCH" -e "UPDATE audit_logs SET description = description ORDER BY id LIMIT 1" 2>/dev/null; then
      fail "append-only rule lost: UPDATE audit_logs accepted"
    else
      ok "append-only rule holds (UPDATE audit_logs refused)"
    fi
  fi
fi

# 5 migrations
if [ -s "$SET/migrations.txt" ]; then
  sql "$SCRATCH" -e "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name" >"$SET/.verify-mig.$$"
  TMP_FILES+=("$SET/.verify-mig.$$")
  if diff -q "$SET/migrations.txt" "$SET/.verify-mig.$$" >/dev/null; then
    ok "$(wc -l <"$SET/migrations.txt" | tr -d ' ') migrations recorded (newest: $(sort -t_ -k1,1n "$SET/migrations.txt" | tail -1))"
  else
    fail "migrations differ"
  fi
fi

# 6 files
ARCHIVE="$(ls "$SET"/files.tar.gz* 2>/dev/null | head -1 || true)"
EXPECTED="$(sed -nE 's/.*"files": \{ "count": ([0-9]+).*/\1/p' "$SET/manifest.json")"
if [ -n "$ARCHIVE" ]; then
  N="$(decrypt_file "$ARCHIVE" | tar -tzf - | grep -c '^\./objects/.*[^/]$' || true)"
  if [ "$N" = "${EXPECTED:-0}" ]; then
    ok "files archive holds $N files"
  else
    fail "files archive holds $N files, manifest says ${EXPECTED:-?}"
  fi
elif [ "${EXPECTED:-0}" != "0" ]; then
  fail "files archive missing"
fi
