"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fmtPct, fmtSignedPct } from "@/lib/format";
import { ROUTES } from "@/lib/nav";
import type { Allocation } from "@/lib/solo/overview";
import { fmtLira, titleTr } from "@/lib/solo/words";
import { cn } from "@/lib/utils";
import { signTone } from "@/components/story/sign-tone";
import { squarify, type TreemapRect } from "./treemap";

/** Six holding inks in a fixed order (solo.css); a seventh holding and beyond share "Diğer". */
export const SLOT_COUNT = 6;
const SLOT_INK = ["var(--solo-c1)", "var(--solo-c2)", "var(--solo-c3)", "var(--solo-c4)", "var(--solo-c5)", "var(--solo-c6)"] as const;

export interface AllocationRow {
  key: string;
  label: string;
  detail: string | null;
  amount: number;
  share: number;
  pnlPct: number | null;
  fill: "slot" | "other" | "cash";
  slot: number;
}

/**
 * Holdings (biggest first, as the API sends them) then cash. With more than six holdings the
 * first five keep their own ink and the rest fold into one "Diğer" part, so no two named parts
 * ever share a colour. The Diğer row names what it holds. Shares are of the total money.
 */
export function allocationRows(allocations: readonly Allocation[], cash: number, total: number): { bar: AllocationRow[]; list: AllocationRow[] } {
  const share = (n: number) => (total > 0 ? n / total : 0);
  const fold = allocations.length > SLOT_COUNT;
  const own = fold ? SLOT_COUNT - 1 : SLOT_COUNT;
  const rows: AllocationRow[] = allocations.slice(0, own).map((a, i) => ({
    key: a.symbol,
    label: a.symbol,
    detail: titleTr(a.name),
    amount: a.amount,
    share: share(a.amount),
    pnlPct: a.pnl_pct,
    fill: "slot",
    slot: i + 1,
  }));
  const rest = allocations.slice(own);
  if (rest.length > 0) {
    const amount = rest.reduce((s, r) => s + r.amount, 0);
    rows.push({ key: "diger", label: `Diğer (${rest.length})`, detail: rest.map((r) => r.symbol).join(", "), amount, share: share(amount), pnlPct: null, fill: "other", slot: own + 1 });
  }
  const cashRow: AllocationRow = { key: "nakit", label: "Nakit", detail: "Hazırda bekleyen para", amount: cash, share: share(cash), pnlPct: null, fill: "cash", slot: 0 };
  const all = [...rows, cashRow];
  return { bar: all, list: all };
}

/** The smallest tile that can carry its label; below it a holding folds into "Diğer". */
const MIN_TILE_AREA = 92 * 60;

/** Fold holdings too small to label in this box into "Diğer", so every tile can be read. */
export function foldSmall(rows: readonly AllocationRow[], boxArea: number): AllocationRow[] {
  const isTiny = (r: AllocationRow) => r.fill === "slot" && r.share * boxArea < MIN_TILE_AREA;
  const tiny = rows.filter(isTiny);
  if (tiny.length < 2 && !rows.some((r) => r.fill === "other" && tiny.length > 0)) return [...rows];
  const other = rows.find((r) => r.fill === "other");
  const names = [...tiny.map((r) => r.label), ...(other?.detail ? [other.detail] : [])].join(", ");
  const amount = tiny.reduce((s, r) => s + r.amount, other?.amount ?? 0);
  const count = names.split(", ").length;
  const merged: AllocationRow = {
    key: "diger",
    label: `Diğer (${count})`,
    detail: names,
    amount,
    share: tiny.reduce((s, r) => s + r.share, other?.share ?? 0),
    pnlPct: null,
    fill: "other",
    slot: 0,
  };
  const kept = rows.filter((r) => !isTiny(r) && r.fill !== "other");
  const at = kept.findIndex((r) => r.fill === "cash");
  return [...kept.slice(0, at < 0 ? kept.length : at), merged, ...(at < 0 ? [] : kept.slice(at))];
}

function tileInk(r: AllocationRow): string | undefined {
  if (r.fill === "other") return "var(--solo-other)";
  if (r.fill === "slot") return SLOT_INK[r.slot - 1] ?? "var(--solo-other)";
  return undefined;
}

function tileWords(r: AllocationRow): string {
  const gain = r.pnlPct === null ? "" : ` Alıştan beri ${fmtSignedPct(r.pnlPct, 1)}.`;
  const who = r.detail ? `, ${r.detail}` : "";
  return `${r.label}${who}: ${fmtLira(r.amount)}, paranın ${fmtPct(r.share, 1)}'i.${gain} Param'da gör.`;
}

/** How much a tile can say, by its size in pixels. */
function Label({ row, rect }: { row: AllocationRow; rect: TreemapRect }) {
  const roomy = rect.w >= 170 && rect.h >= 128;
  const fits = rect.w >= 104 && rect.h >= 76;
  const big = rect.w >= 320 && rect.h >= 200;
  if (rect.w * rect.h < MIN_TILE_AREA * 0.6) return null;
  return (
    <span className="map-tile__label">
      <span className={cn("block leading-tight font-semibold", big ? "text-[20px]" : "text-[15px]")}>{row.label}</span>
      {roomy && row.detail ? <span className="block max-w-[26ch] truncate text-dense text-ink-soft">{row.detail}</span> : null}
      {fits ? <span className={cn("block font-semibold tracking-[-0.02em]", big ? "mt-1 text-[34px] leading-10" : "text-[15px] leading-5")}>{fmtLira(row.amount)}</span> : null}
      <span className="block text-dense text-ink-soft">
        {fmtPct(row.share, row.share < 0.1 ? 1 : 0)}
        {roomy && row.pnlPct !== null ? <span className={cn("ml-2 font-semibold", signTone(row.pnlPct))}>{fmtSignedPct(row.pnlPct, 1)}</span> : null}
      </span>
    </span>
  );
}

/** Keeps the map's measured size (jsdom has none: a sensible default). */
function useMapBox() {
  const ref = useRef<HTMLUListElement>(null);
  const [box, setBox] = useState({ w: 1100, h: 480 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth <= 0) return;
      setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, box };
}

/**
 * "Param nerede?": a map where area is money. Each holding keeps its own ink and a paper label;
 * cash is a hatched block, never one more colour. Every tile links to Param.
 */
export function AllocationPanel({ allocations, cash, total }: { allocations: readonly Allocation[]; cash: number; total: number }) {
  const { ref, box } = useMapBox();
  const rows = useMemo(() => foldSmall(allocationRows(allocations, cash, total).bar, box.w * box.h).filter((r) => r.share > 0), [allocations, cash, total, box.w, box.h]);
  const rects = useMemo(() => {
    // Biggest first gives the squarest tiles; colour stays with the holding, not this order.
    const sorted = [...rows].sort((a, b) => b.amount - a.amount);
    return squarify(sorted.map((r) => r.amount), box.w, box.h).flatMap((rect) => {
      const row = sorted[rect.index];
      return row ? [{ row, rect }] : [];
    });
  }, [rows, box.w, box.h]);
  const invested = allocations.reduce((s, a) => s + a.amount, 0);
  const places = allocations.length + (cash > 0 ? 1 : 0);
  return (
    <section aria-labelledby="param-nerede" className="min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2">
        <h2 id="param-nerede" className="u-sentence text-ink">
          Param nerede?
        </h2>
        <p className="max-w-[46ch] pb-1 text-body text-ink-soft tabular-nums">
          {allocations.length > 0 ? `Paran ${places} yerde duruyor: ${allocations.length} hissede ${fmtLira(invested)}, nakitte ${fmtLira(cash)}. Büyük kutu, büyük para.` : "Henüz hisse yok; paranın tamamı nakitte."}
        </p>
      </header>
      <ul ref={ref} className={cn("map mt-6 sm:mt-8", rows.length === 1 && "map--single")} aria-label="Paranın dağılımı">
        {rects.map(({ row, rect }) => (
          <li key={row.key} className="contents">
            <Link
              href={ROUTES.portfoy}
              aria-label={tileWords(row)}
              title={`${row.label}: ${fmtLira(row.amount)} · ${fmtPct(row.share, 1)}`}
              className="map-tile"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            >
              <span aria-hidden className={cn("map-tile__fill", row.fill === "cash" && "solo-cash-fill")} style={{ backgroundColor: tileInk(row) }} />
              <Label row={row} rect={rect} />
              <span aria-hidden className="map-tile__go max-sm:hidden">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
