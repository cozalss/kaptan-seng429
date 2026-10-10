"use client";

import { useEffect, useRef } from "react";
import { fmtInt, shortHash } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import type { Walk } from "./chain-walk";

/**
 * The one big action of Denetim: "Defteri doğrula". A sentence on how the hash chain works,
 * then the walk itself — a running count and a thin line — and the verdict in plain words.
 */
export function VerifyPanel({ walk, onVerify, tamperOn }: { walk: Walk; onVerify: () => void; tamperOn: boolean }) {
  const { can } = useRole();
  const walking = walk.phase === "walking";
  return (
    <section aria-labelledby="dogrula" className="space-y-5 border-[1.5px] border-ink bg-panel px-5 py-6 shadow-ink sm:px-7">
      <div className="space-y-2">
        <h2 id="dogrula" className="font-display text-[28px] leading-tight text-ink sm:text-[32px]">
          Defteri doğrula
        </h2>
        <p className="max-w-[580px] text-[16px] leading-[25px] text-ink-soft">
          Her kayıt, bir önceki kaydın özetini (hash) taşır; kayıtlar bir zincirin halkaları gibi birbirine bağlıdır. Biri eski bir kayda dokunursa o halkanın özeti tutmaz ve zincir orada kırılır.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button variant="primary" size="lg" className="h-13 px-7 text-[16px]" disabled={!can("audit.verify") || walking} onClick={onVerify}>
          {walking ? "Yürüyor…" : "Defteri doğrula"}
        </Button>
        {tamperOn ? <span className="text-[13px] text-muted">Kurcalama testi açık (Ayarlar)</span> : null}
      </div>
      <Denied action="audit.verify" />
      <WalkResult walk={walk} />
    </section>
  );
}

function WalkResult({ walk }: { walk: Walk }) {
  const box = useRef<HTMLDivElement | null>(null);
  const done = walk.phase === "done";
  // On a phone the verdict lands below the fold: bring it into view once the walk ends.
  useEffect(() => {
    if (done && typeof box.current?.scrollIntoView === "function") box.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [done]);
  if (walk.phase === "idle") return null;
  if (walk.phase === "error") {
    return (
      <p role="alert" className="text-[15px] text-north">
        {walk.message}
      </p>
    );
  }
  const checked = walk.phase === "walking" ? walk.checked : walk.result.ok ? walk.result.checked : (walk.result.first_bad_pos ?? 0);
  const ratio = walk.total > 0 ? Math.min(1, checked / walk.total) : 0;
  const broken = walk.phase === "done" && !walk.result.ok;
  return (
    <div ref={box} className="scroll-mb-6 space-y-3 border-t border-hairline pt-5" data-testid="walk-result">
      <div aria-hidden className="h-[3px] w-full bg-sunk">
        <div className={broken ? "h-full origin-left bg-north" : "h-full origin-left bg-ink"} style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <p className="text-[14px] text-muted tabular-nums">
        {fmtInt(checked)} / {fmtInt(walk.total)} kayıt yürüdü
      </p>
      <div role="status" aria-live="polite">
        {walk.phase === "done" ? (
          walk.result.ok ? (
            <div className="space-y-1">
              <p className="font-display text-[30px] leading-tight text-ink">Zincir sağlam.</p>
              <p className="text-[15px] leading-[23px] text-ink-soft">
                {fmtInt(walk.result.checked)} kaydın hiçbiri sonradan değişmemiş. Son halkanın özeti <span className="code">{shortHash(walk.result.head_hash, 6, 4)}</span>.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-display text-[30px] leading-tight text-north">
                Kayıt <span className="font-sans text-[26px] font-medium tabular-nums">#{fmtInt(walk.result.first_bad_pos ?? 0)}</span>’de zincir kırık.
              </p>
              <p className="text-[15px] leading-[23px] text-ink-soft">Bu kaydın içeriği değişmiş ama özeti eski kalmış: biri deftere sonradan dokunmuş. Ondan sonraki hiçbir kayda güvenilemez.</p>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
