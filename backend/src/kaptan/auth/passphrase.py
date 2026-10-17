"""The single login passphrase (one login, four roles — API.md §2), checked against an argon2id hash.

Production: `PASSPHRASE_HASH` (scripts/hash_passphrase.py). Dev without a hash: the demo passphrase
printed on the panel's /login (`kaptan2026`), hashed once per process. Verification always runs the
full argon2 check, so timing does not reveal anything.
"""

from __future__ import annotations

from functools import lru_cache

from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from kaptan.settings import DEMO_PASSPHRASE, Settings

MAX_PASSPHRASE_LEN = 200


@lru_cache(maxsize=1)
def _hasher() -> PasswordHash:
    return PasswordHash.recommended()


@lru_cache(maxsize=1)
def _dev_hash() -> str:
    return _hasher().hash(DEMO_PASSPHRASE)


def hash_passphrase(passphrase: str) -> str:
    return _hasher().hash(passphrase)


def expected_hash(settings: Settings) -> str:
    if settings.passphrase_hash is not None:
        return settings.passphrase_hash.get_secret_value()
    if settings.kaptan_env == "dev":
        return _dev_hash()
    raise RuntimeError("PASSPHRASE_HASH is not configured")  # settings validation prevents this


def verify_passphrase(settings: Settings, passphrase: str) -> bool:
    if len(passphrase) > MAX_PASSPHRASE_LEN:
        return False
    try:
        return _hasher().verify(passphrase, expected_hash(settings))
    except UnknownHashError:
        return False
