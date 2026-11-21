import type { InsiderEvent } from "@/lib/company/company";
import { fmtDate } from "@/lib/format";
import { kapUrl, plainSaid } from "@/components/disclosures/reading-words";

const KIND_WORD: Readonly<Record<InsiderEvent["kind"], string>> = {
  buyback: "Şirket kendi hissesini geri aldı",
  insider: "Yönetici ya da ana ortak hisse aldı",
};

/** How many of each kind; used for the one sentence above the list. Pure. */
export function insiderSentence(events: readonly InsiderEvent[]): string {
  if (events.length === 0) return "KAP’ta bu şirket için okuduğum bir geri alım ya da yönetici alımı yok.";
  const buyback = events.filter((e) => e.kind === "buyback").length;
  const insider = events.length - buyback;
  const parts = [buyback ? `${buyback} geri alım duyurusu` : null, insider ? `${insider} yönetici ya da ana ortak alımı` : null].filter(Boolean);
  return `KAP’ta okuduğum ${parts.join(" ve ")} var. Son olanı ${fmtDate(events[0]?.disclosure.published_at ?? "")}.`;
}

/** Insider purchases and buyback notices from the KAP disclosures KAPtan stored, newest first, each with its link. */
export function InsiderStrip({ events }: { events: readonly InsiderEvent[] }) {
  return (
    <section aria-labelledby="co-yonetici" className="co-sec">
      <h2 id="co-yonetici" className="u-chapter text-ink">
        Yönetici alımları ve geri alım
      </h2>
      <p className="co-lead">{insiderSentence(events)}</p>
      {events.length ? (
        <ol className="co-list">
          {events.slice(0, 8).map((e) => {
            const url = kapUrl(e.disclosure);
            return (
              <li key={e.disclosure.disclosure_index} className="co-row" data-kind={e.kind}>
                <time dateTime={e.disclosure.published_at} className="co-time">
                  {fmtDate(e.disclosure.published_at)}
                </time>
                <div>
                  <p className="co-row-title">{KIND_WORD[e.kind]}</p>
                  <p className="co-row-text">{plainSaid(e.disclosure)}</p>
                </div>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="co-link" aria-label="Duyuruyu KAP’ta aç (yeni sekmede)">
                    KAP’ta aç ↗
                  </a>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
