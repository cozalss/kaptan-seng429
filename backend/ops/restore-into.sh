#!/bin/sh
# Restore a dump from the backup folder into the scratch database kaptan_restore (never into the live one), for
# geri-yukle.ps1. Runs in the `backup` service (it has psql, pg_restore, /ops and /yedek).
#   sh /ops/restore-into.sh kaptan-….dump      replace kaptan_restore with this dump
#   sh /ops/restore-into.sh --drop             drop kaptan_restore
#   sh /ops/restore-into.sh --swap <old name>  live database -> <old name>, kaptan_restore -> live (app stopped)
set -eu
url="${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL}"
base="${url%/*}"
PGPASSWORD="$(printf '%s' "$url" | sed -nE 's#^[a-z]+://[^:/@]*:([^@]*)@.*#\1#p')"
export PGPASSWORD
admin="$(printf '%s' "$base/postgres" | sed -E 's#^([a-z]+://[^:/@]*):[^@]*@#\1@#')"

sql() { psql -qtAX -v ON_ERROR_STOP=1 --dbname="$admin" -c "$1"; }
drop_scratch() { sql 'DROP DATABASE IF EXISTS kaptan_restore WITH (FORCE)'; }

case "${1:?usage: restore-into.sh <dump> | --drop | --swap <old name>}" in
  --drop)
    drop_scratch ;;
  --swap)
    old="${2:?give the name for the old database}"
    case "$old" in *[!a-z0-9_]*) echo "restore: bad name" >&2; exit 2 ;; esac
    sql "ALTER DATABASE kaptan RENAME TO $old" 2>/dev/null || {
      sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'kaptan' AND pid <> pg_backend_pid()" >/dev/null
      sql "ALTER DATABASE kaptan RENAME TO $old"
    }
    sql 'ALTER DATABASE kaptan_restore RENAME TO kaptan' ;;
  *)
    case "$1" in */*|*..*) echo "restore: give a file name from the backup folder" >&2; exit 2 ;; esac
    drop_scratch
    sql 'CREATE DATABASE kaptan_restore'
    RESTORE_DATABASE_URL="$base/kaptan_restore" sh /ops/restore.sh "/yedek/$1" ;;
esac
