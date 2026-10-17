import type { ReactNode } from "react";
import type { ApprovalCard, Explain } from "@/lib/domain";
import { IS_MOCK } from "@/lib/api/config";
import { fmtInt, fmtSignedPct, fmtTime } from "@/lib/format";
import { disclosureQuote, plainWhy, shortName } from "@/components/story/plain";
import { locative, titleTr } from "@/components/story/turkish";
import { SampleTag } from "@/components/story/ui";

/**
 * "Neden bu öneri?": what happened (with the disclosure's telling sentence), why it matters
 * (the rule that fired) and what happened after similar events, as three short paragraphs.
 */
export function WhySections({ card, explain }: { card: ApprovalCard; explain: Explain | null }) {
  const quote = disclosureQuote(explain?.texts[0]?.body);
  const publishedAt = explain?.disclosure.published_at ?? card.created_at;
  const events = explain?.evidence_events ?? [];
  const e = card.evidence_summary;
  const rose = events.length === e.n ? events.filter((x) => x.car_5d > 0).length : Math.round(e.hit_rate_5d * e.n);
  return (
    <div className="space-y-6">
      <Part title="Ne oldu?">
        <p>
          {titleTr(shortName(card.company_name))}, {locative(fmtTime(publishedAt))} KAP’a bir bildirim gönderdi: {card.sub_type_tr.toLocaleLowerCase("tr-TR")}.
        </p>
        {quote ? <blockquote className="border-l-2 border-rule-soft pl-4 text-ink-soft">“{quote}”</blockquote> : null}
      </Part>
      <Part title="Neden önemli?">
        <p>{plainWhy(card)}</p>
      </Part>
      <Part title="Geçmişte ne oldu?" aside={IS_MOCK ? <SampleTag /> : null}>
        {e.n === 0 ? (
          <p>Geçmişte buna benzer olay bulunamadı.</p>
        ) : (
          <dl className="grid max-w-[520px] grid-cols-3 border border-hairline tabular-nums">
            <Stat label="Benzer olay" value={fmtInt(e.n)} />
            <Stat label="5 günde yükseldi" value={fmtInt(rose)} className="border-l border-hairline" />
            <Stat label="Ortanca getiri" value={fmtSignedPct(e.median_car_5d)} className="border-l border-hairline" />
          </dl>
        )}
        <p className="text-dense text-muted">Geçmiş, geleceğin sözü değildir.</p>
      </Part>
    </div>
  );
}

function Part({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-3">
        <h3 className="text-[16px] leading-6 font-semibold text-ink">{title}</h3>
        {aside}
      </div>
      <div className="space-y-3 text-[16px] leading-[25px] text-ink">{children}</div>
    </section>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 px-3 py-2.5 sm:px-4 ${className ?? ""}`}>
      <dt className="text-dense text-muted">{label}</dt>
      <dd className="text-[18px] leading-7 font-semibold text-ink">{value}</dd>
    </div>
  );
}
