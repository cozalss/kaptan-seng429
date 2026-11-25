"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi, useApiQuery } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { ROUTES } from "@/lib/nav";
import { titleTr } from "@/lib/solo/words";
import type { CompanyHit } from "@/lib/domain/company";
import { BlockHead } from "./block-head";

const SEARCH_MIN = 2;
const SEARCH_WAIT_MS = 250;
const HITS_SHOWN = 5;

/**
 * "Başlamak için": for a person with no holdings and no watchlist, the few one-press steps that make
 * KAPtan theirs. Each step shows when it is done. Shown when the home opens in that state and kept for
 * the visit, so it does not vanish under the person's finger after the first step.
 */
export function GettingStarted({ hasHoldings }: { hasHoldings: boolean }) {
  const watch = useApiQuery((api) => api.watchlist(), []);
  const tg = useApiQuery((api) => api.telegramStatus().catch(() => null), []);
  const [shown, setShown] = useState<boolean | null>(null);
  // Decided once, on the first answer (state adjusted during render, not in an effect).
  if (shown === null && watch.data) setShown(!hasHoldings && watch.data.length === 0);
  if (!shown) return null;

  const watched = watch.data ?? [];
  const steps = [hasHoldings, watched.length > 0, tg.data?.paired === true];
  const done = steps.filter(Boolean).length;
  return (
    <section aria-labelledby="baslamak-icin" className="hm-block hm-start" data-testid="baslamak-icin">
      <BlockHead id="baslamak-icin" label="Başlamak için" about="KAPtan'ı kendi hisselerine göre ayarla; her adım bir dokunuş." action={<span className="hm-start-count">{done}/3 tamam</span>} />
      <ol className="hm-steps">
        <Step done={hasHoldings} title="Elindeki hisseleri ekle" about="KAPtan senin hisselerindeki duyuruları önce söyler.">
          <Link href={`${ROUTES.portfoy}#koydugun-para`} className="hm-step-go">
            Param’da ekle <span aria-hidden>→</span>
          </Link>
        </Step>
        <Step done={watched.length > 0} title="İzlemek istediğin şirketleri seç" about={watched.length ? `İzliyorsun: ${watched.map((w) => w.ticker).join(", ")}.` : "Elinde olmasa da haberini almak istediğin şirketler."}>
          <WatchSearch onWatched={() => void watch.refetch()} />
        </Step>
        <Step done={tg.data?.paired === true} title="Telefonuna Telegram’ı bağla" about="Önemli bir şey olunca bilgisayar kapalıyken de haber gelir.">
          <Link href={`${ROUTES.ayarlar}#telegram`} className="hm-step-go">
            Ayarlar’da bağla <span aria-hidden>→</span>
          </Link>
        </Step>
        <Step done={false} optional title="Midas dökümünü yükle" about="Bankandaki işlemleri tek seferde Param’a yazar.">
          <Link href={`${ROUTES.portfoy}#dokum`} className="hm-step-go">
            Dökümü yükle <span aria-hidden>→</span>
          </Link>
        </Step>
      </ol>
    </section>
  );
}

function Step({ done, optional = false, title, about, children }: { done: boolean; optional?: boolean; title: string; about: string; children: React.ReactNode }) {
  return (
    <li className="hm-step" data-done={done}>
      <span aria-hidden className="hm-step-mark">
        {done ? (
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
          </svg>
        ) : null}
      </span>
      <div className="hm-step-body">
        <p className="hm-step-title">
          {title}
          {done ? <span className="sr-only"> (tamam)</span> : null}
          {optional ? <span className="hm-step-optional">İsteğe bağlı</span> : null}
        </p>
        <p className="hm-step-about">{about}</p>
        {children}
      </div>
    </li>
  );
}

/** Find a company by name or code and follow it, without leaving the home. */
function WatchSearch({ onWatched }: { onWatched: () => void }) {
  const api = useApi();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<readonly CompanyHit[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < SEARCH_MIN) return;
    let alive = true;
    const t = setTimeout(() => {
      api.search(term).then(
        (r) => alive && setHits(r.companies.slice(0, HITS_SHOWN)),
        () => alive && setHits([]),
      );
    }, SEARCH_WAIT_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, api]);
  const shownHits = q.trim().length < SEARCH_MIN ? [] : hits;
  const follow = async (h: CompanyHit) => {
    try {
      await api.watch(h.ticker);
      setStatus(`${h.ticker} izleniyor.`);
      setQ("");
      onWatched();
    } catch (err) {
      setStatus(errorMessage(err));
    }
  };
  return (
    <div className="hm-watch">
      <label className="sr-only" htmlFor="hm-watch-q">
        İzlemek istediğin şirketi ara
      </label>
      <input id="hm-watch-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Şirket adı ya da kodu" className="hm-watch-input" autoComplete="off" />
      {shownHits.length ? (
        <ul className="hm-watch-hits" aria-label="Bulunan şirketler">
          {shownHits.map((h) => (
            <li key={h.ticker}>
              <span className="hm-watch-ticker">{h.ticker}</span>
              <span className="hm-watch-name">{titleTr(h.name)}</span>
              <button type="button" className="hm-watch-add" onClick={() => void follow(h)} aria-label={`${h.ticker}: izle`}>
                İzle
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" className="hm-watch-status">
        {status}
      </p>
    </div>
  );
}
