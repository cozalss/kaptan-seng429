#!/bin/sh
# Entrypoint of every long-running KAPtan service (docker-compose.yml): wait for the database and Redis, then
# hand over to the image's own entrypoint. After a reboot Docker starts containers in no particular order and
# compose's depends_on does not apply, so each service makes sure by itself.
#
# The waiting runs in the background and TERM is trapped: this shell is PID 1 and ignores TERM by default, so
# without the trap `durdur` would sit out the whole stop_grace_period of a service that is only waiting.
set -eu
python /ops/wait_ready.py &
waiter=$!
trap 'kill "$waiter" 2>/dev/null; exit 143' TERM INT
wait "$waiter"
trap - TERM INT
exec docker-entrypoint.sh "$@"
