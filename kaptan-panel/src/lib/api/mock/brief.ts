import type { MorningBrief } from "@/lib/domain";
import { istanbulIso, prevTradingDay } from "@/lib/time";
import { DEMO_DAY } from "@/mocks/clock";
import { allOrders, approvalCards, expiringToday, positions, visibleDisclosures } from "./selectors";
import type { MockState } from "./state";

/** 08:45 morning brief (_KANONIK; US-42), assembled from the session state. */
export function buildBrief(state: MockState, date: string = DEMO_DAY): MorningBrief {
  const generatedAt = istanbulIso(date, "08:45");
  const cutoff = Date.parse(generatedAt);
  const important = visibleDisclosures(state)
    .filter((d) => d.run_id !== null && Date.parse(d.published_at) <= cutoff)
    .slice(0, 8);
  const pending = approvalCards(state).filter((a) => a.status === "pending" && !a.run_id.startsWith("run-hist"));
  const open = positions(state);
  const expiring = expiringToday(state);
  // Approved since the previous close (18:00) and queued for today's opening auction.
  const since = Date.parse(istanbulIso(prevTradingDay(date), "18:00"));
  const forOpen = allOrders(state).filter(
    (o) => o.broker === "simbist" && o.tif === "opg" && Date.parse(o.created_at) > since && Date.parse(o.created_at) <= cutoff,
  );
  return {
    date,
    generated_at: generatedAt,
    important_disclosures: important,
    orders_for_open: forOpen,
    pending_approvals: pending,
    open_positions: open,
    expiring_today: expiring,
    risk_warnings: [
      { level: "info", text_tr: `Eşzamanlı pozisyon ${open.length}/10 (hedef 8).` },
      ...(forOpen.length ? [{ level: "info" as const, text_tr: `${forOpen.length} onaylı emir 09:40 açılış emir toplamaya girer; tavanda açılırsa kovalanmaz.` }] : []),
      ...(expiring.length ? [{ level: "warn" as const, text_tr: `${expiring.length} pozisyonun planlanan çıkışı bugün (X1 zaman çıkışı).` }] : []),
      ...(pending.length ? [{ level: "warn" as const, text_tr: `${pending.length} öneri onay bekliyor; yanıtlanmazsa ertesi seans 09:50'de düşer.` }] : []),
      ...(state.risk.kill_switch === "on" ? [{ level: "critical" as const, text_tr: "Kill switch açık: yeni emir yok." }] : []),
    ],
    restriction_changes: [
      { ticker: "TMSLJ", kind: "vbts_brut_takas", change: "added", at: istanbulIso("2027-01-07", "18:20") },
      { ticker: "FRZMB", kind: "spk_tedbir", change: "added", at: istanbulIso("2027-01-04", "19:05") },
    ],
    summary_tr:
      "Cuma kapanışından sonra iki öneri onaylandı; ikisi de 09:40 açılış emir toplamaya giriyor. Bir E4 pozisyonunun tutma süresi bugün doluyor. TMSLJ için VBTS brüt takas tedbiri eklendi; bu hissede öneri üretilmez.",
    is_sample: true,
  };
}
