"""Phone and e-mail alerts: the person is told that something needs them without opening the app.

    await notify(redis, alert_config(settings), "suggestion")      # never raises
    await run_alert_watch(settings, pool, redis, stop)             # the scheduler's side task

Two channels, both off unless configured: ntfy (`ALERT_NTFY_TOPIC`, `ALERT_NTFY_SERVER`) and plain SMTP
(`ALERT_SMTP_HOST/PORT/USER/PASSWORD/TO`). A message passes through someone else's server, so its text is one of
the fixed sentences of `kaptan.alerts.messages` and nothing else: no ticker, company, amount, price or direction
(docs/proje/12 §7). The event that caused it is only ever read to pick the sentence.

- `messages`: the sentences and which stream event means which one.
- `config`: the channels from the settings; a wrong value turns its channel off and is reported, never raised.
- `channels`: the two senders (httpx, smtplib off the event loop).
- `service`: `notify()` with the one-per-kind-per-10-minutes limit and the last result, kept in Redis.
- `watch`: the long-running loop (desk stream + a system part down for 15 minutes), hosted by the scheduler.
"""

from kaptan.alerts.config import AlertConfig, alert_config
from kaptan.alerts.messages import AlertKind, kind_for_event, message_for
from kaptan.alerts.service import alert_settings, notify
from kaptan.alerts.watch import run_alert_watch

__all__ = [
    "AlertConfig",
    "AlertKind",
    "alert_config",
    "alert_settings",
    "kind_for_event",
    "message_for",
    "notify",
    "run_alert_watch",
]
