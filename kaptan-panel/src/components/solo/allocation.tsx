import { fmtPct, fmtSignedPct } from "@/lib/format";
import type { Allocation } from "@/lib/solo/overview";
import { fmtLira, titleTr } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";

/** Six holding inks in a fixed order (solo.css); a seventh holding and beyond share "Diğer". */
export const SLOT_COUNT = 6;
/** Written out in full so Tailwind sees every class. */
const SLOT_CLASSES = ["bg-[var(--solo-c1)]", "bg-[var(--solo-c2)]", "bg-[var(--solo-c3)]", "bg-[var(--solo-c4)]", "bg-[var(--solo-c5)]", "bg-[var(--solo-c6)]"] as const;

export interface AllocationRow {
  key: string;
  label: string;
  detail: string | null;
  amount: number;
  share: number;
  pnlPct: number | null;
  fill: "slot" | "other" | "cash";
  slot: number;
}

/**
 * Holdings (biggest first, as the API sends them) then cash. With more than six holdings the
 * first five keep their own ink and the rest fold into one "Diğer" segment on the bar, while the
 * list still names every holding. Shares are of the total money.
 */
export function allocationRows(allocations: readonly Allocation[], cash: number, total: number): { bar: AllocationRow[]; list: AllocationRow[] } {
  const share = (n: number) => (total > 0 ? n / total : 0);
  const fold = allocations.length > SLOT_COUNT;
  const own = fold ? SLOT_COUNT - 1 : SLOT_COUNT;
  const list: AllocationRow[] = allocations.map((a, i) => ({
    key: a.symbol,
    label: a.symbol,
    detail: titleTr(a.name),
    amount: a.amount,
    share: share(a.amount),
    pnlPct: a.pnl_pct,
    fill: i < own ? "slot" : "other",
    slot: Math.min(i, own) + 1,
  }));
  const rest = list.slice(own);
  const bar = list.slice(0, own);
  if (rest.length > 0) {
    const amount = rest.reduce((s, r) => s + r.amount, 0);
    bar.push({ key: "diger", label: `Diğer (${rest.length})`, detail: null, amount, share: share(amount), pnlPct: null, fill: "other", slot: own + 1 });
  }
  const cashRow: AllocationRow = { key: "nakit", label: "Nakit", detail: "Hazırda bekleyen para", amount: cash, share: share(cash), pnlPct: null, fill: "cash", slot: 0 };
  return { bar: [...bar, cashRow], list: [...list, cashRow] };
}

function fillClass(r: AllocationRow): string {
  if (r.fill === "cash") return "solo-cash-fill";
  if (r.fill === "other") return "bg-[var(--solo-other)]";
  return SLOT_CLASSES[r.slot - 1] ?? "bg-[var(--solo-other)]";
}

/**
 * "Param nerede?": one bar split by where the money sits (2px paper gaps between parts), then
 * a list naming each part with its amount, share and gain since bought. Colour is never the only
 * carrier: every coloured part has a named row.
 */
export function AllocationPanel({ allocations, cash, total }: { allocations: readonly Allocation[]; cash: number; total: number }) {
  const { bar, list } = allocationRows(allocations, cash, total);
  const invested = allocations.reduce((s, a) => s + a.amount, 0);
  return (
    <section aria-labelledby="param-nerede" className="overflow-clip rounded-xl border border-line bg-panel shadow-card">
      <header className="border-b border-line px-4 py-3 sm:px-5">
        <h2 id="param-nerede" className="text-title font-semibold text-ink">
          Param nerede?
        </h2>
        <p className="text-dense text-muted tabular-nums">
          {allocations.length > 0
            ? `${allocations.length} hissede ${fmtLira(invested)} · nakitte ${fmtLira(cash)}`
            : "Henüz hisse yok; paranın tamamı nakitte."}
        </p>
      </header>
      <div className="px-4 py-4 sm:px-5">
        <div className="flex h-6 w-full gap-0.5" role="img" aria-label={bar.map((r) => `${r.label} ${fmtPct(r.share, 1)}`).join(", ")}>
          {bar
            .filter((r) => r.share > 0)
            .map((r) => (
              <span key={r.key} title={`${r.label}: ${fmtLira(r.amount)} · ${fmtPct(r.share, 1)}`} className={cn("solo-segment h-full min-w-1", fillClass(r))} style={{ flexGrow: r.share, flexBasis: 0 }} />
            ))}
        </div>
        <table className="mt-4 w-full text-left tabular-nums">
          <caption className="sr-only">Paranın dağılımı: tutar, pay ve alıştan bu yana kazanç</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Nerede</th>
              <th scope="col">Tutar ve pay</th>
              <th scope="col">Kazanç</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.key} className={cn("border-b border-hairline last:border-b-0", r.fill === "cash" && "border-t-2 border-t-hairline")}>
                <th scope="row" className="py-2.5 pr-2 font-normal">
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className={cn("solo-swatch size-3 shrink-0", fillClass(r))} />
                    <span className="min-w-0">
                      <span className="block text-ui font-semibold text-ink">{r.label}</span>
                      {r.detail ? <span className="block truncate text-meta text-muted">{r.detail}</span> : null}
                    </span>
                  </span>
                </th>
                <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                  <span className="block text-ui font-medium text-ink">{fmtLira(r.amount)}</span>
                  <span className="block text-meta text-muted">payı {fmtPct(r.share, 1)}</span>
                </td>
                <td className={cn("w-16 py-2.5 text-right whitespace-nowrap text-dense font-semibold", r.pnlPct === null ? "text-muted" : signTone(r.pnlPct))}>
                  {r.pnlPct === null ? <span aria-label="yok">—</span> : fmtSignedPct(r.pnlPct, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
