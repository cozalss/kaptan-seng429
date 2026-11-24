"use client";

import "./signal.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ReadingMarksProvider, useReadingMarks } from "@/components/reading/marks";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { listenLines, NOTHING_MINE, otherCount, stripItems } from "@/lib/signal/signal";
import { ListenButton } from "./listen-button";
import { SignalRow, useSignalKeys } from "./signal-bits";

/** At most this many of mine on the home; the rest are one tap away in Okunanlar. */
export const STRIP_MAX = 5;

/**
 * "Senin hisselerinde bugün": the first thing on the home. Only your companies (held or watched) and only the
 * important disclosures, each with one line, its tone, what it means and KAPtan's word. When there is nothing,
 * it says so in words (that sentence alone ends the daily check) and says how many others exist elsewhere.
 */
export function SignalStrip() {
  return (
    <ReadingMarksProvider>
      <StripBody />
    </ReadingMarksProvider>
  );
}

function StripBody() {
  const router = useRouter();
  const marks = useReadingMarks();
  const q = useApiQuery((api) => api.signals(), []);
  const list = q.data ?? null;
  const mine = useMemo(() => stripItems(list).filter((i) => marks?.triageOf(i.disclosure_index) !== "tamam"), [list, marks]);
  const shown = useMemo(() => mine.slice(0, STRIP_MAX), [mine]);
  const others = otherCount(list);
  const focused = useSignalKeys(
    shown.map((s) => s.disclosure_index),
    (index) => {
      const hit = shown.find((s) => s.disclosure_index === index);
      if (hit) router.push(hit.panel_path);
    },
  );
  const lines = useMemo(
    () => listenLines(shown, shown.length ? `Senin hisselerinde bugün ${shown.length} önemli duyuru var.` : NOTHING_MINE),
    [shown],
  );
  if (!list) return q.error ? null : <section aria-labelledby="sg-baslik" className="sg-strip u-page" aria-busy="true"><h2 id="sg-baslik" className="u-caption">Senin hisselerinde bugün</h2></section>;
  return (
    <section aria-labelledby="sg-baslik" className="sg-strip u-page" data-testid="senin-hisselerinde">
      <div className="sg-head">
        <h2 id="sg-baslik" className="u-caption">
          Senin hisselerinde bugün
        </h2>
        <ListenButton lines={lines} />
      </div>
      {shown.length === 0 ? (
        <p className="sg-quiet" role="status">
          {NOTHING_MINE}
        </p>
      ) : (
        <ul className="sg-list" aria-label="Senin hisselerindeki önemli duyurular">
          {shown.map((s) => (
            <SignalRow key={s.disclosure_index} item={s} focused={focused === s.disclosure_index} />
          ))}
        </ul>
      )}
      {mine.length > shown.length ? (
        <p className="sg-more">
          <Link href={ROUTES.bildirimler}>{fmtInt(mine.length - shown.length)} duyuru daha →</Link>
        </p>
      ) : null}
      {others > 0 ? (
        <p className="sg-more">
          Başka şirketlerde {fmtInt(others)} önemli duyuru var. <Link href={ROUTES.onemli}>Önemli duyurulara git →</Link>
        </p>
      ) : null}
      {shown.length > 0 ? (
        <p className="sg-hint max-sm:hidden">
          Klavye: <kbd>j</kbd> <kbd>k</kbd> gez, <kbd>a</kbd> yapılacak, <kbd>s</kbd> sonra oku, <kbd>d</kbd> tamam.
        </p>
      ) : null}
    </section>
  );
}
