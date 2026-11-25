"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { BlockHead } from "./block-head";
import { SuggestedEmpty, SuggestedList } from "./suggested-list";
import { emptyReason, HOME_SUGGESTED_MAX, suggestedRows } from "./suggested-words";

/** Every suggestion with its result, joined from the approvals and the track record. A failed track record only hides the results. */
export function useSuggested() {
  return useApiQuery(async (api) => {
    const [cards, track] = await Promise.all([api.listApprovals("all"), api.trackRecord().catch(() => null)]);
    return suggestedRows(cards, track?.items ?? []);
  }, []);
}

/**
 * "Öneriye düşenler" on the home: the newest suggestions (pending, approved, skipped, expired), each with
 * the disclosure, what KAPtan said and why, what the person did and how it went since. The rest are on
 * /oneriler. When there are none, the reason why, from today's reading.
 */
export function HomeSuggested() {
  const q = useSuggested();
  const quiet = useApiQuery((api) => api.quietDay(), []);
  const rows = useMemo(() => q.data ?? [], [q.data]);
  if (q.error && !q.data) return null;
  return (
    <section aria-labelledby="oneriye-dusenler" className="hm-block hm-sg" data-testid="oneriye-dusenler">
      <BlockHead
        id="oneriye-dusenler"
        label="Öneriye düşenler"
        about="Öneriye dönüşen duyurular: KAPtan ne dedi, sen ne yaptın, o günden beri nasıl gitti."
        action={
          rows.length > HOME_SUGGESTED_MAX ? (
            <Link href={ROUTES.oneriler} className="dg-link">
              Hepsi ({fmtInt(rows.length)}) <span aria-hidden>→</span>
            </Link>
          ) : null
        }
      />
      {!q.data ? null : rows.length === 0 ? (
        <SuggestedEmpty reason={emptyReason(quiet.data ?? null)} />
      ) : (
        <SuggestedList rows={rows.slice(0, HOME_SUGGESTED_MAX)} label="Son öneriler" />
      )}
      {rows.length > 0 && rows.length <= HOME_SUGGESTED_MAX ? (
        <p className="hm-more-row">
          <Link href={ROUTES.oneriler} className="hm-more">
            Öneriler sayfası <span aria-hidden>→</span>
          </Link>
          <Link href={ROUTES.karne} className="hm-more">
            Karne <span aria-hidden>→</span>
          </Link>
        </p>
      ) : null}
    </section>
  );
}
