"use client";

import type { Ref } from "react";
import type { RiskStatus, Signature } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain/user";
import { actorName } from "@/lib/actors";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { STOPPED_EFFECTS, type Ask } from "./stop-copy";

/**
 * The desk while it is stopped, read top to bottom by a newcomer: what happened (who, when,
 * why), what is true now, then the restart as two stamps in order. The Yönetici signs first,
 * the Risk Sorumlusu second; one person can never open it again. `justChanged` is the step
 * just taken here: only that step's ink is set down with motion.
 */
export function Stopped({
  risk,
  onStart,
  onConfirm,
  justChanged,
  statusRef,
}: {
  risk: RiskStatus;
  onStart: () => void;
  onConfirm: () => void;
  justChanged: Ask | null;
  statusRef: Ref<HTMLDivElement>;
}) {
  const { can } = useRole();
  const started = risk.reset?.started ?? null;
  const meta = [actorName(risk.kill_by), risk.kill_at ? fmtTime(risk.kill_at) : null].filter((part): part is string => part !== null).join(" · ");
  return (
    <div className="space-y-10" data-testid="stop-state">
      <div className="space-y-5">
        <div ref={statusRef} role="status" tabIndex={-1} className="space-y-3 outline-none">
          <p className={cn("font-display text-display leading-none text-north sm:text-display-lg", justChanged === "stop" && "animate-ink-in")}>Durduruldu.</p>
          <p className="text-ui text-ink-soft tabular-nums">
            <span className="text-ink">{meta}</span>
            {risk.kill_reason ? <span className="block text-muted sm:inline"> — “{risk.kill_reason}”</span> : null}
          </p>
          <p className="sr-only">
            {started ? "Birinci imza atıldı; şimdi Risk Sorumlusunun onayı bekleniyor." : "Yeniden açmak için önce Yönetici imzalar."}
          </p>
        </div>
        <ul aria-label="Şu an" className="space-y-2 border-l-[3px] border-north py-0.5 pl-4 text-ui text-ink">
          {STOPPED_EFFECTS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <p className="max-w-[560px] text-body text-ink-soft">
          Yeniden başlatmak iki kişi ister: Yönetici başlatır, Risk Sorumlusu onaylar. Tek kişi sistemi geri açamaz.
        </p>
        <ol aria-label="Yeniden başlatma imzaları" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] sm:items-stretch sm:gap-0">
          <ResetStamp n={1} role="Yönetici başlatır" tone="admin" sig={started} waiting={started === null} fresh={justChanged === "start"} />
          <li aria-hidden className="hidden items-center justify-center text-rule-ui sm:flex">
            →
          </li>
          <ResetStamp n={2} role="Risk Sorumlusu onaylar" tone="risk_officer" sig={null} waiting={started !== null} fresh={false} />
        </ol>
      </div>

      {started === null ? (
        <div className="space-y-2.5">
          <Button variant="secondary" size="lg" disabled={!can("kill.reset_start")} locked={!can("kill.reset_start")} onClick={onStart}>
            Yeniden başlatmayı başlat
          </Button>
          <Denied action="kill.reset_start" />
        </div>
      ) : (
        <div className="space-y-2.5">
          <Button variant="primary" size="lg" disabled={!can("kill.reset_confirm")} locked={!can("kill.reset_confirm")} onClick={onConfirm}>
            Onayla ve yeniden başlat
          </Button>
          <Denied action="kill.reset_confirm" />
        </div>
      )}
    </div>
  );
}

/**
 * One restart signature. Signed: a stamp set on the page (ink border, hard shadow) with a seal
 * in the signer's role ink. Its turn: a ruled blank in the expected role's ink, a line to sign
 * on. Not yet its turn: the same blank, quieter. Solid rules only: a blank is not "disabled".
 */
function ResetStamp({
  n,
  role,
  tone,
  sig,
  waiting,
  fresh,
}: {
  n: number;
  role: string;
  tone: "admin" | "risk_officer";
  sig: Signature | null;
  waiting: boolean;
  fresh: boolean;
}) {
  return (
    <li
      data-testid={`reset-stamp-${n}`}
      className={cn(
        "flex min-h-[104px] items-start gap-3 border-[1.5px] px-4 py-3.5",
        sig ? "border-ink bg-panel shadow-ink" : waiting ? `tone-${tone} border-[var(--tone)] bg-[var(--tone-wash)]` : "border-hairline",
        sig && fresh && "animate-stamp-in",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-[1px] grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] text-dense font-medium tabular-nums",
          sig ? `tone-${sig.role} border-[var(--tone)] bg-[var(--tone)] text-on-dark` : waiting ? "border-[var(--tone)] text-[var(--tone)]" : "border-rule-soft text-muted",
        )}
      >
        {sig ? "✓" : n}
      </span>
      <span className="min-w-0 flex-1">
        {/* The ✓ seal is drawn, not read: say it in words. Unsigned stamps say it visibly. */}
        {sig ? <span className="sr-only">İmzalandı: </span> : null}
        <span className={cn("block text-ui font-medium", sig || waiting ? "text-ink" : "text-ink-soft")}>
          {role} <span className="font-normal text-muted tabular-nums">· {n}/2</span>
        </span>
        {sig ? (
          <>
            <span className="mt-0.5 block text-dense text-ink-soft tabular-nums">
              {sig.name} · {ROLE_LABEL[sig.role]} · {fmtTime(sig.at)}
            </span>
            {sig.reason ? <span className="mt-1 block text-dense text-muted">“{sig.reason}”</span> : null}
          </>
        ) : (
          <span className="mt-3 block border-t border-rule-soft pt-1 text-dense text-muted">
            {waiting ? "imza bekleniyor" : "henüz sırası gelmedi"}
          </span>
        )}
      </span>
    </li>
  );
}
