import type { ApprovalCard, Explain } from "@/lib/domain";
import { crewByAgent, LOG_PORTRAIT_WIDTHS } from "@/lib/crew";
import { cn } from "@/lib/utils";
import { CrewPortrait } from "@/components/crew/crew-portrait";
import { crewLead, crewLines } from "@/components/story/plain";

/**
 * The eight crew members as a ship's log: one sentence on who changed the amount, then one
 * line each, in the order they worked, threaded on a single ink line through the portraits.
 * Most lines are quiet (small portrait, name in its own column); the members who changed the
 * amount are set as a brighter sheet on the line, with a larger portrait and "tutarı değiştirdi".
 */
export function CrewVoices({ card, explain, loading }: { card: ApprovalCard; explain: Explain | null; loading: boolean }) {
  const lines = crewLines(card, explain);
  return (
    <div className="space-y-4">
      <p className="text-body text-ink">{crewLead(lines, card)}</p>
      <ul aria-label="Tayfanın notları" aria-busy={loading || undefined} className="relative border-t-2 border-ink pt-1">
        <span aria-hidden className="absolute top-0 bottom-3 left-[23.25px] w-[2px] bg-ink" />
        {lines.map((l) => {
          const m = crewByAgent(l.agent);
          return (
            <li
              key={l.agent}
              className={cn(
                "relative grid grid-cols-[48px_minmax(0,1fr)] items-start gap-x-3.5",
                l.changed ? "my-2 border-l-[3px] border-wash bg-panel py-3 pr-4 -ml-[3px]" : "py-2",
              )}
            >
              <span className="flex justify-center">
                <CrewPortrait
                  member={m}
                  sizes={l.changed ? "44px" : "32px"}
                  widths={LOG_PORTRAIT_WIDTHS}
                  className={cn("ring-[3px] ring-paper", l.changed ? "w-11 ring-panel" : "w-8")}
                />
              </span>
              <div className={cn("min-w-0", l.changed ? "pt-0.5" : "grid gap-x-4 pt-1 sm:grid-cols-[112px_minmax(0,1fr)]")}>
                {l.changed ? (
                  <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="text-ui font-medium text-ink">{m.name}</span>
                    <span className="text-meta font-semibold tracking-[0.08em] text-wash uppercase">Tutarı değiştirdi</span>
                  </p>
                ) : (
                  <p className="text-dense font-medium text-ink sm:pt-px">{m.name}</p>
                )}
                <p className={cn(l.changed ? "mt-1 text-ui text-ink" : "text-dense text-ink-soft sm:text-ui")}>{l.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
