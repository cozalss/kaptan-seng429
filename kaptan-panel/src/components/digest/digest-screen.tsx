"use client";

import "./digest.css";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { dayLabel } from "@/lib/agenda/agenda";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import { digestSentence, groupByKind, mineOf } from "@/lib/digest/digest";
import { istanbulDay } from "@/lib/session-day";
import { DigestRow } from "./digest-row";

/**
 * /onemli: the notable KAP disclosures of the day, of every company (not only the ones KAPtan follows), picked by
 * KAP's own subject names. Yours first, then by kind. Day buttons walk the trading days; the day lives in the link
 * (?gun=2027-01-08), so Back returns to the day before and a day can be kept.
 */
const DAY_PARAM = /^\d{4}-\d{2}-\d{2}$/;

export function DigestScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params?.get("gun") ?? null;
  const day = asked !== null && DAY_PARAM.test(asked) ? asked : null;
  const setDay = (next: string | null) => router.push(next ? `${pathname}?gun=${next}` : pathname, { scroll: false });
  const q = useApiQuery((api) => api.digest(day ?? undefined), [day]);
  const now = useNow(60_000);
  const today = now === null ? null : istanbulDay(now);
  const d = q.data ?? null;
  const mine = d ? mineOf(d.items) : [];
  const rest = d ? groupByKind(d.items.filter((i) => i.why === null)) : [];
  return (
    <div className="dg-screen">
      <PageHeader
        name="Önemli duyurular"
        title={digestSentence(d, today)}
        lead="KAPtan, borsadaki tüm şirketlerin duyurularını okur. Burada, ne olduğu açık olanları topladım. Bu bir öneri değil, bilgi: ne yapacağına sen karar verirsin."
        actions={
          d ? (
            <div className="dg-days" role="group" aria-label="Gün seç">
              <button type="button" onClick={() => setDay(d.prev_day)}>
                ← Önceki gün
              </button>
              <span className="dg-day" aria-live="polite">
                {today ? dayLabel(d.day, today) : d.day}
              </span>
              <button type="button" disabled={d.next_day === null} onClick={() => setDay(d.next_day)}>
                Sonraki gün →
              </button>
            </div>
          ) : null
        }
      />
      {q.error && !d ? (
        <ScreenState kind="error" title="Duyuruları şu an açamadım." onRetry={q.refetch}>
          {q.error}
        </ScreenState>
      ) : null}
      {d?.note ? <p className="dg-note">{d.note}</p> : null}
      {mine.length > 0 ? (
        <section aria-labelledby="dg-mine" className="dg-group">
          <h2 id="dg-mine" className="u-chapter">
            Elindekiler ve izlediklerin
          </h2>
          <ul className="dg-list">
            {mine.map((i) => (
              <DigestRow key={i.disclosure_index} item={i} showKind />
            ))}
          </ul>
        </section>
      ) : null}
      {rest.map((g) => (
        <section key={g.kind} aria-labelledby={`dg-${g.kind}`} className="dg-group">
          <h2 id={`dg-${g.kind}`} className="u-chapter">
            {g.title} <span className="dg-count">{g.items.length}</span>
          </h2>
          <ul className="dg-list">
            {g.items.map((i) => (
              <DigestRow key={i.disclosure_index} item={i} />
            ))}
          </ul>
        </section>
      ))}
      {d?.truncated ? <p className="dg-note">Liste çok uzun: ilk 400 duyuruyu gösteriyorum.</p> : null}
    </div>
  );
}
