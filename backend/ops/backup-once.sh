#!/bin/sh
# One backup with a record: ops/backup.sh, then a row in ops.job_runs (job `backup`) that the nightly loop and the
# panel's status read. Also the "take one now" command:
#   docker compose exec backup sh /ops/backup-once.sh
set -u
url="${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL}"
PGPASSWORD="$(printf '%s' "$url" | sed -nE 's#^[a-z]+://[^:/@]*:([^@]*)@.*#\1#p')"
export PGPASSWORD
url_nopw="$(printf '%s' "$url" | sed -E 's#^([a-z]+://[^:/@]*):[^@]*@#\1@#')"

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
today="$(date +%F)"
if sh /ops/backup.sh; then
  ok=true
else
  ok=false
  echo "backup: FAILED" >&2
fi

psql -qtAX --dbname="$url_nopw" -c "INSERT INTO ops.job_runs (job, slot, trigger, started_at, finished_at, ok)
  VALUES ('backup', '$today', 'schedule', '$started', now(), $ok)" \
  || echo "backup: result not recorded in ops.job_runs" >&2

[ "$ok" = true ]
