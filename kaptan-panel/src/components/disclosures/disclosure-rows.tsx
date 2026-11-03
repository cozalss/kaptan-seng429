import Link from "next/link";
import type { ApprovalCard, DisclosureListItem } from "@/lib/domain";
import { fmtTime } from "@/lib/format";
import { href } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { plainEvent, shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { fateOf, groupByHour, tickerOf } from "./disclosure-logic";
import { kapUrl, plainSaid, whatKaptanDid } from "./reading-words";

type Cards = ReadonlyMap<number, ApprovalCard>;

/** A link to the disclosure's own page at KAP, the official source. */
function KapLink({ d }: { d: DisclosureListItem }) {
  const url = kapUrl(d);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${titleTr(shortName(d.company_name))} duyurusunu KAP’ta aç (yeni sekmede)`} className="ok-kap">
      KAP’ta aç <span aria-hidden>↗</span>
    </a>
  );
}

/**
 * What might matter to you today, each as a large object: the company, what it said, what KAPtan
 * suggests about it and the way to the suggestion. Not a table: the day's few big things.
 */
export function Worthwhile({ rows, cardOf, isToday }: { rows: readonly DisclosureListItem[]; cardOf: Cards; isToday: boolean }) {
  return (
    <section aria-labelledby="yarayabilir" className="ok-worth">
      <h2 id="yarayabilir" className="u-caption ok-worth-head">
        {isToday ? "Bugün işine yarayabilecekler" : "O gün işine yarayabilecekler"}
      </h2>
      <ol className="ok-worth-list">
        {rows.map((d) => {
          const card = cardOf.get(d.disclosure_index);
          if (!card) return null;
          return (
            <li key={d.disclosure_index} className="ok-worth-row">
              <p className="ok-worth-ticker">
                {tickerOf(d)} · <time dateTime={d.published_at}>{fmtTime(d.published_at)}</time>
              </p>
              <h3 className="ok-worth-name">{titleTr(shortName(d.company_name))}</h3>
              <p className="ok-worth-said">{plainEvent(card)}</p>
              <p className="ok-worth-did">{whatKaptanDid(d, card)}</p>
              <p className="ok-worth-links">
                <Link href={href.proposal(card.proposal_id)} className="ok-go">
                  Neden öneriyorum? →
                </Link>
                <KapLink d={d} />
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Everything read, cut by the hour: a hairline band per hour over that hour's duyuru. */
export function DisclosureHours({ rows, label, cardOf }: { rows: readonly DisclosureListItem[]; label: string; cardOf: Cards }) {
  const groups = groupByHour(rows);
  return (
    <div role="group" aria-label={label}>
      {groups.map((g) => (
        <section key={`${g.hour}-${g.rows[0]?.disclosure_index}`} aria-label={`${g.label}, ${g.rows.length} duyuru`} className="ok-hour">
          <h3 className="ok-hour-head">
            <span>{g.label}</span>
            <span className="font-medium text-muted">{g.rows.length} duyuru</span>
          </h3>
          <ol>
            {g.rows.map((d) => (
              <Row key={d.disclosure_index} d={d} card={cardOf.get(d.disclosure_index) ?? null} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Row({ d, card }: { d: DisclosureListItem; card: ApprovalCard | null }) {
  const fate = card ? "useful" : fateOf(d);
  const ticker = tickerOf(d);
  return (
    <li data-fate={fate} className={cn("ok-row")}>
      <time dateTime={d.published_at} className="ok-row-time">
        {fmtTime(d.published_at)}
      </time>
      <div className="min-w-0">
        <p className="ok-row-who">
          <span className="ok-row-name">{titleTr(shortName(d.company_name))}</span>
          {ticker ? <span className="ok-row-ticker">{ticker}</span> : null}
        </p>
        <p className="ok-row-said">{plainSaid(d)}</p>
      </div>
      <div className="ok-row-did">
        <span aria-hidden className="ok-mark" />
        <p>
          {whatKaptanDid(d, card)}
          {card ? (
            <>
              {" "}
              <Link href={href.proposal(card.proposal_id)} className="ok-go">
                Öneriyi aç →
              </Link>
            </>
          ) : null}
        </p>
      </div>
      <KapLink d={d} />
    </li>
  );
}
