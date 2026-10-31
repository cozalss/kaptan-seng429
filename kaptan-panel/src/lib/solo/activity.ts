import type { ApprovalCard, Position } from "@/lib/domain";
import { fmtLira } from "./words";

/** A "TUT" suggestion you said yes to (kept on this device; a hold sends no order). */
export interface HoldAck {
  id: string;
  symbol: string;
  at: string;
  /** "held" (Onayla: keep it) or "skipped" (Geç). Older entries without it were holds. */
  answer?: "held" | "skipped";
}

export type ActivityKind = "bought" | "approved_buy" | "approved_sell" | "skipped" | "held";

export interface ActivityItem {
  key: string;
  at: string;
  kind: ActivityKind;
  /** "3.000 ₺ THYAO aldın" — the whole sentence (read out, and the plain list). */
  text: string;
  /** "THYAO aldın" — the sentence without the money (the row's first line). */
  title: string;
  /** The money it moved, if any (the row's right edge). */
  amount: number | null;
}

export const ACTIVITY_LIMIT = 6;

const amountOf = (p: Position) => p.qty * p.avg_cost;

const YOU = { bought: "aldın", approved: "onayladın", skipped: "önerisini geçtin" } as const;
const DESK = { bought: "alındı", approved: "onaylandı", skipped: "önerisi geçildi" } as const;

/**
 * "Son işlemler" in plain words, newest first: buys that filled ("3.000 ₺ THYAO aldın"),
 * approvals still on their way ("KRGSG satışını onayladın · 59.900 ₺"), suggestions you
 * skipped and holds you confirmed. A filled approval shows once, as the fill.
 */
export function recentActivity(
  approvals: readonly ApprovalCard[],
  positions: readonly Position[],
  holds: readonly HoldAck[] = [],
  limit = ACTIVITY_LIMIT,
  /** "you": one person did it all (aldın). "desk": a team desk's personal view (alındı). */
  voice: "you" | "desk" = "you",
): ActivityItem[] {
  const v = voice === "you" ? YOU : DESK;
  const filledBy = new Map(positions.map((p) => [p.source_proposal, p]));
  const items: ActivityItem[] = positions.map((p) => ({
    key: `fill:${p.source_proposal}:${p.ticker}`,
    at: p.opened_at,
    kind: "bought",
    text: `${fmtLira(amountOf(p))} ${p.ticker} ${v.bought}`,
    title: `${p.ticker} ${v.bought}`,
    amount: amountOf(p),
  }));
  for (const c of approvals) {
    if (!c.decided_at || filledBy.has(c.proposal_id)) continue;
    if (c.status === "approved") {
      const amount = c.approved_notional_try ?? c.final_notional_try;
      const title = voice === "you" ? `${c.ticker} ${c.side === "buy" ? "alımını" : "satışını"} ${v.approved}` : `${c.ticker} ${c.side === "buy" ? "alımı" : "satışı"} ${v.approved}`;
      items.push({
        key: `ok:${c.proposal_id}`,
        at: c.decided_at,
        kind: c.side === "buy" ? "approved_buy" : "approved_sell",
        text: `${title} · ${fmtLira(amount)}`,
        title,
        amount,
      });
    } else if (c.status === "rejected") {
      const text = `${c.ticker} ${v.skipped}`;
      items.push({ key: `skip:${c.proposal_id}`, at: c.decided_at, kind: "skipped", text, title: text, amount: null });
    }
  }
  for (const h of holds) {
    const skipped = h.answer === "skipped";
    const text = skipped ? `${h.symbol} ${v.skipped}` : `${h.symbol} elinde kalıyor`;
    items.push({ key: `hold:${h.id}`, at: h.at, kind: skipped ? "skipped" : "held", text, title: text, amount: null });
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}
