"use client";

import "./signal.css";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ReadingMarksProvider, useReadingMarks } from "@/components/reading/marks";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import { listenLines, NOTHING_MINE, otherCount, stripItems } from "@/lib/signal/signal";
import { ListenButton } from "./listen-button";
import { SignalRow, useSignalKeys } from "./signal-bits";
import { useListMotion } from "@/components/ui/use-list-motion";

/** At most this many of mine on the home; the rest are one tap away in Okunanlar. */
export const STRIP_MAX = 5;

/**
 * "Senin hisselerinde bugün": the first thing on the home. Only your companies (held or watched) and only the
 * important disclosures, each with one line, its tone, what it means and KAPtan's word. When there is nothing,
 * it says so in words (that sentence alone ends the daily check) and says how many others exist elsewhere.
 */
export function SignalStrip({ limit = STRIP_MAX, compact = false, onMine }: { limit?: number; compact?: boolean; onMine?: (count: number) => void } = {}) {
  return (
    <ReadingMarksProvider>
      <StripBody limit={limit} compact={compact} onMine={onMine} />
    </ReadingMarksProvider>
  );
}

/**
 * `compact` (the home): the others are the next block's job, so their line is left out, and the rest of
 * mine are one "Hepsi" link away. `onMine` hears how many of mine are still open (after a Tamam too).
 */
function StripBody({ limit, compact, onMine }: { limit: number; compact: boolean; onMine?: (count: number) => void }) {
  const motion = useListMotion<HTMLUListElement>();
  const router = useRouter();
  const marks = useReadingMarks();
  const q = useApiQuery((api) => api.signals(), []);
  const list = q.data ?? null;
  const mine = useMemo(() => stripItems(list).filter((i) => marks?.triageOf(i.disclosure_index) !== "tamam"), [list, marks]);
  const shown = useMemo(() => mine.slice(0, limit), [mine, limit]);
  const known = list !== null;
  useEffect(() => {
    if (known) onMine?.(mine.length);
  }, [known, mine.length, onMine]);
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
  // The home's header already says "nothing of mine today" in its sentence: the empty strip would only repeat it.
  if (compact && list && shown.length === 0) return null;
  if (!list) return q.error ? null : <section aria-labelledby="sg-baslik" className="sg-strip u-page" aria-busy="true"><h2 id="sg-baslik" className="u-caption">Senin hisselerinde bugün</h2></section>;
  return (
    <section aria-labelledby="sg-baslik" className="sg-strip u-page" data-testid="senin-hisselerinde">
      <div className="sg-head">
        <h2 id="sg-baslik" className="u-caption">
          Senin hisselerinde bugün
        </h2>
        <ListenButton lines={lines} />
      </div>
      {compact ? <p className="hm-about">Elindeki ve izlediğin şirketlerin önemli duyuruları.</p> : null}
      {shown.length === 0 ? (
        <p className="sg-quiet" role="status">
          {NOTHING_MINE}
        </p>
      ) : (
        <ul ref={motion} className="sg-list" aria-label="Senin hisselerindeki önemli duyurular">
          {shown.map((s) => (
            <SignalRow key={s.disclosure_index} item={s} focused={focused === s.disclosure_index} />
          ))}
        </ul>
      )}
      {mine.length > shown.length ? (
        <p className="sg-more">
          <Link href={ROUTES.bildirimler}>{compact ? `Hepsi (${fmtInt(mine.length)}) →` : `${fmtInt(mine.length - shown.length)} duyuru daha →`}</Link>
        </p>
      ) : null}
      {others > 0 && !compact ? (
        <p className="sg-more">
          Başka şirketlerde {fmtInt(others)} önemli duyuru var. <Link href={ROUTES.onemli}>Önemli duyurulara git →</Link>
        </p>
      ) : null}
      {shown.length > 0 ? (
        <p className="sg-hint max-lg:hidden">
          Klavye: <kbd>j</kbd> <kbd>k</kbd> gez, <kbd>a</kbd> yapılacak, <kbd>s</kbd> sonra oku, <kbd>d</kbd> tamam.
        </p>
      ) : null}
    </section>
  );
}
