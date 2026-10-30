import type { ActivityItem, ActivityKind } from "@/lib/solo/activity";
import { dayLabel } from "@/lib/solo/words";
import { cn } from "@/lib/utils";

const GLYPH: Readonly<Record<ActivityKind, string>> = {
  bought: "+",
  approved_buy: "✓",
  approved_sell: "✓",
  skipped: "–",
  held: "=",
};

/** "Son işlemler": the last few things that happened, one plain sentence each ("11 Oca · 3.000 ₺ FRZEN aldın"). */
export function Activity({ items }: { items: readonly ActivityItem[] }) {
  return (
    <section aria-labelledby="son-islemler" className="min-w-0">
      <h2 id="son-islemler" className="text-title font-semibold text-ink">
        Son işlemler
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-ui text-ink-soft">Henüz işlem yok. Bir öneriyi onayladığında burada görünür.</p>
      ) : (
        <ol className="mt-3 border-t-2 border-ink" data-testid="son-islemler">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-3 border-b border-hairline py-2.5">
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-dense font-semibold",
                  it.kind === "skipped" || it.kind === "held" ? "border-rule-soft text-muted" : "border-ink text-ink",
                )}
              >
                {GLYPH[it.kind]}
              </span>
              <span className="min-w-0 text-ui text-ink tabular-nums">
                <span className="text-muted">{dayLabel(it.at)} · </span>
                {it.text}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
