"""Container healthcheck: `python -m kaptan.ops.healthcheck` (exit 0 healthy, 1 unhealthy).

The component comes from KAPTAN_COMPONENT, else from PID 1's command line (the image's entrypoint):
- api: GET http://127.0.0.1:$KAPTAN_PORT/healthz answers 200 within 3 s;
- ingest_worker / agent_worker / scheduler: its Redis heartbeat is younger than HEARTBEAT_TTL_S;
- anything else (migrate, bootstrap, a shell): healthy.
"""

from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path
from typing import Final

from kaptan.ops.heartbeat import WORKERS

TIMEOUT_S: Final = 3.0


def component(environ: dict[str, str] | None = None, cmdline_file: Path = Path("/proc/1/cmdline")) -> str:
    env = os.environ if environ is None else environ
    if env.get("KAPTAN_COMPONENT"):
        return env["KAPTAN_COMPONENT"]
    try:
        cmdline = cmdline_file.read_bytes().replace(b"\0", b" ").decode(errors="replace")
    except OSError:
        return "unknown"
    for name in WORKERS:
        if name in cmdline:
            return name
    return "api" if "kaptan.ops.serve" in cmdline or " api" in f" {cmdline}" else "other"


def api_healthy(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz", timeout=TIMEOUT_S) as res:
            return int(res.status) == 200
    except OSError:
        return False


def worker_healthy(name: str) -> bool:
    import redis

    from kaptan.ops.heartbeat import hb_key
    from kaptan.settings import get_settings

    try:
        client = redis.Redis.from_url(get_settings().redis_url.get_secret_value(), socket_timeout=TIMEOUT_S)
        return bool(client.exists(hb_key(name)))
    except Exception:
        return False


def main() -> int:
    name = component()
    if name == "api":
        return 0 if api_healthy(int(os.environ.get("KAPTAN_PORT", "8000"))) else 1
    if name in WORKERS:
        return 0 if worker_healthy(name) else 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
