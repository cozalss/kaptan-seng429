import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know the custom theme scales, or it reads `text-ui` as a colour and
 * drops a real colour such as `text-on-dark` (globals.css @theme: the type scale, the two
 * Bodoni cuts, shadow-ink/ink-lg).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["meta", "dense", "ui", "body", "lead", "title", "display", "display-lg", "hero"],
      font: ["display", "display-text", "sans", "mono"],
      shadow: ["ink", "ink-lg"],
    },
  },
});

/** Merge class names; later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * True when the reader asked for less motion (OS setting). Safe on the server (false there).
 * Use it to pick `behavior: "auto"` over `"smooth"` for scrollIntoView and similar JS motion;
 * CSS animations are already handled in globals.css.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
