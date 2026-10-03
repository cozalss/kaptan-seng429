import { cn } from "@/lib/utils";

/**
 * The road a proposal travelled, drawn as four stations on one ink line:
 * Bildirim → Tayfa → Kurallar → Sen. The last station is yours: an open ring that breathes
 * softly until you decide (still under reduced motion), then it is inked solid.
 */
const STOPS = [
  { label: "Bildirim", note: "KAP" },
  { label: "Tayfa", note: "8 üye okudu" },
  { label: "Kurallar", note: "eşikler, risk" },
  { label: "Sen", note: "son imza" },
] as const;

export function CrewPath({ decided }: { decided: boolean }) {
  return (
    <ol aria-label="Önerinin yolu" className="relative grid grid-cols-4 pt-2">
      <span aria-hidden className="absolute top-[15px] right-[12.5%] left-[12.5%] h-[1.5px] bg-ink" />
      {STOPS.map((s, i) => {
        const you = i === STOPS.length - 1;
        const done = !you || decided;
        return (
          <li key={s.label} className="relative flex flex-col items-center text-center" aria-current={you && !decided ? "step" : undefined}>
            <span
              aria-hidden
              className={cn(
                "relative z-[1] grid size-[15px] place-items-center rounded-full border-[1.5px]",
                done ? "border-ink bg-ink" : "border-wash bg-paper",
              )}
            >
              {you && !decided ? <span className="absolute -inset-[6px] animate-breathe rounded-full border border-wash" /> : null}
            </span>
            <span className={cn("mt-2.5 text-[14px] leading-none", you ? "font-medium text-ink" : "text-ink-soft")}>{s.label}</span>
            <span className="mt-1 text-[12px] leading-none text-muted">{you && decided ? "imzalandı" : s.note}</span>
          </li>
        );
      })}
    </ol>
  );
}
