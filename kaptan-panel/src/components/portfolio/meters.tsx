import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/format";
import { lossFraction } from "./risk-math";

/** Scale headroom past the limit, so the threshold tick sits at ~83 % of the track. */
const HEADROOM = 1.2;

/**
 * Loss meter: how far a loss has run toward its limit. A ruled track, an ink fill, and a tick
 * at the limit. The fill turns ochre (daily halt) or north red (kill) only once the limit is hit.
 */
export function LossMeter({
  value,
  limit,
  label,
  breachedTone,
  className,
}: {
  value: number;
  limit: number;
  label: string;
  breachedTone: "ochre" | "north";
  className?: string;
}) {
  const scaleEnd = limit * HEADROOM;
  const fill = lossFraction(value, scaleEnd);
  const tick = 1 / HEADROOM;
  const breached = value <= limit;
  return (
    <div className={cn("w-full", className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.abs(scaleEnd) * 100}
        aria-valuenow={Math.max(0, -value * 100)}
        aria-valuetext={`${fmtPct(value, 2)} — sınır ${fmtPct(limit, 0)}${breached ? ", sınır aşıldı" : ""}`}
        className="relative h-3 border border-ink bg-sunk"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width] duration-500 ease-out",
            breached ? (breachedTone === "north" ? "bg-north" : "bg-ochre") : "bg-ink",
          )}
          style={{ width: `${fill * 100}%` }}
        />
        <div aria-hidden className={cn("absolute -top-1 -bottom-1 w-[2px]", breachedTone === "north" ? "bg-north" : "bg-ochre")} style={{ left: `calc(${tick * 100}% - 1px)` }} />
      </div>
      <div aria-hidden className="relative mt-1 h-4 text-meta text-muted tabular-nums">
        <span className="absolute left-0">%0</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${tick * 100}%` }}>
          {fmtPct(limit, 0)}
        </span>
      </div>
    </div>
  );
}

/** Position slots: one cell per allowed position, a rule after the target (8 of 10, R08). */
export function SlotMeter({ used, target, max, label }: { used: number; target: number; max: number; label: string }) {
  return (
    <div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} aria-valuetext={`${used} / ${max} pozisyon, hedef ${target}`} className="flex gap-[3px]">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "h-3 flex-1 border",
              i < used ? "border-ink bg-ink" : "border-rule-soft bg-sunk",
              i === target && "ml-1.5",
            )}
          />
        ))}
      </div>
      <div aria-hidden className="mt-1 flex justify-between text-meta text-muted">
        <span>0</span>
        <span>hedef {target} · en çok {max}</span>
      </div>
    </div>
  );
}

/** Thin usage bar (provider quota). */
export function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const f = Math.min(1, used / limit);
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} className="h-1.5 w-full bg-sunk">
      <div className={cn("h-full", f >= 0.9 ? "bg-north" : "bg-wash")} style={{ width: `${f * 100}%` }} />
    </div>
  );
}
