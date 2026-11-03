#!/bin/sh
# The `warmup` service: every hour ask whether a warm-up is needed (kaptan.live.warmup --if-needed decides).
# Long-running on purpose: after a reboot Docker restarts it, so a PC that was off for days catches up without
# anyone starting anything. A plain restart asks once and does nothing.
set -u
EVERY_S=3600
child=""
trap '[ -n "$child" ] && kill "$child" 2>/dev/null; exit 0' TERM INT

python /ops/wait_ready.py || exit 1
while :; do
  python -m kaptan.live.warmup --if-needed &
  child=$!
  wait "$child" || echo "warmup: failed, asking again in an hour" >&2
  sleep "$EVERY_S" &
  child=$!
  wait "$child"
done
