"""The single login passphrase (API.md §2), checked against an argon2id hash.

`PASSPHRASE_HASH` (scripts/hash_passphrase.py) is the only source: without it nobody can sign in. Verification
always runs the full argon2 check, so timing does not reveal anything.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from kaptan.settings import Settings

log = logging.getLogger("kaptan.auth")

MAX_PASSPHRASE_LEN = 200


@lru_cache(maxsize=1)
def _hasher() -> PasswordHash:
    return PasswordHash.recommended()


def hash_passphrase(passphrase: str) -> str:
    return _hasher().hash(passphrase)


def verify_passphrase(settings: Settings, passphrase: str) -> bool:
    if len(passphrase) > MAX_PASSPHRASE_LEN:
        return False
    if settings.passphrase_hash is None:
        log.error("PASSPHRASE_HASH is not set: nobody can sign in (scripts/hash_passphrase.py makes one)")
        return False
    try:
        return _hasher().verify(passphrase, settings.passphrase_hash.get_secret_value())
    except UnknownHashError:
        return False
