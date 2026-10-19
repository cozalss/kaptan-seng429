"""Point-in-time fundamentals (07 P3, FR-41): İş Yatırım line items, `available_at` = KAP publication.

Read (what the evidence tools and the sizer/features use; always `available_at < as_of`):

    from kaptan.fundamentals import fundamentals_as_of, history_as_of, revenue_as_of
    vals = await fundamentals_as_of(conn, ticker, as_of, ["revenue_q", "operating_profit_q",
                                                          "net_monetary_position_gain_q",
                                                          "net_profit_parent_q", "cfo_ttm"])
    q8 = await history_as_of(conn, ticker, as_of, "operating_profit_q", limit=8)

Items: revenue_q, operating_profit_q, net_monetary_position_gain_q, net_profit_parent_q (single
quarters = consecutive YTD differences), revenue_ttm, net_income_ttm, cfo_ttm, revenue_annual,
paid_in_capital, equity (TL, `Decimal`). Write: `run_fundamentals(conn, now, client=...)` (nightly).
"""

from kaptan.fundamentals.reads import FundamentalValue, fundamentals_as_of, history_as_of, revenue_as_of
from kaptan.fundamentals.store import FundamentalsStats, run_fundamentals

__all__ = [
    "FundamentalValue",
    "FundamentalsStats",
    "fundamentals_as_of",
    "history_as_of",
    "revenue_as_of",
    "run_fundamentals",
]
