import { cn } from "@/lib/utils";
import { SEGMENTS, walkSegments, type Segment } from "./chain-walk";

/** Every sixth tick stands taller, like the inch marks on a ruler, so the eye can count. */
const MAJOR = 6;

const TICK: Readonly<Record<Segment, string>> = {
  ink: "bg-ink",
  north: "bg-north",
  // Past a break nothing was walked: the ticks stay faint, never inked.
  dashed: "bg-hairline",
  blank: "bg-hairline",
};

/**
 * The walk drawn as a finger running down a ledger: a ruler of 48 ticks, each about
 * total/48 records, inked as the count passes it, and a small ink caret (the finger) riding
 * above at the exact record being read. On a break the caret and the tick under it turn north
 * red and stand tall; everything after stays faint. Decoration only: the count is read out
 * by the status line. Reduced motion: the caret jumps (transforms do not transition).
 */
export function WalkRuler({ checked, total, badPos }: { checked: number; total: number; badPos: number | null }) {
  const segments = walkSegments(checked, total, badPos);
  const broken = badPos !== null;
  // The caret sits over a tick's centre: the broken one, or the record being read.
  const half = 0.5 / SEGMENTS;
  const bad = segments.indexOf("north");
  const at = bad >= 0 ? (bad + 0.5) / SEGMENTS : Math.min(1 - half, Math.max(half, total > 0 ? checked / total : 0));
  return (
    <div aria-hidden className="relative overflow-hidden pt-3">
      {/* The finger: a full-width rail moved by its own width, so the caret lands on the record. */}
      <div className="absolute inset-x-0 top-0 transition-transform duration-[60ms] ease-linear" style={{ transform: `translateX(${(at * 100).toFixed(2)}%)` }}>
        <svg viewBox="0 0 10 7" className={cn("block h-[7px] w-[10px] -translate-x-1/2", broken ? "text-north" : "text-ink")}>
          <path d="M0 0h10L5 7z" fill="currentColor" />
        </svg>
      </div>
      <div className="flex h-9 items-end border-b-[1.5px] border-ink">
        {segments.map((s, i) => (
          <span key={i} className="flex min-w-0 flex-1 justify-center">
            <span
              className={cn(
                "w-[1.5px] transition-colors duration-[var(--dur-instant)]",
                s === "ink" && "w-[2px]",
                s === "north" ? "h-9 w-[3px]" : (i + 1) % MAJOR === 0 ? "h-5" : "h-3",
                TICK[s],
              )}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
