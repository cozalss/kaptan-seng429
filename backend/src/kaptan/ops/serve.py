"""Production entry point of the API: `python -m kaptan.ops.serve [--host 0.0.0.0] [--port 8000] [--workers 1]`.

Logging is set up (JSON in prod, redaction on) in every uvicorn worker process through the app factory,
the prod settings are checked before the socket opens, uvicorn's own access log is off (ours omits
query strings, where SSE tickets travel) and proxy headers are not trusted by uvicorn: the app resolves
the client IP itself from TRUSTED_PROXIES. SSE streams get GRACEFUL_S to end on SIGTERM.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from typing import Final

import uvicorn
from fastapi import FastAPI

from kaptan.ops.logs import setup_logging
from kaptan.settings import ConfigError, ensure_production_ready, get_settings

GRACEFUL_S: Final = 10


def app_factory() -> FastAPI:
    """Called by uvicorn in each worker process."""
    from kaptan.api.main import create_app

    settings = get_settings()
    setup_logging(settings, "api")
    return create_app(settings)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m kaptan.ops.serve")
    parser.add_argument("--host", default=os.environ.get("KAPTAN_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("KAPTAN_PORT", "8000")))
    parser.add_argument("--workers", type=int, default=int(os.environ.get("WEB_CONCURRENCY", "1")))
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        settings = get_settings()
        setup_logging(settings, "api")
        ensure_production_ready(settings, "api")
    except ConfigError as exc:
        logging.getLogger("kaptan.ops.serve").error("%s", exc)
        return 2
    uvicorn.run(
        "kaptan.ops.serve:app_factory",
        factory=True,
        host=args.host,
        port=args.port,
        workers=max(1, args.workers),
        loop="kaptan.api.loop:selector_loop" if sys.platform == "win32" else "auto",
        log_config=None,
        access_log=False,
        proxy_headers=False,
        server_header=False,
        timeout_graceful_shutdown=GRACEFUL_S,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
