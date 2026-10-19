"""Admin management (M3 B3, FR-34, 04 §11): the R13 team blocklist, universe overrides and the config view.

`restricted` (add now, remove with two signatures, 09 §RBAC), `universe` (core.universe_daily + manual
include/exclude), `config_view` (the effective non-secret settings, models and limits). Every change is
audited in the same transaction as the state change.
"""
