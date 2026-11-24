-- Everything the Worker remembers. Only tickers and public disclosure facts: never money, amounts or share counts.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lists (ticker TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('held', 'watched')));
CREATE TABLE IF NOT EXISTS muted (ticker TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS events (
  idx INTEGER PRIMARY KEY,
  ticker TEXT NOT NULL,
  company TEXT NOT NULL,
  kind TEXT,
  important INTEGER NOT NULL,
  line TEXT NOT NULL,
  tone TEXT NOT NULL,
  so_what TEXT,
  published_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'new',
  reason TEXT,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS events_state ON events (state);
CREATE INDEX IF NOT EXISTS events_published ON events (published_at);
CREATE TABLE IF NOT EXISTS sent (id INTEGER PRIMARY KEY AUTOINCREMENT, sent_at INTEGER NOT NULL, kind TEXT NOT NULL, tickers TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  idx INTEGER,
  ticker TEXT,
  created_at INTEGER NOT NULL
);
