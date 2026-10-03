import type { ApprovalCard, Explain } from "@/lib/domain";
import { crewByAgent } from "@/lib/crew";
import { CrewPortrait } from "@/components/crew/crew-portrait";
import { crewLines } from "@/components/story/plain";

/**
 * The eight crew members, one line each, in the order they worked — a small portrait, the
 * name, and what they said about this proposal. Reads like a ship's log.
 */
export function CrewVoices({ card, explain, loading }: { card: ApprovalCard; explain: Explain | null; loading: boolean }) {
  const lines = crewLines(card, explain);
  return (
    <ul aria-label="Tayfanın notları" aria-busy={loading || undefined} className="divide-y divide-hairline border-y border-hairline">
      {lines.map((l) => {
        const m = crewByAgent(l.agent);
        return (
          <li key={l.agent} className="grid grid-cols-[34px_minmax(0,1fr)] items-start gap-x-3.5 py-3">
            <CrewPortrait member={m} sizes="34px" className="w-[34px] border border-ink" />
            <p className="text-[15px] leading-[22px] text-ink-soft">
              <span className="font-medium text-ink">{m.name}:</span> {l.text}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
