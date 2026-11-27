"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useApiQuery } from "@/lib/api/react";
import { fmtInt } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import type { SignalTone } from "@/lib/domain/signal";
import { BlockHead } from "./block-head";
import { funnelSteps, kindBars, takeaways, type FunnelStep, type KindBar } from "./learned-words";

/** Bars on a log scale: 373 and 7 both stay readable; every bar carries its own number, so nothing is read off a scale. */
function logShare(n: number, max: number): number {
  if (n <= 0 || max <= 0) return 0;
  return Math.max(0.04, Math.log10(n + 1) / Math.log10(max + 1));
}

const TONE_ORDER: readonly SignalTone[] = ["olumlu", "olumsuz", "notr", "belirsiz"];
const TONE_MARK: Readonly<Record<SignalTone, string>> = { olumlu: "▲", olumsuz: "▼", notr: "●", belirsiz: "?" };
const TONE_WORD: Readonly<Record<SignalTone, string>> = { olumlu: "olumlu", olumsuz: "olumsuz", notr: "nötr", belirsiz: "belirsiz" };

/**
 * "KAPtan bugün ne öğrendi": the day's reading as a picture. How many disclosures were read, how many were
 * looked at closely and how many became a suggestion (each with its plain reason), what kind of news stood
 * out, and two or three takeaways. Every figure comes from the day's counts and the highlights list.
 */
export function DayLearned({ mine }: { mine: number | null }) {
  const quiet = useApiQuery((api) => api.quietDay(), []);
  const digest = useApiQuery((api) => api.digest(), []);
  // The week's learning: its latest takeaway and the way to the full report. A failed read only hides the line.
  const learning = useApiQuery((api) => api.getLearning(), []);
  const lesson = learning.data?.takeaway_tr ?? null;
  if (!quiet.data && !digest.data && !learning.data) return null;
  const steps = quiet.data ? funnelSteps(quiet.data) : [];
  const bars = digest.data ? kindBars(digest.data.items) : [];
  const lines = takeaways(digest.data ?? null, mine);
  return (
    <section aria-labelledby="ne-ogrendi" className="hm-block hm-learned" data-testid="ne-ogrendi">
      <BlockHead id="ne-ogrendi" label="KAPtan bugün ne öğrendi" about="Bugün okunan duyurulardan çıkanlar, sayılarla." />
      <div className="hm-learned-grid">
        {steps.length ? <Funnel steps={steps} /> : null}
        {bars.length ? <Kinds bars={bars} /> : null}
      </div>
      {lines.length ? (
        <ul className="hm-takeaways" aria-label="Bugünden kısaca">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      {lesson ? (
        <p className="hm-lesson" data-testid="ders">
          <span className="hm-mini-label">Bu hafta öğrendiğim</span> {lesson}
        </p>
      ) : null}
      <div className="hm-learned-links">
        <Link href={ROUTES.onemli} className="hm-more">
          Hepsini gör <span aria-hidden>→</span>
        </Link>
        <Link href={ROUTES.ogrendiklerim} className="hm-more">
          Ne öğrendim <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}

function Funnel({ steps }: { steps: readonly FunnelStep[] }) {
  const max = steps[0]?.n ?? 0;
  return (
    <figure className="hm-funnel">
      <figcaption className="hm-mini-label">Okumadan öneriye</figcaption>
      <ol>
        {steps.map((s, i) => (
          <li key={s.label} className="hm-funnel-step" style={{ "--share": logShare(s.n, max), "--i": i } as CSSProperties}>
            <p className="hm-funnel-line">
              <span className="hm-funnel-n">{fmtInt(s.n)}</span> {s.label}
            </p>
            <span aria-hidden className="hm-funnel-track">
              <span className="hm-funnel-fill" />
            </span>
            {s.why ? <p className="hm-funnel-why">{s.why}</p> : null}
          </li>
        ))}
      </ol>
    </figure>
  );
}

function Kinds({ bars }: { bars: readonly KindBar[] }) {
  const max = bars[0]?.total ?? 1;
  return (
    <figure className="hm-kinds">
      <figcaption className="hm-mini-label">Öne çıkanlar, türüne göre</figcaption>
      <ul>
        {bars.map((b) => {
          const present = TONE_ORDER.filter((t) => b.tones[t] > 0);
          const words = present.map((t) => `${b.tones[t]} ${TONE_WORD[t]}`).join(", ");
          return (
            <li key={b.kind} className="hm-kind">
              <span className="hm-kind-title">{b.title}</span>
              <span className="hm-kind-n">
                {fmtInt(b.total)}
                <span className="sr-only"> duyuru: {words}</span>
                <span aria-hidden className="hm-kind-tones">
                  {present.map((t) => (
                    <span key={t} data-tone={t}>
                      {TONE_MARK[t]}
                      {b.tones[t]}
                    </span>
                  ))}
                </span>
              </span>
              <span aria-hidden className="hm-kind-track">
                <span className="hm-kind-bar" style={{ width: `${(b.total / max) * 100}%` }}>
                  {present.map((t) => (
                    <span key={t} className="hm-kind-seg" data-tone={t} style={{ flexGrow: b.tones[t] }} />
                  ))}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
