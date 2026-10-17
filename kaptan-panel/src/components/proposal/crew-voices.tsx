import type { ApprovalCard, Explain } from "@/lib/domain";
import { crewByAgent } from "@/lib/crew";
import { cn } from "@/lib/utils";
import { crewLines } from "@/components/story/plain";

/**
 * "Tayfa ne dedi?": the eight agents in the order they worked, one line each (name, what it
 * did). The ones that changed the amount are marked; the lead sentence sits in the section's
 * summary row, so it is not repeated here.
 */
export function CrewVoices({ card, explain, loading }: { card: ApprovalCard; explain: Explain | null; loading: boolean }) {
  const lines = crewLines(card, explain);
  return (
    <ul aria-label="Tayfanın notları" aria-busy={loading || undefined} className="divide-y divide-hairline border-y border-hairline">
      {lines.map((l) => (
        <li key={l.agent} className="grid gap-x-6 gap-y-0.5 py-3 sm:grid-cols-[160px_minmax(0,1fr)]">
          <p className="flex flex-wrap items-center gap-2 text-[15px] leading-6 font-semibold text-ink">
            {crewByAgent(l.agent).name}
            {l.changed ? <span className="border border-wash px-1.5 text-[13px] leading-5 font-semibold text-wash">Tutarı değiştirdi</span> : null}
          </p>
          <p className={cn("text-[15px] leading-6", l.changed ? "text-ink" : "text-ink-soft")}>{l.text}</p>
        </li>
      ))}
    </ul>
  );
}
