"""Telegram: the pairing, the message queue, what was sent, and the "workers were alive" mark (agent TELEGRAM).

Revision ID: 0039_telegram
Revises: 0038_signal
Create Date: 2026-11-24

All additive; the person's real database runs this.
- `ops.telegram` (one row): the bot token pasted in Ayarlar (never returned by the API; the app role only), the bot's
  name, the paired chat, the hash of the one-time pairing code (never the code), the getUpdates offset, the
  Less / Normal / More level, the daily cap of instant messages, the /sessiz pause and the day the morning message
  went out.
- `ops.telegram_queue`: one row per disclosure Telegram has decided about. `queued` waits for its turn (30 min per
  company), `held` was kept back (quiet hours, daily cap, /sessiz) and `morning` is for the next morning message;
  `done` has been told. Nothing is ever dropped: a held row stays until a message carries it.
- `ops.telegram_sent`: one row per message sent (kind, tickers, count): the daily cap, the 30 min rule and /durum.
- `ops.worker_alive`: when the workers last ran and the last gap (the PC was off or asleep). The heartbeat message
  and the morning brief read it.
- `ops.alert_history.channel` also accepts 'telegram'.
"""

from __future__ import annotations

from alembic import op

revision = "0039_telegram"
down_revision = "0038_signal"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE IF NOT EXISTS ops.telegram (
  id               smallint PRIMARY KEY CHECK (id = 1),
  token            text,
  bot_username     text,
  chat_id          bigint,
  pair_code_hash   text,
  pair_expires_at  timestamptz,
  paired_at        timestamptz,
  update_offset    bigint NOT NULL DEFAULT 0,
  level            text NOT NULL DEFAULT 'normal' CHECK (level IN ('less', 'normal', 'more')),
  daily_cap        smallint NOT NULL DEFAULT 8 CHECK (daily_cap BETWEEN 1 AND 50),
  silent_until     timestamptz,
  morning_sent_on  date,
  desk_cursor      text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ops.telegram (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ops.telegram_queue (
  disclosure_index bigint PRIMARY KEY,
  ticker           text,
  company          text NOT NULL DEFAULT '',
  state            text NOT NULL CHECK (state IN ('queued', 'held', 'morning', 'done')),
  reason           text,
  created_at       timestamptz NOT NULL,
  sent_at          timestamptz
);
CREATE INDEX IF NOT EXISTS telegram_queue_state_idx ON ops.telegram_queue (state);

CREATE TABLE IF NOT EXISTS ops.telegram_sent (
  id       bigserial PRIMARY KEY,
  sent_at  timestamptz NOT NULL,
  kind     text NOT NULL,
  tickers  text[] NOT NULL DEFAULT '{}',
  n        integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS telegram_sent_at_idx ON ops.telegram_sent (sent_at DESC);

CREATE TABLE IF NOT EXISTS ops.worker_alive (
  id             smallint PRIMARY KEY CHECK (id = 1),
  last_alive_at  timestamptz,
  gap_from       timestamptz,
  gap_to         timestamptz,
  gap_told       boolean NOT NULL DEFAULT false
);
INSERT INTO ops.worker_alive (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE ops.alert_history DROP CONSTRAINT IF EXISTS alert_history_channel_check;
ALTER TABLE ops.alert_history ADD CONSTRAINT alert_history_channel_check
  CHECK (channel IN ('ntfy', 'email', 'telegram'));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.telegram, ops.telegram_queue, ops.telegram_sent, ops.worker_alive
  TO kaptan_app;
GRANT USAGE, SELECT ON SEQUENCE ops.telegram_sent_id_seq TO kaptan_app;
"""

DOWN = """
ALTER TABLE ops.alert_history DROP CONSTRAINT IF EXISTS alert_history_channel_check;
ALTER TABLE ops.alert_history ADD CONSTRAINT alert_history_channel_check CHECK (channel IN ('ntfy', 'email'));
DROP TABLE IF EXISTS ops.worker_alive;
DROP TABLE IF EXISTS ops.telegram_sent;
DROP TABLE IF EXISTS ops.telegram_queue;
DROP TABLE IF EXISTS ops.telegram;
"""


def upgrade() -> None:
    op.execute(UP)


def downgrade() -> None:
    op.execute(DOWN)
