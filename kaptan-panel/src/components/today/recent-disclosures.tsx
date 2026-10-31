import Link from "next/link";
import type { DisclosureListItem } from "@/lib/domain";
import { fmtInt } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { MAX_DISCLOSURES } from "@/lib/api/limits";
import { CARD, CardHead } from "@/components/portfolio/kit";
import { DisclosureRows } from "@/components/disclosures/disclosure-rows";
import { ErrorState, SkeletonLines } from "@/components/ui/primitives";

/** Rows on Bugün; the whole day is on Bildirimler. */
const SHOWN = 5;

/**
 * "Son bildirimler": the newest KAP disclosures of the day Bugün talks about (today, or the last
 * session), each with what the desk did with it. Crew-bound ones first catch the eye (navy pill).
 */
export function RecentDisclosures({
  rows,
  error,
  onRetry,
  note,
  total = null,
}: {
  rows: readonly DisclosureListItem[] | null;
  /** The day's exact count from the counters, when known (the list itself is capped). */
  total?: number | null;
  error: string | null;
  onRetry: () => void;
  note: string;
}) {
  return (
    <section aria-labelledby="son-bildirimler" className={`${CARD} overflow-hidden`}>
      <CardHead
        id="son-bildirimler"
        title="Son bildirimler"
        note={total !== null ? `${note} · ${fmtInt(total)} bildirim` : rows ? `${note} · ${fmtInt(rows.length)}${rows.length >= MAX_DISCLOSURES ? "+" : ""} bildirim` : note}
        action={
          <Link href={ROUTES.bildirimler} className="text-dense font-semibold text-brand underline decoration-transparent underline-offset-4 hover:decoration-brand">
            Tümü →
          </Link>
        }
      />
      {error && !rows ? (
        <div className="px-5 pb-5">
          <ErrorState message={error} onRetry={onRetry} />
        </div>
      ) : rows ? (
        rows.length ? (
          <div className="border-t border-line">
            <DisclosureRows rows={rows.slice(0, SHOWN)} label="Son bildirimler" compact />
          </div>
        ) : (
          <p className="border-t border-line px-5 py-6 text-ui text-ink-soft">Bu gün için henüz bildirim yok.</p>
        )
      ) : (
        <SkeletonLines lines={4} className="px-5 pb-5" />
      )}
    </section>
  );
}
