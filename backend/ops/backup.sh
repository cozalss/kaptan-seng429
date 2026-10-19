#!/bin/sh
# Nightly logical backup of the KAPtan database: pg_dump custom format (-Fc), optionally age-encrypted.
#
#   BACKUP_DATABASE_URL=postgresql://kaptan_owner:...@host:5432/kaptan BACKUP_DIR=/backups sh ops/backup.sh
#   (docker-compose.prod.yml: docker compose ... --profile backup run --rm backup; cron it nightly)
#
# Env:
#   BACKUP_DATABASE_URL  source database (owner role: it reads every schema, the audit ledger included)
#   BACKUP_DIR           where kaptan-<UTC time>.dump[.age] + .sha256 go (default ./backups)
#   BACKUP_KEEP_DAYS     delete older dumps (default 14; 0 = keep everything)
#   AGE_RECIPIENTS       age public keys (space/comma separated): encrypt the dump; never a secret key
#   AGE_INSTALL=1        apt-get install age when it is missing (the pgvector image has no age)
#   BACKUP_OUT=-         write the (encrypted) dump to stdout instead of a file (tests, pipes)
# The password never appears on a command line: it is moved from the URL into PGPASSWORD.
set -eu

url="${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL}"
PGPASSWORD="$(printf '%s' "$url" | sed -nE 's#^[a-z]+://[^:/@]*:([^@]*)@.*#\1#p')"
export PGPASSWORD
url_nopw="$(printf '%s' "$url" | sed -E 's#^([a-z]+://[^:/@]*):[^@]*@#\1@#')"

recipients=""
if [ -n "${AGE_RECIPIENTS:-}" ]; then
  if ! command -v age >/dev/null 2>&1; then
    if [ "${AGE_INSTALL:-0}" = "1" ] && command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq >/dev/null && apt-get install -y -qq age >/dev/null
    else
      echo "backup: AGE_RECIPIENTS is set but 'age' is not installed (set AGE_INSTALL=1)" >&2
      exit 3
    fi
  fi
  for r in $(printf '%s' "$AGE_RECIPIENTS" | tr ',' ' '); do
    case "$r" in
      age1*) recipients="$recipients -r $r" ;;
      *) echo "backup: AGE_RECIPIENTS must list age1… public keys only" >&2; exit 3 ;;
    esac
  done
fi

dump() {
  if [ -n "$recipients" ]; then
    # shellcheck disable=SC2086  # one -r per recipient
    pg_dump -Fc --dbname="$url_nopw" | age $recipients
  else
    pg_dump -Fc --dbname="$url_nopw"
  fi
}

if [ "${BACKUP_OUT:-}" = "-" ]; then
  dump
  exit 0
fi

dir="${BACKUP_DIR:-./backups}"
mkdir -p "$dir"
umask 077
ts="$(date -u +%Y%m%dT%H%M%SZ)"
name="kaptan-$ts.dump"
[ -n "$recipients" ] && name="$name.age"
tmp="$dir/.$name.partial"
trap 'rm -f "$tmp"' EXIT
dump > "$tmp"
[ -s "$tmp" ] || { echo "backup: empty dump" >&2; exit 1; }
mv "$tmp" "$dir/$name"
(cd "$dir" && sha256sum "$name" > "$name.sha256")
echo "backup: $dir/$name ($(wc -c < "$dir/$name") bytes)"

keep="${BACKUP_KEEP_DAYS:-14}"
if [ "$keep" -gt 0 ] 2>/dev/null; then
  find "$dir" -maxdepth 1 -name 'kaptan-*.dump*' -mtime "+$keep" -print -delete | sed 's/^/backup: removed /'
fi
