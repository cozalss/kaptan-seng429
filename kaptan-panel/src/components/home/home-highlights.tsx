"use client";

import "@/components/digest/digest.css";
import "@/components/signal/signal.css";

import Link from "next/link";
import { useState } from "react";
import { useApiQuery } from "@/lib/api/react";
import { KIND_TITLE } from "@/lib/digest/digest";
import type { DigestItem } from "@/lib/domain/digest";
import type { SignalTone } from "@/lib/domain/signal";
import { fmtInt, fmtTime } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { titleTr } from "@/lib/solo/words";
import { shortName } from "@/components/story/plain";
import { BlockHead } from "./block-head";
import { outsideSummary } from "./learned-words";

const SHOWN = 6;
const TONE_WORD: Readonly<Record<SignalTone, string>> = { olumlu: "Olumlu", olumsuz: "Olumsuz", notr: "Nötr", belirsiz: "Belirsiz" };

/**
 * "Günün öne çıkanları": today's notable disclosures from every other company, one scannable row each
 * (time, code, name, one plain line, a tone dot with its word). A row opens in place for what it means and
 * the links; the outside-list note is said once above the list, not on every row.
 */
export function HomeHighlights() {
  const q = useApiQuery((api) => api.digest(), []);
  const d = q.data;
  if (!d) return null;
  const others = d.items.filter((i) => i.why === null);
  const top = others.slice(0, SHOWN);
  const summary = outsideSummary(top);
  return (
    <section aria-labelledby="one-cikanlar" className="hm-block hm-highlights dg-card">
      <BlockHead
        id="one-cikanlar"
        label="Günün öne çıkanları"
        about={d.note ?? "Bugün bütün şirketlerden dikkat çeken duyurular."}
        action={
          others.length > 0 ? (
            <Link href={ROUTES.onemli} className="hm-more dg-link">
              Hepsi ({fmtInt(d.total)}) <span aria-hidden>→</span>
            </Link>
          ) : null
        }
      />
      {summary ? <p className="hm-hl-summary">{summary}</p> : null}
      {top.length === 0 ? (
        <p className="hm-quiet">{d.items.length > 0 ? "Başka şirketlerde dikkat çeken duyuru yok." : "Bugün dikkat çeken bir duyuru yok."}</p>
      ) : (
        <ul className="hm-hl-list">
          {top.map((i) => (
            <Row key={i.disclosure_index} item={i} />
          ))}
        </ul>
      )}
      {others.length === 0 ? (
        <Link href={ROUTES.onemli} className="hm-more dg-link">
          Önemli duyurulara git <span aria-hidden>→</span>
        </Link>
      ) : null}
    </section>
  );
}

function Row({ item }: { item: DigestItem }) {
  const [open, setOpen] = useState(false);
  const panel = `hl-${item.disclosure_index}`;
  return (
    <li className="hm-hl" data-open={open}>
      <button type="button" className="hm-hl-row" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)}>
        <time dateTime={item.published_at} className="hm-hl-time">
          {fmtTime(item.published_at)}
        </time>
        <span className="hm-hl-who">
          <span className="hm-hl-ticker">{item.ticker}</span> <span className="hm-hl-name">{titleTr(shortName(item.company_name))}</span>
        </span>
        <span className="hm-hl-line">{item.line}</span>
        <span className="hm-tone" data-tone={item.tone}>
          <span aria-hidden className="hm-tone-dot" />
          {TONE_WORD[item.tone]}
        </span>
        <svg aria-hidden viewBox="0 0 10 10" className="hm-hl-chevron" fill="currentColor">
          <path d="M3 1.5 7.5 5 3 8.5Z" />
        </svg>
      </button>
      <div id={panel} hidden={!open} className="hm-hl-more">
        {open ? (
          <>
            <p className="hm-hl-kind">{KIND_TITLE[item.kind]}</p>
            {item.so_what_tr ? <p>{item.so_what_tr}</p> : null}
            {item.suggestion_tr ? <p className="sg-suggest">{item.suggestion_tr}</p> : null}
            {item.outside_note ? <p className="hm-hl-outside">{item.outside_note}</p> : null}
            <p className="hm-hl-links">
              <Link href={item.panel_path} className="dg-link">
                Duyuruyu aç<span className="sr-only"> ({item.ticker})</span>
              </Link>
              <a href={item.source_url} target="_blank" rel="noreferrer noopener" className="dg-link">
                KAP’ta aç<span className="sr-only"> ({item.ticker}, yeni sekme)</span>
              </a>
            </p>
          </>
        ) : null}
      </div>
    </li>
  );
}
