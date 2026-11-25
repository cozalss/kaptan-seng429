"use client";

import autoAnimate from "@formkit/auto-animate";
import { useCallback, type RefCallback } from "react";

/** Inside the 150–250 ms band the rest of the panel moves in. */
const LIST_MOTION_MS = 200;

/** Where it cannot run (no matchMedia: jsdom, very old browsers), the list simply does not move. */
function canAnimate(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && typeof Element.prototype.animate === "function";
}

/**
 * A list whose rows slide into place when one is added, answered or removed, instead of jumping. Put the
 * returned ref on the <ul>/<ol>. Honours prefers-reduced-motion (auto-animate turns itself off), and only
 * moves transform and opacity.
 */
export function useListMotion<T extends HTMLElement>(): RefCallback<T> {
  return useCallback((el: T | null) => {
    if (!el || !canAnimate()) return;
    const controller = autoAnimate(el, { duration: LIST_MOTION_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)", disrespectUserMotionPreference: false });
    return () => controller.destroy?.();
  }, []);
}
