# shellcheck shell=bash
# Shared helpers of scripts/backup.sh, restore.sh, backup-verify.sh (P7.5).
# Portable: bash 3.2 (macOS) and bash 5 (Alpine ops image); needs mariadb (or mysql) client,
# gzip, tar, openssl (encryption only), sha256sum or shasum. No jq.

set -euo pipefail
umask 077 # backup sets hold every transaction — owner only

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# KEY=VALUE lines → environment, without overriding variables already set (explicit env wins).
load_env_file() {
  local f="$1" line key val
  [ -f "$f" ] || die "env file not found: $f"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | '#'*) continue ;; esac
    line="${line#export }"
    key="${line%%=*}"
    val="${line#*=}"
    case "$key" in '' | *[!A-Za-z0-9_]*) continue ;; esac
    case "$val" in
      \"*\") val="${val#\"}"; val="${val%\"}" ;;
      \'*\') val="${val#\'}"; val="${val%\'}" ;;
    esac
    if [ -z "${!key+x}" ]; then export "$key=$val"; fi
  done <"$f"
}

urldecode() {
  local s="${1//+/ }"
  printf '%b' "${s//%/\\x}"
}

# DATABASE_URL (mysql://user:pass@host:port/db?…) → DB_USER DB_PASS DB_HOST DB_PORT DB_NAME
parse_db_url() {
  local u="${DATABASE_URL:?DATABASE_URL is not set}"
  u="${u#*://}"
  local cred="${u%%@*}" rest="${u#*@}"
  DB_USER="$(urldecode "${cred%%:*}")"
  DB_PASS=""
  case "$cred" in *:*) DB_PASS="$(urldecode "${cred#*:}")" ;; esac
  local hostport="${rest%%/*}" path="${rest#*/}"
  DB_NAME="${path%%\?*}"
  DB_HOST="${hostport%%:*}"
  DB_PORT="${hostport##*:}"
  [ "$DB_PORT" = "$hostport" ] && DB_PORT=3306
  # "localhost" would make the client use a unix socket
  [ "$DB_HOST" = "localhost" ] && DB_HOST=127.0.0.1
  [ -n "$DB_NAME" ] || die "DATABASE_URL has no database name"
  return 0
}

MYSQL_BIN="$(command -v mariadb || command -v mysql || true)"
DUMP_BIN="$(command -v mariadb-dump || command -v mysqldump || true)"

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$@"; }
else
  sha256() { shasum -a 256 "$@"; }
fi

TMP_FILES=()
cleanup_tmp() {
  local f
  for f in "${TMP_FILES[@]:-}"; do [ -n "$f" ] && rm -rf "$f"; done
  return 0
}
trap cleanup_tmp EXIT

# Client option file (password never on the command line / in `ps`)
write_defaults() {
  [ -n "$MYSQL_BIN" ] || die "mariadb / mysql client not found"
  DEFAULTS_FILE="$(mktemp "${TMPDIR:-/tmp}/payhub-db.XXXXXX")"
  TMP_FILES+=("$DEFAULTS_FILE")
  chmod 600 "$DEFAULTS_FILE"
  local pass="${DB_PASS//\\/\\\\}"
  pass="${pass//\"/\\\"}"
  {
    echo "[client]"
    echo "user=$DB_USER"
    echo "password=\"$pass\""
    echo "host=$DB_HOST"
    echo "port=$DB_PORT"
    echo "default-character-set=utf8mb4"
    # TLS to the DB server: BACKUP_DB_SSL=true (production); dev / compose servers have no TLS and
    # MariaDB 11.4+ clients require it by default
    if [ "${BACKUP_DB_SSL:-false}" != "true" ]; then echo "skip-ssl"; fi
  } >"$DEFAULTS_FILE"
}

sql() { "$MYSQL_BIN" --defaults-extra-file="$DEFAULTS_FILE" --batch --skip-column-names "$@"; }

# Encryption of backup files: AES-256-CBC + PBKDF2 (200 000 iterations), passphrase in a file
encrypt_stream() {
  if [ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$BACKUP_ENCRYPTION_KEY_FILE"
  else
    cat
  fi
}
decrypt_file() { # file → stdout
  case "$1" in
    *.enc)
      [ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ] || die "$1 is encrypted — set BACKUP_ENCRYPTION_KEY_FILE"
      openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$BACKUP_ENCRYPTION_KEY_FILE" -in "$1"
      ;;
    *) cat "$1" ;;
  esac
}

file_size() { wc -c <"$1" | tr -d ' '; }

# Epoch → payhub-YYYYmmdd-HHMMSS timestamp part (BSD and GNU / busybox date)
fmt_epoch() { date -u -r "$1" +%Y%m%d-%H%M%S 2>/dev/null || date -u -d "@$1" +%Y%m%d-%H%M%S; }

json_str() { # minimal JSON string escaping
  local s="${1//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\t'/ }"
  printf '"%s"' "$s"
}

sql_str() { # SQL string literal
  local s="${1//\\/\\\\}"
  printf "'%s'" "${s//\'/\'\'}"
}

# Journal row in backup_runs of database $1 (best effort: missing table → warning only)
record_run() { # db kind status name started_epoch size details_json error
  local db="$1" kind="$2" status="$3" name="$4" started="$5" size="$6" details="$7" error="${8:-}"
  [ "${BACKUP_RECORD:-true}" = "true" ] || return 0
  local now dur
  now="$(date +%s)"
  dur=$((now - started))
  sql "$db" -e "SET time_zone = '+00:00'; INSERT INTO backup_runs
    (kind, status, backup_name, started_at, finished_at, duration_s, size_bytes, host, details, error)
    VALUES ($(sql_str "$kind"), $(sql_str "$status"), $(sql_str "$name"), FROM_UNIXTIME($started),
      FROM_UNIXTIME($now), $dur, ${size:-NULL}, $(sql_str "$(hostname)"),
      $(sql_str "$details"), $([ -n "$error" ] && sql_str "${error:0:1000}" || echo NULL))" 2>/dev/null ||
    log "warning: could not write backup_runs in $db (migration 14_backup_runs applied?)"
}

# Latest backup set in BACKUP_DIR
latest_set() {
  local dir="$1" last=""
  local d
  for d in "$dir"/payhub-[0-9]*-[0-9]*; do [ -d "$d" ] && last="$d"; done
  [ -n "$last" ] || die "no backup set in $dir"
  printf '%s\n' "$last"
}

verify_checksums() { # set dir
  (cd "$1" && sha256 -c SHA256SUMS >/dev/null) || die "checksum mismatch in $1"
}

# Restore the DB dump of a set into database $2 (must exist and be empty, or --force by caller)
restore_dump() { # set dir, target db
  local set="$1" target="$2" dump
  dump="$(ls "$set"/db.sql.gz* 2>/dev/null | head -1)"
  [ -n "$dump" ] || die "no db.sql.gz in $set"
  case "$dump" in *.enc) [ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ] || {
    log "$dump is encrypted — set BACKUP_ENCRYPTION_KEY_FILE"
    return 1
  } ;; esac
  # - the sandbox comment of MariaDB ≥ 11.4 dumps breaks older clients
  # - DEFINER clauses removed: objects belong to the restoring user (needs no SUPER)
  decrypt_file "$dump" | gzip -dc |
    sed -E -e '/^\/\*M?!999999\\- enable the sandbox mode \*\/$/d' \
      -e 's/DEFINER=`[^`]*`@`[^`]*`//g' |
    sql "$target"
}
