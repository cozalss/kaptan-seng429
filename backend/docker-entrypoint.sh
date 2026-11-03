#!/bin/sh
# Picks the process of the KAPtan image (api | ingest_worker | agent_worker | scheduler | migrate | bootstrap |
# dlq | live_warmup). Anything unknown is executed as given (e.g. `sh`).
set -eu
cmd="${1:-api}"
[ "$#" -gt 0 ] && shift
case "$cmd" in
  api)
    exec python -m kaptan.ops.serve "$@" ;;
  ingest_worker|agent_worker|scheduler)
    exec python -m "kaptan.workers.$cmd" "$@" ;;
  migrate)
    exec python -m kaptan.ops.migrate "$@" ;;
  bootstrap)
    exec python -m kaptan.bootstrap "$@" ;;
  live_warmup)
    # live.env first start: recent KAP days, issuer list, price history, universe, flat P&L days (once).
    exec python -m kaptan.live.warmup "$@" ;;
  dlq)
    exec python -m kaptan.ops.dlq "$@" ;;
  *)
    exec "$cmd" "$@" ;;
esac
