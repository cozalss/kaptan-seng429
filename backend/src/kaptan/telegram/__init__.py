"""Telegram: following KAP from the phone with almost no effort (wave 6, agent TELEGRAM).

- `botapi`: the Bot API client (outbound HTTPS only; the token never in a log or an error).
- `link`: the token, the one-time pairing code and the deep link.
- `store`: the tables of migration 0039.
- `format`: message texts (HTML, escaped) and buttons. `routing`: instant or morning, quiet hours.
- `dispatch`: the instant tier with the 30 min per company, daily cap and 1 message/s rules.
- `morning`: the 08:45 message, the weekend summary, the "KAPtan X saat kapalıydı" message.
- `handlers`: /start /ayar /sessiz /durum and the buttons. `runner`: the long-polling loop (hosted by the scheduler).
- `service`: what the Ayarlar section's API does.
"""
