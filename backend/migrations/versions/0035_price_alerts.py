"""Price alerts, per-company alert mute, alert history, weekly summary (agent ALERTS).

Revision ID: 0035_price_alerts
Revises: 0034_reading
Create Date: 2026-11-21

Two new tables, both additive (the person's real database runs this):
- `core.price_alerts`: "tell me when this share reaches a price". One row per alert. `level` is the price it waits
  for; a preset (+-5 % / +-10 %) is turned into a level when it is made (`preset_pct` and `base_price` remember
  how). An alert fires once: `triggered_at` / `triggered_price` are stamped and it stays in the list until the
  person removes it.
- `ops.alert_history`: one row per message that really went out (or failed to) on a phone/e-mail channel: when,
  which channel, the fixed sentence and whether it was delivered. It never holds the topic, the address, a ticker
  or an amount: the text is one of the fixed sentences of kaptan.alerts.messages.

The per-company mute list and the two new alert kinds (price alert, weekly summary) live inside the existing
`ops.preferences.alerts` document: no column is added.
"""

from __future__ import annotations

from alembic import op

revision = "0035_price_alerts"
down_revision = "0034_reading"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE core.price_alerts (
  id              bigserial PRIMARY KEY,
  ticker          text NOT NULL,
  direction       text NOT NULL CHECK (direction IN ('above', 'below')),
  level           numeric(18,4) NOT NULL CHECK (level > 0),
  preset_pct      smallint CHECK (preset_pct IS NULL OR preset_pct IN (5, 10)),
  base_price      numeric(18,4) CHECK (base_price IS NULL OR base_price > 0),
  created_at      timestamptz NOT NULL,
  triggered_at    timestamptz,
  triggered_price numeric(18,4)
);
CREATE INDEX price_alerts_open_idx ON core.price_alerts (ticker) WHERE triggered_at IS NULL;

CREATE TABLE ops.alert_history (
  id      bigserial PRIMARY KEY,
  sent_at timestamptz NOT NULL,
  kind    text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('ntfy', 'email')),
  ok      boolean NOT NULL,
  text    text NOT NULL,
  reason  text
);
CREATE INDEX alert_history_sent_idx ON ops.alert_history (sent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON core.price_alerts, ops.alert_history TO kaptan_app;
GRANT USAGE, SELECT ON SEQUENCE core.price_alerts_id_seq, ops.alert_history_id_seq TO kaptan_app;
"""

DOWN = """
DROP TABLE IF EXISTS ops.alert_history;
DROP TABLE IF EXISTS core.price_alerts;
"""


def upgrade() -> None:
    op.get_bind().exec_driver_sql(UP)


def downgrade() -> None:
    op.get_bind().exec_driver_sql(DOWN)
