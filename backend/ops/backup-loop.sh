#!/bin/sh
# The `backup` service: one backup per Istanbul day, from BACKUP_HOUR on. Checks every 10 minutes rather than
# sleeping until 03:00, so a PC that slept through the night backs up as soon as it wakes. A database without any
# backup gets one right away. "Done today" is the `backup` row in ops.job_runs (backup-once.sh), the same fact the
# panel's status reads. A failure is retried after an hour. A request made in the panel ("Şimdi yedek al") is picked up within 15 seconds.
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

# "Şimdi yedek al" in the panel writes ops.backup_request.requested_at. The loop looks every TICK_S seconds; taking
# the request (started_at) and its result (finished_at, ok) are what the panel shows.
TICK_S=15
take_request() {
  psql -qtAX --dbname="$url_nopw" -c "UPDATE ops.backup_request SET started_at = now()
    WHERE id = 1 AND requested_at IS NOT NULL AND started_at IS NULL RETURNING 1" 2>/dev/null
}
finish_request() {
  psql -qtAX --dbname="$url_nopw" -c "UPDATE ops.backup_request SET finished_at = now(), ok = $1 WHERE id = 1" >/dev/null 2>&1
}

due_in=0
while :; do
  if [ "$(take_request)" = 1 ]; then
    if BACKUP_TRIGGER=manual sh /ops/backup-once.sh; then finish_request true; else finish_request false; fi
  fi
  if [ "$due_in" -le 0 ]; then
    due_in="$CHECK_S"
    if last="$(last_backup_day 2>/dev/null)"; then
      today="$(date +%F)"
      hour="$(date +%H)"
      if [ "$last" = none ] || { [ "${hour#0}" -ge "$hour_from" ] && [ "$last" != "$today" ]; }; then
        sh /ops/backup-once.sh || due_in="$RETRY_S"
      fi
    else
      due_in=5  # the database is not up yet, or not migrated yet
    fi
  fi
  step="$TICK_S"
  [ "$due_in" -lt "$step" ] && step="$due_in"
  [ "$step" -lt 1 ] && step=1
  pause "$step"
  due_in=$((due_in - step))
done
