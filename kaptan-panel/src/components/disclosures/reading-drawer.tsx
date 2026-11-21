"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useApiQuery } from "@/lib/api/react";
import { fmtDateTime } from "@/lib/format";
import { href } from "@/lib/nav";
import { titleTr } from "@/components/story/turkish";
import { shortName } from "@/components/story/plain";
import { TickerLink } from "@/components/company/ticker-link";
import { Button } from "@/components/ui/button";
import { tickerOf } from "./disclosure-logic";
import { kapUrl, plainSaid, whatKaptanDid } from "./reading-words";
import { TYPE_LABEL, TYPES, type TypeFilter } from "./filters";

const NUMBER_FORMAT = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

/**
 * One disclosure in full: the plain reading, what KAPtan thought it was, the numbers it read out of it,
 * why it did or did not act, the original text and the way to the official page at KAP. A modal drawer:
 * Escape or "Kapat" closes it and the address forgets it.
 */
export function ReadingDrawer({ index, onClose }: { index: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const q = useApiQuery((api) => api.disclosureReading(index), [index]);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);
  const d = q.data;
  const type = d?.classification?.event_type;
  const url = d ? kapUrl(d) : null;
  const card = d && d.decision === "suggested" && d.approval_status ? { status: d.approval_status as "approved", side: d.side ?? "buy" } : null;
  return (
    <dialog ref={ref} className="ok-drawer" aria-label="Duyurunun tamamı" onClose={() => ref.current?.open === false && onClose()}>
      {!d ? (
        <p role="status">{q.error ?? "Duyuruyu getiriyorum…"}</p>
      ) : (
        <article>
          <p className="u-caption">
            {tickerOf(d) ? <TickerLink ticker={tickerOf(d) ?? ""} /> : null} · <time dateTime={d.published_at}>{fmtDateTime(d.published_at)}</time>
          </p>
          <h2 className="u-chapter text-ink">{titleTr(shortName(d.company_name))}</h2>
          <p className="ok-drawer-said">{plainSaid(d)}</p>
          <dl className="ok-drawer-facts">
            <dt>KAPtan ne sandı?</dt>
            <dd>{type && (TYPES as readonly string[]).includes(type) ? TYPE_LABEL[type as TypeFilter] : "Para kararı gerektirmeyen bir haber"}</dd>
            <dt>Ne yaptı, neden?</dt>
            <dd>
              {whatKaptanDid(d, card)}
              {d.proposal_id ? (
                <>
                  {" "}
                  <Link href={href.proposal(d.proposal_id)} className="ok-go">
                    Öyküyü aç →
                  </Link>
                </>
              ) : null}
            </dd>
            {d.numbers.length ? (
              <>
                <dt>Okuduğu rakamlar</dt>
                <dd>
                  <ul>
                    {d.numbers.map((n) => (
                      <li key={n.name} className="tabular-nums">
                        {n.name}: {NUMBER_FORMAT.format(n.value)}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            ) : null}
          </dl>
          {d.texts.map((t) => (
            <details key={t.lang} className="ok-drawer-text">
              <summary>Duyurunun metni ({t.lang === "tr" ? "Türkçe" : "İngilizce"})</summary>
              <p>{t.body}</p>
            </details>
          ))}
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="ok-kap">
              KAP’ta aç <span aria-hidden>↗</span>
            </a>
          ) : null}
        </article>
      )}
      <Button variant="secondary" className="mt-4" onClick={onClose}>
        Kapat
      </Button>
    </dialog>
  );
}
