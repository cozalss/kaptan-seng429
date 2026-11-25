"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/api/react";
import { useNow } from "@/lib/clock";
import type { TrackItem } from "@/lib/domain/reports";
import { fmtSignedFigurePct } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { dayLabel } from "@/lib/solo/words";
import { BlockHead } from "./block-head";
import { barScale, DID_WORD, isIfFollowed, recentTrack, trackSentence } from "./track-words";

/**
 * "KAPtan'ın önerdikleri": the last suggestions, what the person did and how each went since, as a small
 * bar either side of zero with its sign and percent (never colour alone). For one not bought, the result is
 * what following it would have given, and it says so. Percent only: no money amounts.
 */
export function HomeTrack() {
  const q = useApiQuery((api) => api.trackRecord(), []);
  const now = useNow(60_000);
  if (q.error && !q.data) return null;
  const items = q.data?.items ?? [];
  const shown = recentTrack(items);
  const scale = barScale(shown);
  return (
    <section aria-labelledby="onerdikleri" className="hm-block hm-track" data-testid="onerdikleri">
      <BlockHead id="onerdikleri" label="KAPtan’ın önerdikleri" about="Son öneriler, ne yaptığın ve o günden beri nasıl gittiği." />
      {!q.data ? null : shown.length === 0 ? (
        <div className="hm-track-empty">
          <EmptyArt />
          <p className="hm-quiet">
            Henüz öneri yok. KAPtan yalnız işlem hacmi yüksek hisselere ve izlediklerine öneri verir; ilk öneri gelince burada sonucunu göreceksin.
          </p>
        </div>
      ) : (
        <>
          {now !== null ? <p className="hm-track-sum">{trackSentence(items, now)}</p> : null}
          <ul className="hm-track-list">
            {shown.map((i) => (
              <Row key={i.proposal_id} item={i} scale={scale} />
            ))}
          </ul>
        </>
      )}
      <p className="hm-more-row">
        <Link href={ROUTES.karne} className="hm-more">
          Karne <span aria-hidden>→</span>
        </Link>
        <Link href={ROUTES.gecmis} className="hm-more">
          Geçmiş <span aria-hidden>→</span>
        </Link>
      </p>
    </section>
  );
}

function Row({ item, scale }: { item: TrackItem; scale: number }) {
  const r = item.return_ratio;
  const sign = r === null ? null : r > 0 ? "up" : r < 0 ? "down" : "flat";
  const width = r === null || scale === 0 ? 0 : (Math.abs(r) / scale) * 50;
  const ifFollowed = isIfFollowed(item.decision);
  return (
    <li className="hm-track-row">
      <span className="hm-track-who">
        {item.ticker}
        <span className="hm-track-day">{dayLabel(item.suggested_at)}</span>
      </span>
      <span className="hm-track-verb" data-action="al">
        AL
      </span>
      <span className="hm-track-did">
        <strong>{DID_WORD[item.decision]}</strong>
      </span>
      <span className="hm-track-result">
        {r === null ? (
          <span className="hm-track-if">{item.status === "open" ? "Süresi dolmadı" : "Fiyat yok"}</span>
        ) : (
          <span className="hm-track-pct" data-sign={sign}>
            {sign === "up" ? "▲ " : sign === "down" ? "▼ " : ""}
            {fmtSignedFigurePct(r)}
            {ifFollowed ? <span className="hm-track-if"> uysaydın</span> : null}
          </span>
        )}
        <span aria-hidden className="hm-track-bar">
          {sign === "up" || sign === "down" ? <span className="hm-track-fill" data-sign={sign} style={{ width: `${width}%` }} /> : null}
        </span>
      </span>
    </li>
  );
}

/** A faint drawing for the empty state: a waterline and a few bars waiting to be filled. */
function EmptyArt() {
  return (
    <svg aria-hidden viewBox="0 0 192 96" className="hm-track-art" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="8" y1="56" x2="184" y2="56" strokeWidth="2" />
      <rect x="20" y="36" width="20" height="20" strokeDasharray="3 4" />
      <rect x="56" y="24" width="20" height="32" strokeDasharray="3 4" />
      <rect x="92" y="56" width="20" height="14" strokeDasharray="3 4" />
      <rect x="128" y="30" width="20" height="26" strokeDasharray="3 4" />
      <path d="M160 52c6 2 18 2 24-2-2 5-7 8-14 8h-4c-4-1-6-3-6-6Z" />
      <path d="M172 50V32l8 14h-8" />
    </svg>
  );
}
