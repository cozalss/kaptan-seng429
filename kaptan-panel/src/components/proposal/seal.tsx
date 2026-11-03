"use client";

import { useEffect, useId, useState } from "react";
import { prefersReducedMotion } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { holdMs } from "./decide-logic";

/** A small seeded generator: the same worn flecks on the server, the client and every press. */
function flecks(count: number): ReadonlyArray<readonly [number, number, number]> {
  let seed = 1926;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: count }, () => [next() * 1000, next() * 340, 1.2 + next() * 3.4] as const);
}

const FLECKS = flecks(170);

/**
 * The ink seal of the landing (a double-ruled box, heavy capitals, the paper's tooth lifting flecks
 * out of the impression; kaptan-landing/src/components/compass/sprites.js). Drawn as SVG so it stays
 * sharp at any size and takes the page's red in both readings. Decorative: the words are said
 * elsewhere. `pressing` plays the short heavy landing once; without it the mark is simply there.
 */
export function InkSeal({ word, pressing = false, className }: { word: string; pressing?: boolean; className?: string }) {
  const mask = useId();
  return (
    <svg aria-hidden viewBox="0 0 1000 340" data-seal={word} className={cn("oneri-seal", pressing && "oneri-seal-press", className)}>
      <mask id={mask}>
        <rect width="1000" height="340" fill="#fff" />
        {FLECKS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#000" />
        ))}
      </mask>
      <g mask={`url(#${mask})`} fill="none" stroke="currentColor">
        <rect x="16" y="16" width="968" height="308" strokeWidth="14" />
        <rect x="42" y="42" width="916" height="256" strokeWidth="5" />
        <text x="500" y="174" textAnchor="middle" dominantBaseline="central" fill="currentColor" stroke="none" fontSize="132" fontWeight="800" textLength={word.length > 6 ? 800 : undefined} lengthAdjust="spacingAndGlyphs" className="oneri-seal-word">
          {word}
        </text>
      </g>
    </svg>
  );
}

/** True once the press has landed: at once under reduced motion, or when nothing is pressing. */
export function useLanded(pressing: boolean): boolean {
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (!pressing) return;
    const timer = setTimeout(() => setLanded(true), holdMs(prefersReducedMotion()));
    return () => clearTimeout(timer);
  }, [pressing]);
  return pressing && landed;
}
