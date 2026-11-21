"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/api/react";
import { ROUTES } from "@/lib/nav";

/**
 * "Neden öneri yok?": shown when the home has no suggestion. One honest sentence from the day's real
 * counts (read, relevant, why nothing passed), and a way to see what was read. Nothing while the
 * numbers cannot be had.
 */
export function WhyQuiet() {
  const q = useApiQuery((api) => api.quietDay(), []);
  const day = q.data;
  if (!day) return null;
  return (
    <section aria-labelledby="neden-oneri-yok" className="mt-6 max-w-[72ch]" data-testid="neden-oneri-yok">
      <h3 id="neden-oneri-yok" className="u-caption text-ink-soft">
        Neden öneri yok?
      </h3>
      <p className="mt-1 text-body text-ink">{day.sentence_tr}</p>
      <Link href={ROUTES.bildirimler} className="mt-2 inline-flex min-h-11 items-center gap-2 text-ui font-semibold text-ink underline decoration-rule-ui underline-offset-4 hover:decoration-ink">
        Okunanlara bak <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
