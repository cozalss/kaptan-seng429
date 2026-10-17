import type { CSSProperties, ReactNode } from "react";
import { CREW, LOG_PORTRAIT_WIDTHS } from "@/lib/crew";
import { cn } from "@/lib/utils";
import { CrewPortrait } from "@/components/crew/crew-portrait";
import { withNums } from "@/components/story/num";
import { Skeleton } from "@/components/ui/primitives";
import type { DecisionClock } from "./decision-clock";
import "./today.css";

/**
 * The day at a glance, under the big sentence: on the left the karar saati (when the soonest
 * proposal falls, how long is left, a rule that shortens as the window closes); on the right
 * the tayfa satırı (the eight portraits in pipeline order and what they did today). Two cells
 * of one ruled strip, side by side from 640px, stacked on a phone.
 */
export function DayStrip({
  state,
  clock,
  crew,
  halted = false,
}: {
  state: "loading" | "stopped" | "open" | "empty";
  clock: DecisionClock | null;
  crew: string | null;
  /** The daily −1% pause: proposals can still be refused today, not signed. */
  halted?: boolean;
}) {
  return (
    <div className="grid border-t-[1.5px] border-ink sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Cell label="Karar saati" className="border-b border-hairline sm:border-r sm:border-b-0 sm:pr-8">
        <ClockBody state={state} clock={clock} halted={halted} />
      </Cell>
      <Cell label="Tayfa" className="sm:pl-8">
        <CrewRow />
        {crew ? <p className="mt-3 text-dense text-ink-soft">{crew}</p> : <Skeleton className="mt-3 h-3 w-10/12" />}
      </Cell>
    </div>
  );
}

function Cell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 py-5", className)}>
      <p className="label text-ink-soft">{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ClockBody({ state, clock, halted }: { state: "loading" | "stopped" | "open" | "empty"; clock: DecisionClock | null; halted: boolean }) {
  if (state === "stopped") {
    return (
      <>
        <p className="font-display-text text-title text-ink">Karar yok.</p>
        <p className="mt-1 text-dense text-ink-soft">Yeniden başlatılınca yeni öneriler burada saatiyle görünür.</p>
      </>
    );
  }
  if (state === "empty") {
    return (
      <>
        <p className="font-display-text text-title text-ink">Bekleyen karar yok.</p>
        <p className="mt-1 text-dense text-ink-soft">Yeni öneri gelince son saat burada görünür.</p>
      </>
    );
  }
  if (!clock) {
    return (
      <div aria-hidden>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2.5 h-3 w-48" />
      </div>
    );
  }
  return (
    <>
      <p className="font-display-text text-title text-ink first-letter:uppercase">{withNums(clock.when)}</p>
      <p className="mt-1 text-dense text-ink-soft tabular-nums">
        {clock.left} · {halted ? "bugün yalnızca ret verilebilir (−%1 sınırı)." : "bu saate dek imzalanmayan öneri düşer."}
      </p>
      {/* What is left of the soonest proposal's window: drawn once, then it shortens in place. */}
      <div aria-hidden className="mt-3 h-[1.5px] bg-hairline">
        <div
          className="today-window h-full origin-left bg-ink"
          style={{ "--today-left": clock.remaining } as CSSProperties}
        />
      </div>
    </>
  );
}

/** The eight crew portraits, as on the landing's strip: square ink frames, no rounding. */
function CrewRow() {
  return (
    <ul aria-label="Tayfa: sekiz üye" className="flex gap-1">
      {CREW.map((m) => (
        <li key={m.id} title={m.name} className="max-w-11 min-w-0 flex-1 border border-rule-soft sm:w-8 sm:flex-none">
          <CrewPortrait member={m} sizes="32px" widths={LOG_PORTRAIT_WIDTHS} alt={m.name} />
        </li>
      ))}
    </ul>
  );
}
