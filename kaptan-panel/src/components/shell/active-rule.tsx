import { cn } from "@/lib/utils";

/**
 * The 3px indigo rule under the current place in the top bar. Only the arriving rule is drawn
 * (from the left); the one you leave simply goes, so two rules never cross-fade.
 */
export function ActiveRule({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -bottom-[2px] h-[3px] origin-left bg-brand",
        on ? "scale-x-100 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-expo)]" : "scale-x-0 transition-none",
        className,
      )}
    />
  );
}
