import { cn } from "@/lib/utils";

/**
 * The 2px ink rule under the current place in the top bar. Only the arriving rule is drawn
 * (from the left); the one you leave simply goes, so two rules never cross-fade.
 */
export function ActiveRule({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -bottom-px h-[2px] origin-left bg-ink",
        on ? "scale-x-100 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]" : "scale-x-0 transition-none",
        className,
      )}
    />
  );
}
