import type { ReactNode } from "react";
import type { ApprovalCard, ApprovalStatus } from "@/lib/domain";
import { memberByUid, memberForRole } from "@/lib/domain/user";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { locative } from "@/components/story/turkish";

type SlotState = "done" | "rejected" | "waiting" | "closed";

/** Read before each title, so a screen reader hears the state first. */
const STATE_WORD: Readonly<Record<SlotState, string>> = {
  done: "Tamamlandı: ",
  rejected: "Reddedildi: ",
  waiting: "Bekliyor: ",
  closed: "Kapandı: ",
};

/**
 * The two signatures an order needs, as two lines at the foot of the decision sheet. The rules
 * sign like a machine (a straight printed mark); the Risk Sorumlusu signs like a person (a
 * stamp in umber, set down a little crooked). The stamp is pressed in only when signed here and
 * now (`justSigned`); otherwise it is simply there.
 */
export function SignatureLines({ card, status, justSigned = false }: { card: ApprovalCard; status: ApprovalStatus; justSigned?: boolean }) {
  const passed = card.rule_trace_summary.filter((r) => r.passed).length;
  const total = card.rule_trace_summary.length;
  const signer = memberByUid(card.decided_by) ?? memberForRole("risk_officer");
  const proposedAt = fmtTime(card.created_at);
  const human: SlotState =
    status === "approved" ? "done" : status === "rejected" ? "rejected" : status === "pending" ? "waiting" : "closed";
  const decidedAt = card.decided_at ? fmtTime(card.decided_at) : "—";
  const humanMeta =
    human === "waiting" ? `${signer.name} bekleniyor` : human === "closed" ? "İmza gerekmedi" : `${signer.name} · ${decidedAt}`;

  return (
    <section aria-labelledby="imzalar" className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="imzalar" className="label">
          İki imza
        </h3>
        <p className="text-dense text-muted tabular-nums">Tayfa {locative(proposedAt)} önerdi.</p>
      </div>
      <ol aria-label="İmza zinciri" className="grid gap-x-10 sm:grid-cols-2">
        <Line state="done" title="1. imza — Kurallar (makine)" meta={`${passed}/${total} kural geçti · ${proposedAt}`}>
          <span className="code inline-flex items-center gap-2 border-2 border-ink px-2 py-1 text-dense text-ink">
            <span className="font-sans">✓</span>KURALLAR {passed}/{total}
          </span>
        </Line>
        <Line state={human} testId="human-signature" title="2. imza — Risk Sorumlusu (insan)" meta={humanMeta} tone={human === "done"}>
          {human === "done" || human === "rejected" ? (
            <Stamp word={human === "done" ? "İmzalandı" : "Reddedildi"} who={`${signer.name} · ${decidedAt}`} veto={human === "rejected"} press={justSigned} />
          ) : null}
        </Line>
      </ol>
      <p className="max-w-[560px] pt-3 text-dense text-ink-soft">
        Öneriyi tayfa yazar ama emir için iki imza gerekir: önce kurallar (makine), sonra Risk Sorumlusu (insan). Öneriyi yazan onu onaylayamaz.
      </p>
    </section>
  );
}

/** One signature line: the mark sits on the line (room kept for it, so nothing jumps), the name under it. */
function Line({
  state,
  title,
  meta,
  tone = false,
  testId,
  children,
}: {
  state: SlotState;
  title: string;
  meta: string;
  tone?: boolean;
  testId?: string;
  children?: ReactNode;
}) {
  const open = state === "waiting" || state === "closed";
  return (
    <li data-testid={testId} className="min-w-0">
      <div aria-hidden className="relative z-10 flex h-16 items-end sm:h-[76px] pb-2.5 pl-1">
        {children}
      </div>
      <div className={cn("border-t-2 pt-2", open ? "border-rule-soft" : state === "rejected" ? "border-north" : "border-ink")}>
        <span className={cn("block text-ui font-medium", state === "rejected" ? "text-north" : tone ? "text-[var(--role-risk)]" : "text-ink")}>
          <span className="sr-only">{STATE_WORD[state]}</span>
          {title}
        </span>
        <span className="mt-0.5 block text-dense text-muted tabular-nums">{meta}</span>
      </div>
    </li>
  );
}

/** A rubber stamp: double ink rule, spaced capitals, pressed at −3°, biting the line a little. Umber for a signature, north red for a veto. */
function Stamp({ word, who, veto, press }: { word: string; who: string; veto: boolean; press: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex flex-col items-start border-[2.5px] border-current bg-panel/40 px-3.5 py-1.5 outline-2 outline-offset-2 outline-current outline-solid mix-blend-multiply [--oneri-stamp-rot:-3deg]",
        "translate-y-[7px] rotate-[-3deg]",
        veto ? "text-north" : "text-[var(--role-risk)]",
        press && "oneri-stamp-press",
      )}
    >
      <span className="text-[21px] leading-7 font-semibold tracking-[0.16em] uppercase">{word}</span>
      <span className="text-meta font-semibold tracking-[0.06em] tabular-nums uppercase">{who}</span>
    </span>
  );
}
