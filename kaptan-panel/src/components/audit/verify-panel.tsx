"use client";

import { useEffect, useRef } from "react";
import type { AuditEntry } from "@/lib/domain";
import { auditSentence } from "@/lib/audit-words";
import { fmtInt, fmtTime, shortHash } from "@/lib/format";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Num } from "@/components/story/num";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import type { Walk } from "./chain-walk";
import { WalkRuler } from "./walk-ruler";

/**
 * The one big action of Denetim: "Defteri doğrula". A sentence on how the chain works, then
 * the walk itself — a finger running down a ruler of the ledger while the count runs — and
 * the verdict in plain words. Screen readers hear the walk through one always-present status line; the drawn
 * verdict is for the eyes only, so nothing is read twice.
 */
export function VerifyPanel({ walk, onVerify, onShow, tamperOn }: { walk: Walk; onVerify: () => void; onShow: (pos: number) => void; tamperOn: boolean }) {
  const { can } = useRole();
  const allowed = can("audit.verify");
  const walking = walk.phase === "walking";
  return (
    <section aria-labelledby="dogrula" className="space-y-5 border-2 border-ink bg-panel px-5 py-6 sm:px-7">
      <div className="space-y-2">
        <h2 id="dogrula" className="font-display-text text-title text-ink">
          Defter sağlam mı?
        </h2>
        <p className="max-w-[580px] text-body text-ink-soft">
          Her kayıt bir öncekinin parmak izini taşır. Biri eski bir kaydı değiştirirse zincir tam orada kopar. Bas, baştan sona birlikte sayalım.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button variant="primary" size="lg" className="px-7" locked={!allowed} pending={walking} disabled={!allowed || walking} onClick={onVerify}>
          {walking ? "Yürüyor…" : "Defteri doğrula"}
        </Button>
        {tamperOn ? <span className="text-dense text-muted">Kurcalama testi açık (Ayarlar)</span> : null}
      </div>
      <Denied action="audit.verify" />
      <p role="status" aria-live="polite" className="sr-only">
        {spoken(walk)}
      </p>
      <WalkResult walk={walk} onShow={onShow} />
    </section>
  );
}

/** What the status line says: the walk starting, then the verdict in one sentence. */
function spoken(walk: Walk): string {
  if (walk.phase === "walking") return "Zincir yürüyor…";
  if (walk.phase !== "done") return "";
  return walk.result.ok
    ? `${fmtInt(walk.result.checked)} kaydın hiçbiri değişmemiş. Zincir sağlam.`
    : `Kayıt #${fmtInt(walk.result.first_bad_pos ?? 0)}’de zincir kırık.`;
}

function WalkResult({ walk, onShow }: { walk: Walk; onShow: (pos: number) => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const done = walk.phase === "done";
  // On a phone the verdict lands below the fold: bring it into view once the walk ends.
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
  return (
    <div ref={box} className="scroll-mb-6 space-y-4 border-t-2 border-ink pt-5" data-testid="walk-result">
      <WalkRuler checked={checked} total={walk.total} badPos={badPos} />
      <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
        <span className={cn("text-title leading-none font-normal tracking-[-0.02em]", badPos !== null ? "text-north" : "text-ink")}>{fmtInt(checked)}</span>{" "}
        <span className="text-dense text-muted">/ {fmtInt(walk.total)} kayıt yürüdü</span>
      </p>
      {/* The verdict's place is kept while the walk runs, so nothing jumps when it lands. */}
      <div aria-hidden className="min-h-[72px] space-y-2">
        {walk.phase === "done" ? <Verdict walk={walk} badPos={badPos} /> : <p className="font-display-text text-[22px] leading-[30px] text-ink-soft">Her halka bir öncekiyle karşılaştırılıyor…</p>}
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
      <>
        <p className="animate-ink-in font-display-text text-title text-ink">Zincir sağlam.</p>
        <p className="animate-fade-in text-ui text-ink-soft [animation-delay:200ms]">
          {fmtInt(walk.result.checked)} kaydın hiçbiri sonradan değişmemiş. Son halkanın parmak izi <span className="code">{shortHash(walk.result.head_hash, 6, 4)}</span>.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="animate-ink-in font-display-text text-title text-north">
        Kayıt <Num>#{fmtInt(badPos ?? 0)}</Num>’de zincir kırık.
      </p>
      <div className="animate-fade-in space-y-2 [animation-delay:200ms]">
        {walk.bad ? <BrokenRecord entry={walk.bad} /> : null}
        <p className="text-ui text-ink-soft">Bu kaydın şimdiki parmak izi zincirdekiyle tutmuyor.</p>
      </div>
    </>
  );
}

function BrokenRecord({ entry }: { entry: AuditEntry }) {
  return (
    <p className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-l-[3px] border-north py-1 pl-3 text-ui">
      <time dateTime={entry.occurred_at} className="text-ink tabular-nums">
        {fmtTime(entry.occurred_at)}
      </time>
      <span className="min-w-0 text-ink">
        {auditSentence(entry)} <span className="code text-meta text-north">{shortHash(entry.hash, 8, 4)}</span>
      </span>
    </p>
  );
}
