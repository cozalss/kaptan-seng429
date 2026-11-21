"use client";

import "./company.css";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PERIODS, PERIOD_LABEL, type Company, type PastDecision, type Period } from "@/lib/company/company";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt, fmtDate, fmtTime } from "@/lib/format";
import { href, ROUTES } from "@/lib/nav";
import { fmtLira, fmtSignedLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { PageHeader, ScreenState } from "@/components/shell/page-frame";
import { PriceAge } from "@/components/solo/price-age";
import { signTone } from "@/components/story/sign-tone";
import { Button } from "@/components/ui/button";
import { kapUrl, plainSaid, whatKaptanDid } from "@/components/disclosures/reading-words";
import { StarButton } from "@/components/watchlist/star-button";
import { companyName, DECISION_LABEL, followingSentence, priceHeadline } from "./company-words";
import { PriceLine } from "./price-line";

/**
 * /hisse/[ticker]: one company. A plain sentence first, then the price line, what you hold of it, what it
 * announced at KAP (with KAPtan's plain reading) and what KAPtan decided about it before.
 */
export function CompanyScreen({ ticker }: { ticker: string }) {
  const [period, setPeriod] = useState<Period>("3m");
  const q = useApiQuery((api) => api.company(ticker, period), [ticker, period]);
  const [starred, setStarred] = useState<boolean | null>(null);

  if (q.error && !q.data) {
    const missing = q.error.includes("bulamadım");
    return (
      <div className="co-screen">
        <ScreenState kind={missing ? "empty" : "error"} title={missing ? `${ticker} diye bir şirket bulamadım.` : "Şirketi şu an getiremedim."} onRetry={missing ? undefined : q.refetch} action={<Button asChild variant="secondary"><Link href={ROUTES.bildirimler}>Okunanlar’a dön</Link></Button>}>
          {missing ? "Kodu doğru yazdığından emin ol; üstteki aramadan şirketin adıyla da bulabilirsin." : q.error}
        </ScreenState>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="co-screen">
        <ScreenState kind="loading" title={`${ticker} sayfasını hazırlıyorum…`} />
      </div>
    );
  }
  const c = q.data;
  return (
    <div className="co-screen">
      <PageHeader
        name={c.ticker}
        title={`${companyName(c.name)}${c.sector ? `, ${c.sector} alanında bir şirket.` : "."}`}
        lead={<p>{followingSentence(c.following)}</p>}
        actions={<StarButton ticker={c.ticker} watched={starred ?? c.watched} onChanged={setStarred} />}
      />
      <PriceSection c={c} period={period} onPeriod={setPeriod} busy={q.refreshing} />
      {c.position ? <PositionSection p={c.position} ticker={c.ticker} /> : null}
      <DecisionsSection decisions={c.decisions} />
      <DisclosuresSection c={c} />
    </div>
  );
}

function PriceSection({ c, period, onPeriod, busy }: { c: Company; period: Period; onPeriod: (p: Period) => void; busy: boolean }) {
  return (
    <section aria-labelledby="co-fiyat" className="co-sec" aria-busy={busy}>
      <h2 id="co-fiyat" className="u-chapter text-ink">
        Fiyat
      </h2>
      <p className="co-lead">{priceHeadline(c.price)}</p>
      <div role="group" aria-label="Dönem" className="co-periods">
        {PERIODS.map((p) => (
          <button key={p} type="button" aria-pressed={p === period} className="co-period" onClick={() => onPeriod(p)}>
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      <PriceLine points={c.price.points} />
      <PriceAge asOf={c.price.last_day ? `${c.price.last_day}T15:30:00.000Z` : null} />
    </section>
  );
}

function PositionSection({ p, ticker }: { p: NonNullable<Company["position"]>; ticker: string }) {
  return (
    <section aria-labelledby="co-elinde" className="co-sec">
      <h2 id="co-elinde" className="u-chapter text-ink">
        Sende
      </h2>
      <p className="co-lead">
        {fmtInt(p.qty)} adet var; ortalama {fmtLira(p.avg_cost, true)} ödedin.
        {p.gain_try !== null ? (
          <>
            {" "}
            <span className={cn("tabular-nums", signTone(p.gain_try))}>
              Şimdiye kadar {fmtSignedLira(p.gain_try)}
              {p.gain_pct !== null ? ` (%${p.gain_pct.toLocaleString("tr-TR")})` : ""}
            </span>
            .
          </>
        ) : null}
      </p>
      <Link href={`${ROUTES.portfoy}#elinde-${ticker}`} className="co-link">
        Param’da gör →
      </Link>
    </section>
  );
}

function DecisionsSection({ decisions }: { decisions: readonly PastDecision[] }) {
  return (
    <section aria-labelledby="co-kararlar" className="co-sec">
      <h2 id="co-kararlar" className="u-chapter text-ink">
        KAPtan bu şirket için ne yaptı?
      </h2>
      {decisions.length === 0 ? (
        <p className="co-empty">Bu şirket için henüz bir karar vermedim.</p>
      ) : (
        <ol className="co-list">
          {decisions.map((d) => (
            <li key={d.run_id} className="co-row" data-decision={d.decision}>
              <time dateTime={d.at} className="co-time">
                {fmtDate(d.at)}
              </time>
              <div>
                <p className="co-row-title">{DECISION_LABEL[d.decision]}</p>
                <p className="co-row-text">{d.why_tr}</p>
              </div>
              {d.proposal_id ? (
                <Link href={href.proposal(d.proposal_id)} className="co-link">
                  Öyküyü aç →
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DisclosuresSection({ c }: { c: Company }) {
  const byIndex = useMemo(() => new Map(c.decisions.map((d) => [d.disclosure_index, d])), [c.decisions]);
  return (
    <section aria-labelledby="co-bildirimler" className="co-sec">
      <h2 id="co-bildirimler" className="u-chapter text-ink">
        KAP’taki son duyuruları
      </h2>
      {c.disclosures.length === 0 ? (
        <p className="co-empty">Bu şirketin okuduğum bir duyurusu yok.</p>
      ) : (
        <ol className="co-list">
          {c.disclosures.map((d) => {
            const dec = byIndex.get(d.disclosure_index);
            const card = dec?.decision === "suggested" && dec.approval_status ? { status: dec.approval_status as "approved", side: dec.side ?? "buy" } : null;
            const url = kapUrl(d);
            return (
              <li key={d.disclosure_index} className="co-row">
                <time dateTime={d.published_at} className="co-time">
                  {fmtDate(d.published_at)} {fmtTime(d.published_at)}
                </time>
                <div>
                  <p className="co-row-title">{plainSaid(d)}</p>
                  <p className="co-row-text">{whatKaptanDid(d, card)}</p>
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
      )}
    </section>
  );
}
