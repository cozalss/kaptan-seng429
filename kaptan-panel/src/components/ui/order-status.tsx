import type { Order } from "@/lib/domain";
import { fmtInt } from "@/lib/format";
import { Badge, type BadgeProps } from "./badge";

/**
 * One reading of an order's state for every screen (portfolio, runs, brief, approvals).
 * North red is kept for the kill switch; a lapsed limit-up open or a broker refusal is a
 * plain outcome, not a critical state.
 */
export function orderStatusView(o: Pick<Order, "status" | "fills" | "qty" | "cancel_reason">): { label: string; tone: BadgeProps["tone"] } {
  const filled = o.fills.reduce((a, f) => a + f.qty, 0);
  switch (o.status) {
    case "pending_open":
      return { label: "Açılış bekliyor", tone: "wash" };
    case "accepted":
      return { label: "Kabul edildi", tone: "wash" };
    case "awaiting_manual_entry":
      return { label: "Manuel giriş bekliyor", tone: "wash" };
    case "partially_filled":
      return { label: `Kısmi dolum ${fmtInt(filled)}/${fmtInt(o.qty)}`, tone: "outline" };
    case "filled":
      return { label: "Doldu", tone: "ink" };
    case "rejected":
      return { label: "Reddedildi (aracı)", tone: "muted" };
    case "canceled":
      if (o.cancel_reason === "kill_switch") return { label: "Kill switch iptali", tone: "north" };
      if (o.cancel_reason === "limit_up_open") return { label: "Tavanda açıldı, dolmadı", tone: "outline" };
      if (o.cancel_reason === "day_end") return { label: "Kalan gün sonunda düştü", tone: "muted" };
      return { label: "İptal", tone: "muted" };
  }
}

export function OrderStatusBadge({ order, className }: { order: Pick<Order, "status" | "fills" | "qty" | "cancel_reason">; className?: string }) {
  const v = orderStatusView(order);
  return (
    <Badge tone={v.tone} className={className}>
      {v.label}
    </Badge>
  );
}
