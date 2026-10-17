"""`python -m kaptan.api [--port 8000] [--host 127.0.0.1] [--reload]` with the selector loop (Windows-safe)."""

from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(prog="kaptan-api")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()
    uvicorn.run(
        "kaptan.api.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        loop="kaptan.api.loop:selector_loop",
        proxy_headers=True,
    )


if __name__ == "__main__":
    main()
