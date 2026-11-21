#!/usr/bin/env bash
# Daily backup scheduler (P7.5) — the `backup` service of docker-compose.yml runs this.
#   BACKUP_TIME      HH:MM local time of TZ (default 01:30, TZ Asia/Ho_Chi_Minh in compose)
#   BACKUP_VERIFY    true (default) → restore test (backup-verify.sh) right after each backup
#   BACKUP_ON_START  true → one backup when the container starts (first deployment)
# Outside Docker use cron / a systemd timer instead:
#   30 1 * * *  cd /srv/payment-hub && scripts/backup.sh --env-file .env.production && scripts/backup-verify.sh --env-file .env.production
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AT="${BACKUP_TIME:-01:30}"
LAST=""

run() {
  if bash "$DIR/backup.sh" "$@"; then
    if [ "${BACKUP_VERIFY:-true}" = "true" ]; then bash "$DIR/backup-verify.sh" latest || true; fi
  fi
  # liveness for the container healthcheck: the scheduler loop is alive
  date +%s >"${BACKUP_HEARTBEAT_FILE:-/tmp/payhub-backup.alive}"
}

echo "[backup-cron] daily at $AT ($(date +%Z)), dir ${BACKUP_DIR:-./backups}, retention ${BACKUP_RETENTION_DAYS:-30} days"
date +%s >"${BACKUP_HEARTBEAT_FILE:-/tmp/payhub-backup.alive}"
if [ "${BACKUP_ON_START:-false}" = "true" ]; then run; LAST="$(date +%F)"; fi
while true; do
  now="$(date +%H:%M)"
  today="$(date +%F)"
  if [ "$now" = "$AT" ] && [ "$LAST" != "$today" ]; then
    LAST="$today"
    run
  fi
  date +%s >"${BACKUP_HEARTBEAT_FILE:-/tmp/payhub-backup.alive}"
  sleep 20
done
