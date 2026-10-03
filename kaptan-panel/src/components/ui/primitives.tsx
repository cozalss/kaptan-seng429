import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton: a ruled placeholder with a slow sweep (static under reduced motion). Rendered as
 * a block-level <span> so it is valid anywhere, including inside <p> and header text slots.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      className={cn(
        "block bg-[linear-gradient(90deg,var(--sunk)_0%,var(--sunk)_40%,#f6f4ef_50%,var(--sunk)_60%,var(--sunk)_100%)] bg-[length:200%_100%] [animation:skeleton-sweep_1.6s_linear_infinite]",
        className,
      )}
      {...props}
    />
  );
}

/** Lines of skeleton text, widths varied so it reads as type, not bars. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-11/12", "w-9/12", "w-10/12", "w-7/12", "w-8/12"];
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Yükleniyor">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3", widths[i % widths.length])} />
      ))}
    </div>
  );
}

/** Error box inside a panel: user-safe message + retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-l-[3px] border-north bg-north-tint px-4 py-3 text-ui">
      <span className="font-medium text-north">Yüklenemedi.</span>
      <span className="text-ink-soft">{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="ml-auto text-dense font-medium text-ink underline underline-offset-4 hover:text-wash">
          Yeniden dene
        </button>
      ) : null}
    </div>
  );
}

