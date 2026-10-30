"use client";

import type NumberFlowType from "@number-flow/react";
import type { Format } from "@number-flow/react";
import { createElement, useSyncExternalStore } from "react";
import { fmtInt, fmtSignedPct, fmtPct, fmtTry, NBSP } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FigureKind = "try" | "int" | "pct" | "signedPct";

/** The words a figure reads as: exactly what lib/format prints, so copy and tests stay one. */
export function figureText(value: number, kind: FigureKind, digits = 1): string {
  if (kind === "try") return fmtTry(value);
  if (kind === "int") return fmtInt(value);
  if (kind === "pct") return fmtPct(value, digits);
  return fmtSignedPct(value, digits);
}

/** The same figure split for NumberFlow: a sign/percent prefix, the number, a unit suffix. */
function parts(value: number, kind: FigureKind, digits: number): { prefix: string; n: number; suffix: string; format: Format } {
  if (kind === "try") return { prefix: "", n: Math.round(value), suffix: `${NBSP}TL`, format: { maximumFractionDigits: 0 } };
  if (kind === "int") return { prefix: "", n: value, suffix: "", format: { maximumFractionDigits: 0 } };
  const text = figureText(value, kind, digits);
  const sign = text.startsWith("+") ? "+" : text.startsWith("−") ? "−" : "";
  const n = Math.abs(value * 100);
  return { prefix: `${sign}%`, n, suffix: "", format: { minimumFractionDigits: 0, maximumFractionDigits: digits } };
}

/** NumberFlow needs the Web Animations API (absent in jsdom and very old browsers): plain text then. */
const canFlow = () => typeof Element !== "undefined" && typeof Element.prototype.animate === "function";

/**
 * NumberFlow is fetched after the first figure mounts (out of the initial bundle): until it
 * arrives, and wherever it cannot run, the figure is plain text. Digits only roll on a later
 * change anyway, so nothing is lost by loading it late.
 */
let Flow: typeof NumberFlowType | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (!loading && canFlow()) {
    loading = import("@number-flow/react").then((m) => {
      Flow = m.default;
      listeners.forEach((l) => l());
    });
  }
  return () => listeners.delete(onChange);
}
const flowReady = () => canFlow() && Flow !== null;

/**
 * A KPI figure that rolls digit by digit when its value changes (NumberFlow, MIT): a live
 * equity tick reads as a change, not a flicker. It never counts up from zero on arrival (a
 * finance screen never shows a number that was not true). The words are kept as plain text for
 * screen readers, search and tests; the animated digits are decoration (aria-hidden). Server
 * render and the first client paint print the plain text, so nothing shifts on hydration;
 * NumberFlow honours prefers-reduced-motion by itself.
 */
export function Figure({ value, kind, digits = 1, className }: { value: number; kind: FigureKind; digits?: number; className?: string }) {
  const ready = useSyncExternalStore(subscribe, flowReady, () => false);
  const text = figureText(value, kind, digits);
  if (!ready || !Flow) return <span className={cn("tabular-nums", className)}>{text}</span>;
  const p = parts(value, kind, digits);
  return (
    <span className={cn("relative inline-block tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      {createElement(Flow, {
        "aria-hidden": true,
        value: p.n,
        prefix: p.prefix,
        suffix: p.suffix,
        locales: "tr-TR",
        format: p.format,
        className: "[--number-flow-char-height:1em] [--number-flow-mask-height:0.2em]",
        transformTiming: { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        spinTiming: { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        opacityTiming: { duration: 260, easing: "ease-out" },
      })}
    </span>
  );
}
