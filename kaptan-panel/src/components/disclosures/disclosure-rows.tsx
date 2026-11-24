import Link from "next/link";
import type { ApprovalCard, DisclosureListItem } from "@/lib/domain";
import { fmtTime } from "@/lib/format";
import { href } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { TickerLink } from "@/components/company/ticker-link";
import { NewMark, SaveStar } from "@/components/reading/save-star";
import { ToneChip } from "@/components/signal/signal-bits";
import type { SignalItem } from "@/lib/domain/signal";
import { plainEvent, shortName } from "@/components/story/plain";
import { titleTr } from "@/components/story/turkish";
import { fateOf, groupByHour, tickerOf } from "./disclosure-logic";
import { KapLink } from "./kap-link";
import { plainSaid, whatKaptanDid } from "./reading-words";

type Cards = ReadonlyMap<number, ApprovalCard>;

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
                {tickerOf(d) ? <TickerLink ticker={tickerOf(d) ?? ""} /> : null} · <time dateTime={d.published_at}>{fmtTime(d.published_at)}</time>
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
export function DisclosureHours({ rows, label, cardOf, signalOf, onOpen }: { rows: readonly DisclosureListItem[]; label: string; cardOf: Cards; signalOf?: ReadonlyMap<number, SignalItem>; onOpen?: (index: number) => void }) {
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
              <Row key={d.disclosure_index} d={d} card={cardOf.get(d.disclosure_index) ?? null} signal={signalOf?.get(d.disclosure_index) ?? null} onOpen={onOpen} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Row({ d, card, signal, onOpen }: { d: DisclosureListItem; card: ApprovalCard | null; signal: SignalItem | null; onOpen?: (index: number) => void }) {
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
          <NewMark index={d.disclosure_index} />
          {ticker ? (
            <span className="ok-row-ticker">
              <TickerLink ticker={ticker} />
            </span>
          ) : null}
        </p>
        <p className="ok-row-said">{signal ? signal.line_tr : plainSaid(d)}</p>
        {signal ? (
          <p className="sg-meta">
            <ToneChip tone={signal.tone} />
            {signal.suggestion_tr ? <span className="sg-suggest">{signal.suggestion_tr}</span> : null}
          </p>
        ) : null}
        <div className="rd-row-tools">
          <SaveStar index={d.disclosure_index} label={titleTr(shortName(d.company_name))} />
          {onOpen ? (
            <button type="button" className="ok-open" onClick={() => onOpen(d.disclosure_index)} aria-label={`${titleTr(shortName(d.company_name))}: duyurunun tamamını oku`}>
              Tamamını oku
            </button>
          ) : null}
        </div>
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
