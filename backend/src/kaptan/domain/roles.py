"""The one person KAPtan works for.

There are no roles and no team: signed in = allowed. `Role` survives only to read what is stored (the `role`
columns of auth.users and auth.refresh_tokens, signature documents, approval rows); new rows carry `OWNER.role`,
a fixed value nobody ever sees, and old rows keep whatever they say.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

Role = Literal["analyst", "risk_officer", "admin", "auditor"]


@dataclass(frozen=True, slots=True)
class Owner:
    uid: str
    name: str
    role: Role


#: The account (migration 0022 creates its auth.users row).
OWNER: Final = Owner("sahip", "Sahip", "risk_officer")
