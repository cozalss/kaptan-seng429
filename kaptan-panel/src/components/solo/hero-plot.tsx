"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { EquityPoint } from "@/lib/solo/overview";
import { nearestPoint } from "@/lib/solo/period";
import { dayLabel, fmtLira } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { Boat } from "@/components/ufuk/boat";
import { moneyHatch, seaStrokes, seaSurface } from "@/components/ufuk/engrave";
import { boatLean, dayReading, differenceWords, plotGeometry, restGeometry, type MoneyMark, type PlotBox, type PlotGeometry } from "./horizon";

/** Before layout is measured (and under jsdom): a sensible box, so the geometry always exists. */
interface StageBox {
  width: number;
  plot: number;
  stage: number;
  clear: ReadonlyArray<{ right: number; bottom: number }>;
}
const FALLBACK: StageBox = { width: 1000, plot: 340, stage: 520, clear: [] };
const PHONE = 640;
const BOAT_RATIO = 0.75;
const KEEL = 0.9;
const SAIL_FIRST_MS = 1150;
const SAIL_AGAIN_MS = 520;
const SAIL_EASE = "cubic-bezier(0.32, 0, 0.18, 1)";
const SAIL_SAMPLES = 28;
/** Hard to read a pin's label closer than this to the previous one. */
const PIN_LABEL_ROOM = 104;
const PIN_CLEARANCE = 14;
const PIN_ROW = 22;
const PAGE_STEP = 5;
const READOUT_ROOM = 310;
/** Water always kept under the lowest value: the label of the start and the dates live there. */
const PLOT_FOOT = 62;
/** Air between the words over the sky and the line that rises beside them. */
const WORDS_MARGIN = 28;

/** The first load sails the whole history unhurried; every later arrival is quick. */
let sailedThisVisit = false;

function boatSize(width: number): number {
  return Math.round(Math.max(76, Math.min(156, width * 0.1)));
}

function plotBox(box: StageBox): PlotBox {
  const boat = boatSize(box.width);
  return {
    width: box.width,
    height: box.plot,
    top: boat * BOAT_RATIO + 12,
    bottom: PLOT_FOOT,
    right: Math.round(Math.max(boat * 0.66, box.width * 0.075)),
    clear: box.clear,
  };
}

/**
 * Measures what the drawing needs: the stage (the water runs through the plot and the sea under
 * it), the plot, and where the words over the sky end, so the line can rise beside them.
 */
function useStageBox(plot: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState(FALLBACK);
  useLayoutEffect(() => {
    const plotEl = plot.current;
    const stageEl = plotEl?.closest<HTMLElement>(".hz-stage");
    if (!plotEl || !stageEl) return;
    const words = [...stageEl.querySelectorAll<HTMLElement>("[data-hz-words]")];
    const measure = () => {
      const width = stageEl.clientWidth;
      if (width <= 0) return;
      const at = plotEl.getBoundingClientRect();
      const clear = words.map((w) => {
        const r = w.getBoundingClientRect();
        return { right: Math.round(r.right - at.left + WORDS_MARGIN), bottom: Math.round(r.bottom - at.top + WORDS_MARGIN) };
      });
      const next: StageBox = { width, plot: plotEl.clientHeight, stage: stageEl.clientHeight, clear };
      setBox((b) => (JSON.stringify(b) === JSON.stringify(next) ? b : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(stageEl);
    ro.observe(plotEl);
    words.forEach((w) => ro.observe(w));
    return () => ro.disconnect();
  }, [plot]);
  return box;
}

const prefersStill = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The water: fixed once the geometry is known, never touched by a scrub. */
const Water = memo(function Water({ geo, width, height }: { geo: PlotGeometry; width: number; height: number }) {
  const surface = useMemo(() => seaSurface(geo.xy, geo.waterY, width, height), [geo, width, height]);
  const strokes = useMemo(() => seaStrokes(width, height, geo.waterY), [width, height, geo.waterY]);
  const clipId = "hz-sea-clip";
  return (
    <svg aria-hidden focusable="false" width={width} height={height} className="absolute inset-0 block">
      <clipPath id={clipId}>
        <path d={surface} />
      </clipPath>
      <path d={surface} fill="var(--sea)" />
      <path d={strokes} fill="var(--sea-stroke)" clipPath={`url(#${clipId})`} />
    </svg>
  );
});

/** The ink: hatching, the money line, the waterline. It draws itself as the boat sails. */
const Ink = memo(function Ink({ geo, width, height, marks, inkRef }: { geo: PlotGeometry; width: number; height: number; marks: readonly MoneyMark[]; inkRef: React.Ref<SVGSVGElement> }) {
  const hatch = useMemo(() => moneyHatch(geo.xy, geo.waterY), [geo]);
  return (
    <svg ref={inkRef} aria-hidden focusable="false" width={width} height={height} className="absolute inset-0 block overflow-visible">
      <path d={hatch.up} fill="none" stroke="var(--hatch-up)" strokeWidth={1.15} strokeLinecap="round" />
      <path d={hatch.down} fill="none" stroke="var(--hatch-down)" strokeWidth={1.1} strokeLinecap="round" />
      <line x1={0} x2={width} y1={geo.waterY} y2={geo.waterY} stroke="var(--ink)" strokeWidth={2} />
      <path d={geo.line} fill="none" stroke="var(--ink)" strokeWidth={2.75} strokeLinejoin="round" strokeLinecap="round" />
      {marks.map((m) => {
        const p = geo.xy[m.index];
        return p ? <circle key={m.date} cx={p.x} cy={p.y} r={5} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2.5} /> : null;
      })}
    </svg>
  );
});

/**
 * Which pins get a written label: those with room since the last one, never crowding the boat.
 * A label stands clear of the line around it, so it never hides the line it talks about.
 */
function labelledMarks(marks: readonly MoneyMark[], geo: PlotGeometry, width: number): Array<MoneyMark & { x: number; y: number; rise: number }> {
  if (width < PHONE) return [];
  const last = geo.xy[geo.xy.length - 1]?.x ?? width;
  const out: Array<MoneyMark & { x: number; y: number; rise: number }> = [];
  let lastX = -Infinity;
  let lifted = false;
  for (const m of marks) {
    const p = geo.xy[m.index];
    if (!p || p.x > last - PIN_LABEL_ROOM * 0.8) continue;
    const half = Math.min(PIN_LABEL_ROOM, 4.2 * m.text.length);
    const crest = Math.min(...geo.xy.filter((q) => Math.abs(q.x - p.x) <= half).map((q) => q.y));
    const crowded = p.x - lastX < half + PIN_LABEL_ROOM / 2;
    if (crowded && lifted) continue;
    lifted = crowded;
    out.push({ ...m, x: p.x, y: p.y, rise: p.y - crest + PIN_CLEARANCE + (crowded ? PIN_ROW : 0) });
    lastX = p.x;
  }
  return out;
}

export interface HeroPlotProps {
  points: readonly EquityPoint[];
  capitalStart: number;
  marks: readonly MoneyMark[];
  /** Few days or no movement yet: a line says it will fill in. */
  flat: boolean;
}

/**
 * The money line as a scene. The starting amount is the waterline: above it the rise is engraved
 * in indigo hatching, below it the fall is cross-hatched in claret and the sea drops with it, so
 * the boat always floats on the money. Point, tap, drag or use the arrow keys and the boat sails
 * to that day, with the date, the amount and the difference from the start beside it.
 */
export function HeroPlot({ points, capitalStart, marks, flat }: HeroPlotProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<SVGSVGElement>(null);
  const boatRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const box = useStageBox(plotRef);
  const line = useMemo(() => plotGeometry(points, capitalStart, plotBox(box)), [points, capitalStart, box]);
  const geo = useMemo(() => line ?? restGeometry(plotBox(box)), [line, box]);
  const boat = boatSize(box.width);
  const boatH = boat * BOAT_RATIO;
  const lastIndex = Math.max(0, points.length - 1);
  const measured = box !== FALLBACK;
  const sailRef = useRef<Animation[]>([]);
  // The sail's length is fixed when this period opens: pins wait for the boat to pass them.
  const [sailMs] = useState(() => (sailedThisVisit ? SAIL_AGAIN_MS : SAIL_FIRST_MS));

  useLayoutEffect(() => {
    const ink = inkRef.current;
    const hull = boatRef.current;
    if (!measured || !line || !ink || !hull || typeof hull.animate !== "function" || prefersStill()) return;
    const end = geo.xy[lastIndex];
    if (!end) return;
    const timing = { duration: sailMs, easing: SAIL_EASE };
    const frames = Array.from({ length: SAIL_SAMPLES + 1 }, (_, k) => {
      const i = Math.round((k / SAIL_SAMPLES) * lastIndex);
      const p = geo.xy[i] ?? end;
      return { transform: `translate(${p.x - boat / 2}px, ${p.y - boatH * KEEL}px) rotate(${boatLean(geo.xy, i)}deg)` };
    });
    const right = Math.max(0, box.width - end.x - 2);
    sailRef.current = [
      hull.animate(frames, timing),
      ink.animate([{ clipPath: `inset(-40px ${box.width}px -8px 0)` }, { clipPath: `inset(-40px ${right}px -8px 0)` }], timing),
    ];
    sailedThisVisit = true;
    return () => sailRef.current.forEach((a) => a.cancel());
    // Once per period, when the real size is known (the parent keys this component on the period):
    // a resize must not sail again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured]);

  // Any scrub ends the arrival at once: input always wins over the animation.
  useEffect(() => {
    if (active !== null) sailRef.current.forEach((a) => a.finish());
  }, [active]);

  const pins = useMemo(() => (line ? labelledMarks(marks, line, box.width) : []), [marks, line, box.width]);

  const at = active ?? lastIndex;
  const point = points[at];
  const here = geo.xy[line ? at : 0] ?? { x: 0, y: 0 };
  const markHere = marks.find((m) => m.index === at);
  const reading = point ? dayReading(point, capitalStart, markHere) : "";
  // To the boat's right while it fits: the words live on the left of the sky.
  const readLeft = here.x + boat * 0.62 + READOUT_ROOM > box.width;

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const usable = Math.max(1, rect.width * ((geo.xy[lastIndex]?.x ?? box.width) / box.width));
    setActive(nearestPoint(Math.min(1, (e.clientX - rect.left) / usable), points.length));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const from = active ?? lastIndex;
    const steps: Record<string, number> = { ArrowLeft: from - 1, ArrowDown: from - 1, ArrowRight: from + 1, ArrowUp: from + 1, PageDown: from - PAGE_STEP, PageUp: from + PAGE_STEP, Home: 0, End: lastIndex };
    const next = steps[e.key];
    if (e.key === "Escape") setActive(null);
    if (next === undefined) return;
    e.preventDefault();
    setActive(Math.min(lastIndex, Math.max(0, next)));
  };

  return (
    <div ref={plotRef} className="hz-plot">
      <Water geo={geo} width={box.width} height={box.stage} />
      <Ink geo={geo} width={box.width} height={box.plot} marks={marks} inkRef={inkRef} />
      <p className="hz-start" style={{ top: geo.waterY + 8 }}>
        Başladığın yer <span className="font-semibold tabular-nums">{fmtLira(capitalStart)}</span>
      </p>
      {pins.map((m) => (
        <span
          key={m.date}
          aria-hidden
          className="hz-pin"
          style={{ left: m.x, top: m.y, "--pin-rise": `${m.rise}px`, "--pin-delay": `${(m.x / box.width) * sailMs}ms` } as React.CSSProperties}
        >
          {m.text}
        </span>
      ))}
      <div
        ref={boatRef}
        aria-hidden
        className={cn("hz-boat", active !== null && "hz-boat--free")}
        style={{ width: boat, height: boatH, transform: `translate(${here.x - boat / 2}px, ${here.y - boatH * KEEL}px) rotate(${boatLean(geo.xy, at)}deg)` }}
      >
        <Boat className="block size-full" />
      </div>
      {line ? (
        <>
          <div
            aria-hidden
            data-testid="grafik-okuma"
            data-open={active !== null}
            className="hz-read"
            style={{ left: readLeft ? here.x - boat * 0.62 : here.x + boat * 0.62, top: Math.max(8, Math.min(box.plot - 130, here.y - boatH - 8)), translate: readLeft ? "-100% 0" : "0 0" }}
          >
            <span className="sr-only">{active === null ? `Bugün: ${fmtLira(point?.equity ?? 0)}` : reading}</span>
            {point ? (
              <>
                <span className="block text-meta font-semibold text-muted tabular-nums">{active === lastIndex || active === null ? "Bugün" : dayLabel(point.date)}</span>
                <span className="block text-[20px] leading-7 font-semibold tracking-[-0.01em] text-ink tabular-nums">{fmtLira(point.equity)}</span>
                <span className="block text-dense text-ink-soft">{differenceWords(point.equity, capitalStart)}</span>
                {markHere ? <span className="mt-1 block border-t-2 border-ink pt-1 text-dense font-semibold text-ink tabular-nums">{markHere.sentence}</span> : null}
              </>
            ) : null}
          </div>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Paranın gün gün değeri"
            aria-valuemin={0}
            aria-valuemax={lastIndex}
            aria-valuenow={at}
            aria-valuetext={reading}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={(e) => {
              // A finger lifting is not leaving: the reading stays until a tap elsewhere (blur).
              if (e.pointerType !== "touch") setActive(null);
            }}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="hz-hit"
          />
          <p aria-hidden className="hz-dates" style={{ top: box.plot - 26, width: geo.xy[lastIndex]?.x }}>
            <span>{dayLabel(points[0]?.date ?? "")}</span>
            <span>{dayLabel(points[lastIndex]?.date ?? "")}</span>
          </p>
        </>
      ) : null}
      {!line || flat ? <p className="hz-note" style={{ top: Math.max(0, geo.waterY - 32) }}>{line ? "İlk işlemden sonra grafik burada şekillenir." : "Grafik, ikinci günden sonra burada başlar."}</p> : null}
    </div>
  );
}
