"""Print the argon2id hash for PASSPHRASE_HASH (reads the passphrase without echoing it).

uv run python scripts/hash_passphrase.py
"""

from __future__ import annotations

import getpass

from kaptan.auth.passphrase import hash_passphrase

if __name__ == "__main__":
    first = getpass.getpass("Passphrase: ")
    if first != getpass.getpass("Again: ") or len(first) < 12:
        raise SystemExit("Passphrases differ or are shorter than 12 characters.")
    print(hash_passphrase(first))
