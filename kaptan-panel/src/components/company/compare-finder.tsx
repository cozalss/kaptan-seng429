"use client";

import { useEffect, useId, useState } from "react";
import type { CompanyHit } from "@/lib/company/company";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { titleTr } from "@/components/story/turkish";

const WAIT_MS = 250;

/**
 * Any company, not only the starred ones: type a code or a name, pick a hit, and it goes to the empty side
 * (or replaces the second one). Uses the same search as the bar (GET /search).
 */
export function CompareFinder({ onPick, side }: { onPick: (hit: CompanyHit) => void; side: "a" | "b" }) {
  const api = useApi();
  const hintId = useId();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ term: string; hits: readonly CompanyHit[] }>({ term: "", hits: [] });
  const [error, setError] = useState<string | null>(null);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    let live = true;
    const t = window.setTimeout(() => {
      api
        .search(term)
        .then((r) => {
          if (!live) return;
          setRes({ term, hits: r.companies.slice(0, 6) });
          setError(null);
        })
        .catch((e: unknown) => live && setError(errorMessage(e)));
    }, WAIT_MS);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [api, term]);

  const done = term.length >= 2 && res.term === term;
  const shown = done ? res.hits : [];
  return (
    <div className="co-find">
      <label>
        Başka bir şirket bul
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          // On a phone the list would open under the tab bar: bring the box to the top of the screen first.
          onFocus={(e) => {
            if (window.matchMedia("(max-width: 639px)").matches) e.currentTarget.scrollIntoView({ block: "start", behavior: "smooth" });
          }}
          placeholder="Kod ya da ad: THYAO, Aselsan…"
          autoComplete="off"
          aria-describedby={hintId}
        />
      </label>
      <p id={hintId} className="co-find-hint">
        Seçtiğin şirket {side === "a" ? "birinci" : "ikinci"} tarafa gelir.
      </p>
      {error ? <p role="alert" className="co-empty">{error}</p> : null}
      {shown.length ? (
        <ul className="co-find-hits" aria-label="Bulunan şirketler">
          {shown.map((h) => (
            <li key={h.ticker}>
              <button
                type="button"
                onClick={() => {
                  onPick(h);
                  setQ("");
                }}
              >
                <b>{h.ticker}</b> {titleTr(h.name)}
              </button>
            </li>
          ))}
        </ul>
      ) : done && !error ? (
        <p role="status" className="co-empty">
          Bu yazıya uyan bir şirket bulamadım.
        </p>
      ) : null}
    </div>
  );
}
