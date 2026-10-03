import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know the custom theme scales, or it reads `text-ui` as a colour and
 * drops a real colour such as `text-on-dark` (globals.css @theme: text-meta/dense/ui,
 * shadow-ink/ink-lg).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["meta", "dense", "ui"],
      shadow: ["ink", "ink-lg"],
    },
  },
});

/** Merge class names; later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
