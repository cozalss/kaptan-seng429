"use client";

import { useEffect, useRef } from "react";
import type { AuditEntry } from "@/lib/domain";
import { auditSentence } from "@/lib/audit-words";
import { fmtDateTime, fmtInt, fmtTime } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/utils";
import { Band } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import type { Walk } from "./chain-walk";

/**
 * "Kayıtlar sağlam mı?": one band, one button. Idle it says what the button does; while it runs,
 * a count walks the chain from the first record; at the end either the seal lands on an unbroken
 * chain or the chain snaps at the very record that was changed, and the words say what that means.
 */
export function VerifyBand({ walk, onVerify, onShow }: { walk: Walk; onVerify: () => void; onShow: (pos: number) => void }) {
  const walking = walk.phase === "walking";
  const box = useRef<HTMLDivElement | null>(null);
  const done = walk.phase === "done";
  // On a phone the verdict may land below the fold: bring it into view once the check ends.
  useEffect(() => {
    if (done && typeof box.current?.scrollIntoView === "function") box.current.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [done]);
  return (
    <Band aria-label="Kayıt kontrolü" className="gc-verify" data-testid={walk.phase === "walking" || walk.phase === "done" ? "walk-result" : undefined} data-state={walk.phase === "done" ? (walk.result.ok ? "ok" : "bad") : walk.phase}>
      <div className="gc-verify-top">
        <div className="min-w-0">
          {walk.phase === "idle" ? (
            <p className="gc-verify-idle">Her kayıt bir öncekine mühürlü yazılır. Biri sonradan değişirse mühür tutmaz. Baştan sona bakmamı ister misin?</p>
          ) : null}
          {walk.phase === "error" ? (
            <p role="alert" className="gc-verify-idle text-north">
              {walk.message} Yeniden deneyebilirsin.
            </p>
          ) : null}
          {walk.phase === "walking" || walk.phase === "done" ? <Count walk={walk} /> : null}
        </div>
        <Button variant={done ? "secondary" : "primary"} size="lg" pending={walking} disabled={walking} onClick={onVerify} className="gc-verify-btn">
          {walking ? "Bakıyorum…" : "Kayıtlar sağlam mı?"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {spoken(walk)}
      </p>
      {walk.phase === "walking" || walk.phase === "done" ? (
        <div ref={box} className="gc-walk scroll-mb-6">
          <Chain walk={walk} />
          {walk.phase === "done" ? <Verdict walk={walk} onShow={onShow} /> : null}
        </div>
      ) : null}
    </Band>
  );
}

/** What the status line says: the check starting, then the verdict in one sentence. */
function spoken(walk: Walk): string {
  if (walk.phase === "walking") return "Kayıtlara bakılıyor…";
  if (walk.phase !== "done") return "";
  return walk.result.ok ? `${fmtInt(walk.result.checked)} kaydın hiçbiri değişmemiş. Kayıtlar sağlam.` : `Kayıt ${fmtInt(walk.result.first_bad_pos ?? 0)}’de bozulma var.`;
}

const checkedOf = (walk: Extract<Walk, { phase: "walking" | "done" }>) => (walk.phase === "walking" ? walk.checked : walk.result.ok ? walk.result.checked : (walk.result.first_bad_pos ?? 0));

function Count({ walk }: { walk: Extract<Walk, { phase: "walking" | "done" }> }) {
  return (
    <p className="gc-count">
      <span className="gc-count-n">{fmtInt(checkedOf(walk))}</span>
      <span className="gc-count-of">/ {fmtInt(walk.total)} kayıt kontrol edildi</span>
    </p>
  );
}

/** The chain as one line: inked as far as it was checked, snapped in red where it broke. */
function Chain({ walk }: { walk: Extract<Walk, { phase: "walking" | "done" }> }) {
  const badPos = walk.phase === "done" && !walk.result.ok ? (walk.result.first_bad_pos ?? null) : null;
  const share = walk.total > 0 ? Math.min(1, checkedOf(walk) / walk.total) : 0;
  return (
    <div aria-hidden className="gc-chain-line" data-bad={badPos !== null || undefined} style={{ "--gc-at": share } as React.CSSProperties}>
      <span className="gc-chain-fill" />
      {badPos !== null ? <span className="gc-chain-snap" /> : null}
    </div>
  );
}

function Verdict({ walk, onShow }: { walk: Extract<Walk, { phase: "done" }>; onShow: (pos: number) => void }) {
  const { result } = walk;
  if (result.ok) {
    return (
      <div className="gc-verdict">
        <Seal ok />
        <div className="min-w-0">
          <p className="u-chapter gc-verdict-title">Kayıtlar sağlam.</p>
          <p className="gc-verdict-text">{fmtInt(result.checked)} kaydın hiçbiri sonradan değişmemiş. Hepsine ilk yazıldığı gibi güvenebilirsin.</p>
          <ProofDetails head={result.head_hash} at={result.verified_at} anchor={result.anchor} />
        </div>
      </div>
    );
  }
  const pos = result.first_bad_pos ?? 0;
  return (
    <div className="gc-verdict">
      <Seal ok={false} />
      <div className="min-w-0">
        <p className="u-chapter gc-verdict-title gc-verdict-bad">Kayıt {fmtInt(pos)}’de bozulma var.</p>
        <p className="gc-verdict-text">
          Bu ne demek? Bu kayıt yazıldıktan sonra biri onu değiştirmiş; zincir burada kopuyor. Ondan önceki {fmtInt(Math.max(0, pos - 1))} kayıt sağlam. Ondan sonrakilere güvenmeden önce ne olduğuna bakman gerekir.
        </p>
        {walk.bad ? <BrokenRecord entry={walk.bad} /> : null}
        <div className="mt-2">
          <Button variant="link" onClick={() => onShow(pos)}>
            Kaydı göster →
          </Button>
        </div>
        <ProofDetails head={result.head_hash} at={result.verified_at} anchor={result.anchor} />
      </div>
    </div>
  );
}

function BrokenRecord({ entry }: { entry: AuditEntry }) {
  return (
    <p className="gc-broken-record">
      <time dateTime={entry.occurred_at} className="tabular-nums">
        {fmtTime(entry.occurred_at)}
      </time>
      <span className="min-w-0">{auditSentence(entry)}</span>
    </p>
  );
}

/** The check's proof, for whoever wants it: the last fingerprint, when, and the outside anchor if any. */
function ProofDetails({ head, at, anchor }: { head: string; at: string; anchor: { at: string; chain_pos: number; hash: string } | null }) {
  return (
    <details className="gc-details">
      <summary className="gc-details-sum">Ayrıntılar</summary>
      <dl className="gc-details-list">
        <div>
          <dt>Kontrol zamanı</dt>
          <dd className="tabular-nums">{fmtDateTime(at)}</dd>
        </div>
        <div>
          <dt>Son parmak izi</dt>
          <dd className="gc-hash code">{head}</dd>
        </div>
        {anchor ? (
          <div>
            <dt>Dışarıya bırakılan iz</dt>
            <dd className="gc-hash code">
              #{fmtInt(anchor.chain_pos)}: {anchor.hash}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

/** The landing's seal: stamped whole on a sound chain, cracked across a broken one. */
function Seal({ ok }: { ok: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 96 96" className="gc-seal" data-ok={ok || undefined}>
      <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="48" cy="48" r="37" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {ok ? <path d="M30 50l12 12 24-27" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="square" /> : <path d="M34 14 54 38 40 52 62 84" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="bevel" />}
    </svg>
  );
}
