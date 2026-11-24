import Link from "next/link";
import { TickerLink } from "@/components/company/ticker-link";
import { ToneChip } from "@/components/signal/signal-bits";
import type { DigestItem } from "@/lib/domain/digest";
import { fmtTime } from "@/lib/format";
import { KIND_TITLE } from "@/lib/digest/digest";

/** One important disclosure: who, what happened in one line, its tone, what it means, when, why it is on the list and where to read it. */
export function DigestRow({ item, showKind = false }: { item: DigestItem; showKind?: boolean }) {
  return (
    <li className="dg-item">
      <p className="dg-when">{fmtTime(item.published_at)}</p>
      <div>
        <p className="dg-title">
          <TickerLink ticker={item.ticker} className="mr-2 font-bold" />
          <span className="dg-company">{item.company_name}</span>
        </p>
        <p className="dg-line">{item.line}</p>
        <p className="dg-tags">
          <ToneChip tone={item.tone} />
          {item.suggestion_tr ? <span className="sg-suggest">{item.suggestion_tr}</span> : null}
        </p>
        {item.so_what_tr ? <p className="dg-headline">{item.so_what_tr}</p> : null}
        <p className="dg-tags">
          {showKind ? <span className="dg-tag">{KIND_TITLE[item.kind]}</span> : null}
          {item.why === "held" ? <span className="dg-tag dg-tag--mine">Elinde var</span> : item.why === "watched" ? <span className="dg-tag dg-tag--mine">İzliyorsun</span> : null}
          {item.outside_note ? <span className="dg-outside">{item.outside_note}</span> : null}
          <Link href={item.panel_path} className="dg-link">
            Duyuruyu aç<span className="sr-only"> ({item.ticker})</span>
          </Link>
          <a href={item.source_url} target="_blank" rel="noreferrer noopener" className="dg-link">
            KAP’ta aç<span className="sr-only"> ({item.ticker}, yeni sekme)</span>
          </a>
        </p>
      </div>
    </li>
  );
}
