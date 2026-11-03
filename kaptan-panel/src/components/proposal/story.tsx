import type { ReactNode } from "react";
import type { ApprovalCard, EvidenceEvent, Explain } from "@/lib/domain";
import { fmtPct, fmtTime } from "@/lib/format";
import { fmtLira } from "@/lib/solo/words";
import { counterNote, disclosureQuote, lookHere, middleCaseWords, NO_PROMISE, pastWins, plainHistory, plainWhy, realDisclosureUrl, riskSentence, riskView, sampleWords, shortName, shrinkSentence } from "@/components/story/plain";
import { Term } from "@/components/story/term";
import { locative, possessive, titleTr } from "@/components/story/turkish";
import { ArtCoins, ArtSheet, ArtStorm, ArtWake } from "./story-art";

/**
 * The evidence as a short story anyone can read: what the company announced, what happened in
 * similar past cases, what could go wrong, how much of your money it would use. Every figure comes
 * from the API, a missing one drops its sentence, and nothing here promises anything.
 */
export function Story({ card, explain, equity, perTrade }: { card: ApprovalCard; explain: Explain | null; equity: number | null; perTrade: number | null }) {
  const sell = card.side === "sell";
  return (
    <div className="oneri-story">
      <Announced card={card} explain={explain} />
      {sell && card.evidence_summary.n === 0 ? null : <PastCases card={card} events={explain?.evidence_events ?? []} />}
      <WhatCouldGoWrong card={card} explain={explain} equity={equity} perTrade={perTrade} />
      <YourMoney card={card} equity={equity} />
    </div>
  );
}

function Chapter({ art, title, children }: { art: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="oneri-chapter">
      {art}
      <div className="oneri-chapter-body">
        <h2 className="u-chapter oneri-chapter-title">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Announced({ card, explain }: { card: ApprovalCard; explain: Explain | null }) {
  const name = titleTr(shortName(card.company_name));
  const quote = disclosureQuote(explain?.texts[0]?.body);
  const publishedAt = explain?.disclosure.published_at ?? card.created_at;
  const source = realDisclosureUrl(card);
  if (card.side === "sell") {
    return (
      <Chapter art={<ArtSheet className="oneri-chapter-art" />} title="Neden şimdi?">
        <p className="oneri-chapter-text">{card.headline_tr}</p>
        <p className="oneri-chapter-text">Bu hisseyi alırken bir plan yapılmıştı; KAPtan o plana göre şimdi satmayı öneriyor.</p>
      </Chapter>
    );
  }
  return (
    <Chapter art={<ArtSheet className="oneri-chapter-art" />} title="Şirket ne duyurdu?">
      <p className="oneri-chapter-text">
        {name}, {locative(fmtTime(publishedAt))} <Term word="KAP">KAP</Term>’a bir <Term word="bildirim">bildirim</Term> gönderdi: {card.sub_type_tr.toLocaleLowerCase("tr-TR")}.
      </p>
      {quote ? <blockquote className="oneri-quote">“{quote}”</blockquote> : null}
      <p className="oneri-chapter-text">{plainWhy(card)}</p>
      {source ? (
        <a href={source} target="_blank" rel="noopener noreferrer" className="oneri-source">
          Bildirimin aslını KAP’ta oku
          <span aria-hidden>&nbsp;↗</span>
        </a>
      ) : null}
    </Chapter>
  );
}

function PastCases({ card, events }: { card: ApprovalCard; events: readonly EvidenceEvent[] }) {
  const e = card.evidence_summary;
  return (
    <Chapter art={<ArtWake className="oneri-chapter-art" />} title="Benzer durumlarda ne oldu?">
      <p className="oneri-chapter-text">
        {plainHistory(e, events)}
        {e.n > 0 ? ` ${middleCaseWords(e.median_car_5d)}` : ""}
      </p>
      {e.n > 0 ? <PastPlot n={e.n} wins={pastWins(e, events)} events={events} /> : null}
      <p className="oneri-chapter-text">
        {sampleWords(e.n)} {NO_PROMISE}
      </p>
    </Chapter>
  );
}

const PLOT = { w: 640, h: 148, water: 74, reach: 62 } as const;

/**
 * Each past case is one stroke on the waterline: above it the stock beat the <Term>market</Term>,
 * below it not. Height follows the size of the move when the cases are at hand; otherwise every
 * stroke is the same height and only the count speaks.
 */
function PastPlot({ n, wins, events }: { n: number; wins: number; events: readonly EvidenceEvent[] }) {
  const known = events.length === n;
  const values = known ? [...events].map((x) => x.car_5d).sort((a, b) => a - b) : Array.from({ length: n }, (_, i) => (i < n - wins ? -1 : 1));
  const top = Math.max(...values.map(Math.abs), 0.001);
  const gap = PLOT.w / values.length;
  const width = Math.max(1.5, Math.min(10, gap * 0.55));
  return (
    <div className="oneri-past">
      <svg role="img" aria-label={`${n} geçmiş olayın ${wins} tanesi çizginin üstünde, ${n - wins} tanesi altında.`} viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} className="oneri-past-plot">
        {values.map((v, i) => {
          const x = gap * i + gap / 2;
          const reach = Math.max(4, (Math.abs(v) / top) * PLOT.reach);
          return <line key={i} x1={x} x2={x} y1={PLOT.water} y2={PLOT.water + (v > 0 ? -reach : reach)} stroke={v > 0 ? "var(--gain)" : "var(--loss)"} strokeWidth={width} />;
        })}
        <line x1="0" x2={PLOT.w} y1={PLOT.water} y2={PLOT.water} stroke="var(--ink)" strokeWidth="2.5" />
      </svg>
      <p className="oneri-past-legend">
        <span>Üstteki çizgiler: <Term word="piyasa">piyasadan</Term> iyi gitti ({wins})</span>
        <span>Alttakiler: piyasadan iyi gitmedi ({n - wins})</span>
      </p>
    </div>
  );
}

function WhatCouldGoWrong({ card, explain, equity, perTrade }: { card: ApprovalCard; explain: Explain | null; equity: number | null; perTrade: number | null }) {
  const sell = card.side === "sell";
  const risk = sell ? null : riskView(card, explain?.proposal?.stop_price);
  const flags = card.skeptic_flags.filter((f) => f.severity !== "info").map((f) => f.detail_tr);
  const look = lookHere(card, explain);
  const shrink = shrinkSentence(card.size_multiplier);
  const limit = perTrade !== null && equity !== null ? { pct: perTrade, equity } : null;
  // The same doubt is often recorded three ways: the concrete ones come first, the general note only when there is nothing else.
  const against = flags.length ? flags.join(" ") : (look ?? `KAPtan kendine karşı da bakar: “${counterNote(card)}”`);
  return (
    <Chapter art={<ArtStorm className="oneri-chapter-art" />} title="Ne ters gidebilir?">
      {sell ? <p className="oneri-chapter-text">Sattıktan sonra fiyat yükselebilir; o kazançtan pay alamazsın.</p> : null}
      <p className="oneri-chapter-text">
        {against}
        {shrink ? ` ${shrink}` : ""}
      </p>
      {flags.length && look ? <p className="oneri-chapter-text">{look}</p> : null}
      {risk ? <p className="oneri-chapter-text">{riskSentence(risk, limit)}</p> : null}
      {card.degraded ? <p className="oneri-chapter-quiet">KAPtan bu öneriyi hazırlarken yedek yöntemle çalıştı; biraz daha temkinli oku.</p> : null}
    </Chapter>
  );
}

function YourMoney({ card, equity }: { card: ApprovalCard; equity: number | null }) {
  const sell = card.side === "sell";
  const share = equity && equity > 0 ? Math.min(1, card.final_notional_try / equity) : null;
  const [a, b] = card.holding_days;
  return (
    <Chapter art={<ArtCoins className="oneri-chapter-art" />} title={sell ? "Paran ne olur?" : "Paranın ne kadarını kullanır?"}>
      <p className="oneri-chapter-text">
        {sell ? (
          <>
            Bu satışla yaklaşık {fmtLira(card.final_notional_try)} <Term word="nakit">nakde</Term> döner.
          </>
        ) : (
          <>
            Yaklaşık {fmtLira(card.final_notional_try)}
            {share !== null ? `, yani paranın ${possessive(fmtPct(share, 1))}` : ""}. Geri kalanına dokunmaz.
          </>
        )}
      </p>
      {share !== null && equity !== null ? (
        <div className="oneri-share">
          <div aria-hidden className="oneri-share-bar u-hatch">
            <div className="oneri-share-part" style={{ width: `${share * 100}%` }} />
          </div>
          <p className="oneri-share-legend">
            <span>Bu işlem: {fmtLira(card.final_notional_try)}</span>
            <span>Toplam paran: {fmtLira(equity)}</span>
          </p>
        </div>
      ) : null}
      {sell ? null : <p className="oneri-chapter-text">KAPtan bu hisseyi {a === b ? a : `${a}–${b}`} borsa günü elinde tutmayı planlıyor.</p>}
    </Chapter>
  );
}
