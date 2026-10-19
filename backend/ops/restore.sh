#!/bin/sh
# Restore a KAPtan backup (ops/backup.sh) into an EMPTY database, then check the audit ledger.
#
#   RESTORE_DATABASE_URL=postgresql://kaptan_owner:...@host:5432/kaptan_restore sh ops/restore.sh backups/kaptan-….dump
#   ... sh ops/restore.sh backups/kaptan-….dump.age      # AGE_IDENTITY_FILE=/path/key.txt (the secret key)
#   ... sh ops/restore.sh -   < dump                       # stdin (unencrypted)
#
# Env:
#   RESTORE_DATABASE_URL  target database; it must exist and be empty (createdb first)
#   RESTORE_CLEAN=1       allow a non-empty target: drop the objects of the dump first (--clean --if-exists)
#   AGE_IDENTITY_FILE     age identity for *.age dumps
# Roles are not in the dump: create kaptan_app first (python -m kaptan.bootstrap roles) so its grants restore.
# Afterwards verify the ledger as the app would:  uv run python -m kaptan.ops.backup verify --url <target>
set -eu

src="${1:?usage: restore.sh <dump file | ->}"
url="${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL}"
PGPASSWORD="$(printf '%s' "$url" | sed -nE 's#^[a-z]+://[^:/@]*:([^@]*)@.*#\1#p')"
export PGPASSWORD
url_nopw="$(printf '%s' "$url" | sed -E 's#^([a-z]+://[^:/@]*):[^@]*@#\1@#')"

if [ "$src" != "-" ] && [ -f "$src.sha256" ]; then
  (cd "$(dirname "$src")" && sha256sum -c "$(basename "$src").sha256") >&2
fi

clean=""
existing="$(psql -qtAX --dbname="$url_nopw" -c "SELECT count(*) FROM pg_namespace WHERE nspname IN ('auth','core','trading','audit','ops')")"
if [ "$existing" != "0" ]; then
  if [ "${RESTORE_CLEAN:-0}" = "1" ]; then
    clean="--clean --if-exists"
  else
    echo "restore: the target database is not empty (set RESTORE_CLEAN=1 to replace it)" >&2
    exit 3
  fi
fi

decrypt() {
  case "$src" in
    *.age)
      [ -n "${AGE_IDENTITY_FILE:-}" ] || { echo "restore: set AGE_IDENTITY_FILE for $src" >&2; exit 3; }
      age -d -i "$AGE_IDENTITY_FILE" "$src" ;;
    -) cat ;;
    *) cat "$src" ;;
  esac
}

# shellcheck disable=SC2086  # $clean is two flags or nothing
decrypt | pg_restore --exit-on-error --no-owner $clean --dbname="$url_nopw"
echo "restore: done into $(printf '%s' "$url_nopw" | sed -E 's#^.*/##')" >&2
