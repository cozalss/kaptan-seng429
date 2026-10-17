"""Who may do what: a Python port of kaptan-panel/src/lib/auth/permissions.ts.

One table, used by every write endpoint (403 `forbidden` with the plain reason) and identical
to the panel's: `denied_reason()` returns the very same Turkish sentence as `deniedReason()`.
"""

from __future__ import annotations

from typing import Final, Literal, get_args

from kaptan.domain.roles import ROLE_LABEL, ROLES, Role

Action = Literal[
    "proposal.note",
    "proposal.decide",
    "ticket.mark",
    "kill.stop",
    "kill.reset_start",
    "kill.reset_confirm",
    "limits.propose",
    "limits.decide",
    "audit.verify",
    "users.view",
    "demo.run",
]
ACTIONS: Final[tuple[Action, ...]] = get_args(Action)

ROLE_ACTIONS: Final[dict[Role, frozenset[Action]]] = {
    "analyst": frozenset({"proposal.note"}),
    "risk_officer": frozenset(
        {
            "proposal.note",
            "proposal.decide",
            "ticket.mark",
            "kill.stop",
            "kill.reset_confirm",
            "limits.decide",
            "audit.verify",
        }
    ),
    "admin": frozenset(
        {"proposal.note", "kill.stop", "kill.reset_start", "limits.propose", "audit.verify", "users.view", "demo.run"}
    ),
    # Read-only: sees everything, changes nothing. Verifying the ledger has no side effects.
    "auditor": frozenset({"audit.verify", "users.view"}),
}

ACTION_LABEL: Final[dict[Action, str]] = {
    "proposal.note": "Öneriye not ekler",
    "proposal.decide": "Öneriyi imzalar ya da reddeder",
    "ticket.mark": "Emir fişini işaretler",
    "kill.stop": "Her şeyi durdurur",
    "kill.reset_start": "Yeniden başlatmayı başlatır",
    "kill.reset_confirm": "Yeniden başlatmayı onaylar",
    "limits.propose": "Sınır değişikliği önerir",
    "limits.decide": "Sınır değişikliğini onaylar",
    "audit.verify": "Defteri doğrular",
    "users.view": "Kullanıcıları görür",
    "demo.run": "Senaryoları yönetir",
}

#: Second-signature refusals (403 `same_person`), API.md §3.2.
SAME_PERSON_TEXT: Final[dict[Literal["kill_reset", "limits"], str]] = {
    "kill_reset": "Başlatan kişi onaylayamaz; ikinci imza başka birinden gelir.",
    "limits": "Öneren kişi onaylayamaz; ikinci imza başka birinden gelir.",
}


def can(role: Role | None, action: Action) -> bool:
    return role is not None and action in ROLE_ACTIONS[role]


def roles_for(action: Action) -> list[Role]:
    """The roles that may do an action, in the order of ROLES."""
    return [r for r in ROLES if action in ROLE_ACTIONS[r]]


def denied_reason(action: Action, role: Role | None = None) -> str:
    """The plain reason a control is closed: "Bunu Risk Sorumlusu yapar." (same text as the panel)."""
    who = [ROLE_LABEL[r] for r in roles_for(action) if r != "auditor"]
    names = f"{', '.join(who[:-1])} ya da {who[-1]}" if len(who) > 1 else (who[0] if who else "kimse")
    base = f"Bunu {names} yapar."
    return f"Denetçi yalnızca bakar. {base}" if role == "auditor" else base


def role_that_can(action: Action) -> Role | None:
    """The role to switch to when you want to do it yourself (first one that may)."""
    return next((r for r in roles_for(action) if r != "auditor"), None)
