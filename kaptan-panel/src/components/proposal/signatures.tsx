import type { ApprovalCard, ApprovalStatus } from "@/lib/domain";
import { memberByUid, memberForRole } from "@/lib/domain/user";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type SlotState = "done" | "rejected" | "waiting" | "closed";

/** Read before each title, so a screen reader hears the state first. */
const STATE_WORD: Readonly<Record<SlotState, string>> = {
  done: "Tamamlandı: ",
  rejected: "Reddedildi: ",
  waiting: "Bekliyor: ",
  closed: "Kapandı: ",
};

/**
 * The two signatures an order needs, as a two-step list: 1. the rules (signed by the system
 * when the proposal was written), 2. the Risk Sorumlusu. When the second is given here and now
 * (`justSigned`), its check mark is pressed in once (the one short stamp moment of the screen).
 */
export function SignatureLines({ card, status, justSigned = false }: { card: ApprovalCard; status: ApprovalStatus; justSigned?: boolean }) {
  const passed = card.rule_trace_summary.filter((r) => r.passed).length;
  const total = card.rule_trace_summary.length;
  const signer = memberByUid(card.decided_by) ?? memberForRole("risk_officer");
  const human: SlotState =
    status === "approved" ? "done" : status === "rejected" ? "rejected" : status === "pending" ? "waiting" : "closed";
  const decidedAt = card.decided_at ? fmtTime(card.decided_at) : "—";
  const humanMeta =
    human === "waiting" ? `${signer.name} bekleniyor` : human === "closed" ? "İmza gerekmedi" : `${signer.name} · ${decidedAt}`;

  return (
    <ol aria-label="İmza zinciri" className="divide-y divide-hairline border-y border-hairline">
      <Line n={1} state="done" title="1. imza — Kurallar" meta={`${passed}/${total} kural geçti · ${fmtTime(card.created_at)}`} />
      <Line n={2} state={human} testId="human-signature" title="2. imza — Risk Sorumlusu" meta={humanMeta} press={justSigned && human === "done"} />
    </ol>
  );
}

function Line({ n, state, title, meta, testId, press = false }: { n: number; state: SlotState; title: string; meta: string; testId?: string; press?: boolean }) {
  return (
    <li data-testid={testId} className="flex items-center gap-3.5 py-3.5">
      <Mark n={n} state={state} press={press} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[16px] leading-6 font-semibold", state === "rejected" ? "text-north" : "text-ink")}>
          <span className="sr-only">{STATE_WORD[state]}</span>
          {title}
        </p>
        <p className="text-dense text-muted tabular-nums">{meta}</p>
      </div>
    </li>
  );
}

/** The step's mark: a filled check when signed, a cross when vetoed, the step number while open. */
function Mark({ n, state, press }: { n: number; state: SlotState; press: boolean }) {
  const base = "grid size-8 shrink-0 place-items-center rounded-full text-[15px] font-semibold";
  if (state === "done")
    return (
      <span aria-hidden data-mark="signed" className={cn(base, "bg-gain text-on-dark [--oneri-stamp-rot:0deg]", press && "oneri-stamp-press")}>
        ✓
      </span>
    );
  if (state === "rejected")
    return (
      <span aria-hidden className={cn(base, "bg-north text-on-dark")}>
        ✕
      </span>
    );
  return (
    <span aria-hidden className={cn(base, "border-2 border-dashed border-rule-soft text-muted")}>
      {n}
    </span>
  );
}
