"use client";

import { useEffect, useRef } from "react";
import type { AuditEntry } from "@/lib/domain";
import { auditSentence } from "@/lib/audit-words";
import { fmtInt, fmtTime, shortHash } from "@/lib/format";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { CARD, CARD_PAD, Pill } from "@/components/portfolio/kit";
import type { Walk } from "./chain-walk";

/**
 * "Defteri doğrula": one card, one button, a progress bar while the chain is checked and a
 * clear verdict (sağlam, or kırık at #N with the record and a way to it). Screen readers hear
 * the check through one always-present status line; the drawn verdict is for the eyes only.
 */
export function VerifyPanel({ walk, onVerify, onShow, tamperOn }: { walk: Walk; onVerify: () => void; onShow: (pos: number) => void; tamperOn: boolean }) {
  const { can } = useRole();
  const allowed = can("audit.verify");
  const walking = walk.phase === "walking";
  return (
    <section aria-labelledby="dogrula" className={cn(CARD, CARD_PAD, "space-y-4")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="space-y-1">
          <h2 id="dogrula" className="text-[18px] leading-7 font-semibold text-ink">
            Defter sağlam mı?
          </h2>
          <p className="max-w-[480px] text-ui text-ink-soft">Her kayıt bir öncekinin parmak izini taşır; sonradan değişen kayıt zinciri tam orada koparır.</p>
        </div>
        <Button variant="primary" size="lg" className="w-full sm:w-auto" locked={!allowed} pending={walking} disabled={!allowed || walking} onClick={onVerify}>
          {walking ? "Doğrulanıyor…" : "Defteri doğrula"}
        </Button>
      </div>
      {tamperOn ? <p className="text-dense text-muted">Kurcalama testi açık (Ayarlar).</p> : null}
      <Denied action="audit.verify" />
      <p role="status" aria-live="polite" className="sr-only">
        {spoken(walk)}
      </p>
      <WalkResult walk={walk} onShow={onShow} />
    </section>
  );
}

/** What the status line says: the check starting, then the verdict in one sentence. */
function spoken(walk: Walk): string {
  if (walk.phase === "walking") return "Defter doğrulanıyor…";
  if (walk.phase !== "done") return "";
  return walk.result.ok
    ? `${fmtInt(walk.result.checked)} kaydın hiçbiri değişmemiş. Zincir sağlam.`
    : `Kayıt #${fmtInt(walk.result.first_bad_pos ?? 0)}’de zincir kırık.`;
}

function WalkResult({ walk, onShow }: { walk: Walk; onShow: (pos: number) => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const done = walk.phase === "done";
  // On a phone the verdict lands below the fold: bring it into view once the check ends.
  useEffect(() => {
    if (done && typeof box.current?.scrollIntoView === "function") box.current.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [done]);
  if (walk.phase === "idle") return null;
  if (walk.phase === "error") {
    return (
      <p role="alert" className="text-ui text-north">
        {walk.message}
      </p>
    );
  }
  const checked = walk.phase === "walking" ? walk.checked : walk.result.ok ? walk.result.checked : (walk.result.first_bad_pos ?? 0);
  const badPos = walk.phase === "done" && !walk.result.ok ? (walk.result.first_bad_pos ?? null) : null;
  const share = walk.total > 0 ? Math.min(1, checked / walk.total) : 0;
  return (
    <div ref={box} className="scroll-mb-6 space-y-3 border-t-2 border-hairline pt-4" data-testid="walk-result">
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-sunk">
        <div className={cn("h-full origin-left rounded-full", badPos !== null ? "bg-north" : done ? "bg-gain" : "bg-brand")} style={{ transform: `scaleX(${share})` }} />
      </div>
      <p className="text-dense text-muted tabular-nums">
        {fmtInt(checked)} / {fmtInt(walk.total)} kayıt kontrol edildi
      </p>
      {/* The verdict's place is kept while the check runs, so nothing jumps when it lands. */}
      <div aria-hidden className="min-h-[56px]">
        {walk.phase === "done" ? <Verdict walk={walk} badPos={badPos} /> : null}
      </div>
      {badPos !== null ? (
        <Button variant="link" onClick={() => onShow(badPos)}>
          Defterde göster →
        </Button>
      ) : null}
    </div>
  );
}

function Verdict({ walk, badPos }: { walk: Extract<Walk, { phase: "done" }>; badPos: number | null }) {
  if (walk.result.ok) {
    return (
      <div className="animate-fade-in space-y-1.5">
        <p className="flex flex-wrap items-center gap-3">
          <Pill tone="gain">Sağlam</Pill>
          <span className="text-[18px] leading-7 font-semibold text-ink">Zincir sağlam.</span>
        </p>
        <p className="text-ui text-ink-soft">
          {fmtInt(walk.result.checked)} kaydın hiçbiri sonradan değişmemiş. Son parmak izi <span className="code">{shortHash(walk.result.head_hash, 6, 4)}</span>.
        </p>
      </div>
    );
  }
  return (
    <div className="animate-fade-in space-y-2">
      <p className="flex flex-wrap items-center gap-3">
        <Pill tone="north">Kırık</Pill>
        <span className="text-[18px] leading-7 font-semibold text-north tabular-nums">Kayıt #{fmtInt(badPos ?? 0)}’de zincir kırık.</span>
      </p>
      {walk.bad ? <BrokenRecord entry={walk.bad} /> : null}
      <p className="text-ui text-ink-soft">Bu kaydın şimdiki parmak izi zincirdekiyle tutmuyor.</p>
    </div>
  );
}

function BrokenRecord({ entry }: { entry: AuditEntry }) {
  return (
    <p className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-l-[3px] border-north bg-north-tint py-2 pr-3 pl-3 text-ui">
      <time dateTime={entry.occurred_at} className="text-ink tabular-nums">
        {fmtTime(entry.occurred_at)}
      </time>
      <span className="min-w-0 text-ink">{auditSentence(entry)}</span>
    </p>
  );
}
