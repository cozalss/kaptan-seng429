"use client";

import { useEffect, useState } from "react";
import type { CompanyHit } from "@/lib/company/company";
import { useApi } from "@/lib/api/react";
import { titleTr } from "@/components/story/turkish";

const MAX_HITS = 4;

/**
 * When a typed code is not known: the closest codes from the same search as the bar, as buttons that put the code in
 * the field. First the whole code, then its first three letters (a typo is usually at the end).
 */
export function TickerSuggest({ code, onPick }: { code: string; onPick: (ticker: string) => void }) {
  const api = useApi();
  const [hits, setHits] = useState<readonly CompanyHit[] | null>(null);

  useEffect(() => {
    let live = true;
    const ask = async () => {
      try {
        const whole = await api.search(code);
        const found = whole.companies.length ? whole.companies : code.length > 3 ? (await api.search(code.slice(0, 3))).companies : [];
        if (live) setHits(found.filter((h) => h.ticker !== code).slice(0, MAX_HITS));
      } catch {
        // Suggestions are a help, not a must: the field's own error already says what is wrong.
        if (live) setHits([]);
      }
    };
    void ask();
    return () => {
      live = false;
    };
  }, [api, code]);

  if (!hits?.length) return null;
  return (
    <div className="mf-suggest">
      <p className="mf-suggest-lead">Şunlardan biri olabilir mi?</p>
      <ul aria-label="Benzer hisse kodları">
        {hits.map((h) => (
          <li key={h.ticker}>
            <button type="button" onClick={() => onPick(h.ticker)}>
              <b>{h.ticker}</b> {titleTr(h.name)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
