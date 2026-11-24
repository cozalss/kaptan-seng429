"""The Cloudflare Worker that follows KAP while this computer is off (see `cloud-watcher/` in the repository).

- `sync`: every 10 minutes (and when something changes) KAPtan tells the Worker which tickers are held and watched
  (tickers only, never money), the quiet hours, the level, and a pairing code; the Worker answers with its own state.
- `actions`: the Worker keeps what the person pressed on the phone (Okudum, Sonra oku, Bu şirketi sustur); KAPtan pulls
  those and applies them to its own reading, triage and mute lists.
The whole thing is off unless CLOUD_WATCHER_URL and CLOUD_SYNC_SECRET are both set (`settings.cloud_watcher_on`).
"""
