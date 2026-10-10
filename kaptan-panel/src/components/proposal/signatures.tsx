import type { ApprovalCard, ApprovalStatus } from "@/lib/domain";
import { memberByUid, memberForRole, ROLE_LABEL } from "@/lib/domain/user";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Two signatures on a proposal: the rules (machine) and the Risk Sorumlusu (a person).
 * "Tayfa önerdi → Kurallar onayladı → Risk Sorumlusu imzalar"; once signed, the last stamp
 * shows who, in which role, and when.
 */
export function SignatureChain({ card, status }: { card: ApprovalCard; status: ApprovalStatus }) {
  const passed = card.rule_trace_summary.filter((r) => r.passed).length;
  const signer = memberByUid(card.decided_by) ?? memberForRole("risk_officer");
  const signed = status === "approved" || status === "rejected";
  const closed = !signed && status !== "pending";

  return (
    <section aria-labelledby="imzalar" className="space-y-4">
      <h2 id="imzalar" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
        İki imza
      </h2>
      <ol aria-label="İmza zinciri" className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1.25fr] sm:items-stretch sm:gap-2">
        <Stamp n="1" title="Tayfa önerdi" meta={fmtTime(card.created_at)} done />
        <Arrow />
        <Stamp n="2" title="Kurallar onayladı" meta={`${passed} kural geçti · imza 1/2`} done />
        <Arrow />
        <Stamp
          n="3"
          testId="human-signature"
          title={
            status === "approved"
              ? `${ROLE_LABEL[card.decided_role ?? "risk_officer"]} imzaladı`
              : status === "rejected"
                ? `${ROLE_LABEL[card.decided_role ?? "risk_officer"]} reddetti`
                : "Risk Sorumlusu imzalar"
          }
          meta={
            signed
              ? `${signer.name} · ${card.decided_at ? fmtTime(card.decided_at) : "—"} · imza 2/2`
              : closed
                ? "imza gerekmedi"
                : `${signer.name} bekleniyor · imza 2/2`
          }
          done={signed}
          stamped={signed}
          rejected={status === "rejected"}
        />
      </ol>
      <p className="max-w-[600px] text-[15px] leading-[23px] text-ink-soft">
        Öneriyi tayfa yazar, kurallar denetler; son imzayı bir insan atar. Bir kişi hem önerip hem onaylayamaz — bu yüzden iki imza var.
      </p>
    </section>
  );
}

function Arrow() {
  return (
    <li aria-hidden className="hidden items-center text-[15px] text-muted sm:flex">
      →
    </li>
  );
}

function Stamp({
  n,
  title,
  meta,
  done,
  stamped = false,
  rejected = false,
  testId,
}: {
  n: string;
  title: string;
  meta: string;
  done: boolean;
  stamped?: boolean;
  rejected?: boolean;
  testId?: string;
}) {
  return (
    <li
      data-testid={testId}
      className={cn(
        "relative flex min-w-0 items-start gap-3 border-[1.5px] px-3.5 py-3",
        done ? "border-ink bg-panel" : "border-dashed border-rule-soft bg-transparent",
        stamped && "shadow-ink animate-stamp-in",
        rejected && "border-north",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-[1px] grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-[12px] font-medium tabular-nums",
          done ? (rejected ? "border-north bg-north text-on-dark" : "border-ink bg-ink text-on-dark") : "border-wash text-wash",
        )}
      >
        {done ? (rejected ? "×" : "✓") : n}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[15px] leading-[20px] font-medium", rejected ? "text-north" : "text-ink")}>{title}</span>
        <span className="mt-0.5 block text-[13px] leading-[18px] text-muted">{meta}</span>
      </span>
    </li>
  );
}
