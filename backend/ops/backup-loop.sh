#!/bin/sh
# The `backup` service: one backup per Istanbul day, from BACKUP_HOUR on. Checks every 10 minutes rather than
# sleeping until 03:00, so a PC that slept through the night backs up as soon as it wakes. A database without any
# backup gets one right away. "Done today" is the `backup` row in ops.job_runs (backup-once.sh), the same fact the
# panel's status reads. A failure is retried after an hour.
set -u
CHECK_S=600
RETRY_S=3600
hour_from="${BACKUP_HOUR:-3}"
url="${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL}"
PGPASSWORD="$(printf '%s' "$url" | sed -nE 's#^[a-z]+://[^:/@]*:([^@]*)@.*#\1#p')"
export PGPASSWORD
url_nopw="$(printf '%s' "$url" | sed -E 's#^([a-z]+://[^:/@]*):[^@]*@#\1@#')"
child=""
trap '[ -n "$child" ] && kill "$child" 2>/dev/null; exit 0' TERM INT

pause() {
  sleep "$1" &
  child=$!
  wait "$child"
}

last_backup_day() {
  psql -qtAX --dbname="$url_nopw" -c "SELECT coalesce(max(slot), 'none') FROM ops.job_runs WHERE job = 'backup' AND ok"
}

while :; do
  wait_s="$CHECK_S"
  if last="$(last_backup_day 2>/dev/null)"; then
    today="$(date +%F)"
    hour="$(date +%H)"
    if [ "$last" = none ] || { [ "${hour#0}" -ge "$hour_from" ] && [ "$last" != "$today" ]; }; then
      sh /ops/backup-once.sh || wait_s="$RETRY_S"
    fi
  else
    wait_s=5  # the database is not up yet, or not migrated yet
  fi
  pause "$wait_s"
done
