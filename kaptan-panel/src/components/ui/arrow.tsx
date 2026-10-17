import { cn } from "@/lib/utils";

const PATHS = {
  right: "M1 5h11.5M8.5 1l4 4-4 4",
  left: "M13 5H1.5M5.5 1l-4 4 4 4",
  down: "M7 0.5v9M3 5.5l4 4 4-4",
} as const;

/**
 * A drawn arrow in the panel's 1.5px line, for places set in Bodoni (its subset has no
 * arrows, so a typed "→" there falls back to another face). Inter lines can keep "→".
 * Decorative: the words next to it carry the meaning.
 */
export function Arrow({ dir = "right", className }: { dir?: keyof typeof PATHS; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 14 10"
      width={14}
      height={10}
      className={cn("inline-block shrink-0 align-[0.05em]", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path d={PATHS[dir]} />
    </svg>
  );
}
