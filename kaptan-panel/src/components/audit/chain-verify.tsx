"use client";

import { useEffect, useRef } from "react";
import type { AuditStatus, ChainVerifyResult } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { fmtDateTime, fmtInt, shortHash } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tooltip } from "@/components/ui/overlay";
import { HashChip } from "@/components/ui/data";
import { cellOf, FAILURE_LABEL } from "./audit-logic";
import type { WalkState } from "./use-chain-walk";

const CELLS_WIDE = 96;

type CheckKey = "order" | "link" | "content" | "anchor";
const CHECKS: ReadonlyArray<{ key: CheckKey; title: string; detail: string }> = [
  { key: "order", title: "Sıra", detail: "chain_pos boşluksuz, tekrar yok" },
  { key: "link", title: "Bağ", detail: "prev_hash = önceki kaydın hash'i" },
  { key: "content", title: "İçerik", detail: "sha256 yeniden hesaplanınca tutuyor" },
  { key: "anchor", title: "Dış çapa", detail: "imzalı gece çapası ile aynı" },
];

function failedCheck(kind: ChainVerifyResult["kind"]): CheckKey | null {
  if (kind === "gap_or_duplicate") return "order";
  if (kind === "prev_hash_mismatch") return "link";
  if (kind === "hash_mismatch" || kind === "fields_changed_canonical_stale") return "content";
  if (kind === "anchor_mismatch") return "anchor";
  return null;
}

function Checks({ walk }: { walk: WalkState }) {
  const result = walk.phase === "done" ? walk.result : null;
  const failed = result && !result.ok ? failedCheck(result.kind) : null;
  return (
    <ul aria-label="Denetlenen kurallar" className="grid grid-cols-2 border-[1.5px] border-ink bg-paper md:grid-cols-4">
      {CHECKS.map((c, i) => {
        const failedAt = failed ? CHECKS.findIndex((x) => x.key === failed) : -1;
        const state =
          walk.phase === "walking" ? "run" : result ? (failed === c.key ? "fail" : failed && i > failedAt ? "na" : "ok") : "idle";
        return (
          <li
            key={c.key}
            className={cn(
              "flex gap-2.5 px-3 py-2.5",
              i % 2 === 1 && "border-l border-hairline",
              i >= 2 && "border-t border-hairline md:border-t-0",
              i === 2 && "md:border-l",
              state === "fail" && "bg-north-tint",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-[18px] shrink-0 place-items-center border text-[12px] leading-none",
                state === "ok" && "border-ink bg-ink text-on-dark",
                state === "fail" && "border-north bg-north text-on-dark",
                state === "run" && "border-wash bg-wash-tint animate-pulse-dot",
                (state === "idle" || state === "na") && "border-rule-soft",
              )}
            >
              {state === "ok" ? "✓" : state === "fail" ? "✗" : ""}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-dense font-medium", state === "fail" ? "text-north" : "text-ink")}>
                {c.title}
                <span className="sr-only">
                  {state === "ok" ? ": geçti" : state === "fail" ? ": kırık" : state === "run" ? ": denetleniyor" : ""}
                </span>
              </span>
              <span className="block text-meta text-muted">{c.detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
const CELLS_NARROW = 48;

/** The ledger tape: one cell per ~50 entries, inked as the walk passes. */
function Tape({ total, pos, bad, cells, className }: { total: number; pos: number; bad: number | null; cells: number; className?: string }) {
  const at = pos > 0 ? cellOf(pos, total, cells) : -1;
  const badCell = bad ? cellOf(bad, total, cells) : -1;
  return (
    <div aria-hidden className={cn("grid h-9 gap-px border-[1.5px] border-ink bg-hairline p-px", className)} style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}>
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          className={cn(
            "block",
            i === badCell ? "bg-north" : i < at || (i === at && pos >= total) ? "bg-ink" : i === at ? "bg-wash" : "bg-panel",
            i === badCell && "outline-2 outline-offset-1 outline-north",
          )}
        />
      ))}
    </div>
  );
}

export function ChainVerifyPanel({
  status,
  walk,
  onVerify,
  canVerify,
  deniedReason,
  onGoTo,
  tamperControl,
}: {
  status: AuditStatus | undefined;
  walk: WalkState;
  onVerify: () => void;
  canVerify: boolean;
  deniedReason: string;
  onGoTo: (pos: number) => void;
  tamperControl?: React.ReactNode;
}) {
  const total = walk.phase === "done" ? Math.max(walk.result.checked, status?.length ?? 0) : (status?.length ?? 0);
  const pos = walk.phase === "walking" || walk.phase === "done" ? walk.pos : 0;
  const result: ChainVerifyResult | null = walk.phase === "done" ? walk.result : null;
  const broken = result && !result.ok ? result : null;
  const live = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (result) live.current?.focus({ preventScroll: true });
  }, [result]);

  const button = (
    <Button variant="primary" size="lg" onClick={onVerify} disabled={!canVerify || walk.phase === "walking"} className="w-full sm:w-auto">
      {walk.phase === "walking" ? "Doğrulanıyor…" : result ? "Yeniden doğrula" : "Zinciri doğrula"}
    </Button>
  );

  return (
    <Panel raised tone={broken ? "critical" : "panel"} aria-labelledby="verify-title" className="flex flex-col">
      <header className="flex flex-wrap items-start gap-3 border-b border-hairline px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 id="verify-title" className="text-[15px] font-medium leading-5 text-ink">
            Zincir doğrulama
          </h2>
          <p className="mt-0.5 text-meta text-muted">
            Her kayıt için <span className="code">sha256(prev_hash ‖ canonical)</span> yeniden hesaplanır; bağ, sıra ve dış çapa denetlenir. Yan etkisizdir.
          </p>
        </div>
        {tamperControl}
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div
          role="progressbar"
          aria-label="Doğrulanan kayıt"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, total)}
          aria-valuenow={pos}
          aria-valuetext={`${fmtInt(pos)} / ${fmtInt(total)} kayıt`}
        >
          <Tape total={Math.max(1, total)} pos={pos} bad={broken?.first_bad_pos ?? null} cells={CELLS_WIDE} className="hidden sm:grid" />
          <Tape total={Math.max(1, total)} pos={pos} bad={broken?.first_bad_pos ?? null} cells={CELLS_NARROW} className="sm:hidden" />
          <div className="mt-1.5 flex justify-between text-meta text-muted tabular-nums">
            <span className="code">#1 · genesis 00</span>
            <span className="code">#{fmtInt(total)} · baş</span>
          </div>
        </div>

        <Checks walk={walk} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            {walk.phase === "idle" ? (
              <p className="text-ui text-ink-soft">
                Zincir <b className="font-medium text-ink tabular-nums">{fmtInt(total)}</b> kayıt. Doğrulama her bağı baştan sona yürür ve ilk kırık konumu bildirir.
              </p>
            ) : null}
            {walk.phase === "walking" ? (
              <p className="text-ui text-ink-soft tabular-nums" aria-hidden>
                <span className="code text-ink">#{fmtInt(pos)}</span> doğrulanıyor · {fmtInt(pos)} / {fmtInt(total)}
              </p>
            ) : null}
            {walk.phase === "error" ? (
              <p role="alert" className="border-l-[3px] border-north bg-north-tint px-3 py-2 text-dense text-north">
                Doğrulama yapılamadı: {walk.message}
              </p>
            ) : null}
            <p ref={live} tabIndex={-1} aria-live="polite" className="outline-none">
              {result?.ok ? (
                <span className="block">
                  <span className="font-display text-[clamp(24px,2.4vw,30px)] leading-tight text-ink">
                    {fmtInt(result.checked)} kayıt · hash zinciri geçerli <span aria-hidden>✓</span>
                  </span>
                  <span className="mt-1 block text-meta text-muted">
                    Baş hash <span className="code text-ink-soft">{shortHash(result.head_hash, 8, 8)}</span> · dış çapa #{fmtInt(result.anchor?.chain_pos ?? 0)} ile uyumlu · {fmtDateTime(result.verified_at)}
                  </span>
                </span>
              ) : null}
              {broken ? (
                <span className="block">
                  <span className="font-display text-[clamp(24px,2.4vw,30px)] leading-tight text-north">
                    Kayıt #{fmtInt(broken.first_bad_pos ?? 0)}&#39;de zincir kırık <span aria-hidden>✗</span>
                  </span>
                  <span className="mt-1 block text-dense text-ink-soft">
                    {broken.kind ? FAILURE_LABEL[broken.kind] : "Bilinmeyen hata"} · {fmtInt(broken.checked)} kayıt sağlam doğrulandı · {fmtDateTime(broken.verified_at)}
                  </span>
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            {broken?.first_bad_pos ? (
              <Button variant="danger-outline" onClick={() => onGoTo(broken.first_bad_pos as number)}>
                Kırık kayda git (#{fmtInt(broken.first_bad_pos)})
              </Button>
            ) : null}
            {canVerify ? (
              button
            ) : (
              <Tooltip content={deniedReason}>
                <span tabIndex={0} className="inline-flex" aria-label={`Zinciri doğrula — ${deniedReason}`}>
                  {button}
                </span>
              </Tooltip>
            )}
          </div>
        </div>
        {!canVerify ? <p className="text-meta text-muted">{deniedReason}</p> : null}
      </div>
    </Panel>
  );
}

/** Chain status card (08 §8.1 #13): length, head hash, last verification, last anchor. */
export function ChainStatusCard({ status, loading }: { status: AuditStatus | undefined; loading: boolean }) {
  return (
    <Panel aria-labelledby="chain-status-title" className="flex flex-col">
      <header className="border-b border-hairline px-4 py-3">
        <h2 id="chain-status-title" className="text-[15px] font-medium leading-5 text-ink">
          Zincir durumu
        </h2>
        <p className="mt-0.5 text-meta text-muted">Yalnızca ekleme · UPDATE/DELETE tetikleyiciyle yasak</p>
      </header>
      <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-dense">
        <div className="col-span-2">
          <dt className="text-meta text-muted">Kayıt</dt>
          <dd className="font-display pt-1 text-[40px] leading-none tracking-[-0.02em] text-ink tabular-nums">{status ? fmtInt(status.length) : "—"}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-meta text-muted">Baş hash</dt>
          <dd className="mt-1">{status ? <HashChip hash={status.head_hash} label="baş" /> : loading ? "…" : "—"}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-meta text-muted">Son doğrulama</dt>
          <dd className="mt-1 text-ink tabular-nums">{status?.last_verified_at ? fmtDateTime(status.last_verified_at) : "Bu oturumda yok · gece işi 23:30"}</dd>
        </div>
        <div className="col-span-2 border-t border-hairline pt-3">
          <dt className="text-meta text-muted">Son dış çapa</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
            {status?.anchor ? (
              <>
                <span className="code">#{fmtInt(status.anchor.chain_pos)}</span>
                <span className="tabular-nums">{fmtDateTime(status.anchor.at)}</span>
                <HashChip hash={status.anchor.hash} label="çapa" />
              </>
            ) : (
              "—"
            )}
          </dd>
          <dd className="mt-1 text-meta text-muted">İmzalı git commit · her gece ve kill switch olayında (09 §7.1)</dd>
        </div>
      </dl>
    </Panel>
  );
}
