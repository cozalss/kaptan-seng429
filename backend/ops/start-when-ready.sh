#!/bin/sh
# Entrypoint of every long-running KAPtan service (docker-compose.yml): wait for the database and Redis, then
# hand over to the image's own entrypoint. After a reboot Docker starts containers in no particular order and
# compose's depends_on does not apply, so each service makes sure by itself.
set -eu
python /ops/wait_ready.py
exec docker-entrypoint.sh "$@"
