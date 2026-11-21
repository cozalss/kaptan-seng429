"""Companies: the page of one ticker, search across the app, and the person's watchlist.

- `profile`: everything `GET /companies/{ticker}` shows (identity, why KAPtan does or does not follow it, prices,
  the person's position, the company's disclosures, KAPtan's past decisions on it).
- `search`: Turkish-aware matching of company names and of disclosure words (`GET /search`).
- `watch`: the watchlist (`core.watchlist`): at most 50, audited, with a quiet strip of today's numbers.
"""
