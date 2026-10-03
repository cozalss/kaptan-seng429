"use client";

import Link from "next/link";
import type { AuditEntry } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { fmtDate, fmtInt, fmtTime } from "@/lib/format";
import { Dialog, DrawerContent } from "@/components/ui/overlay";
import { HashChip } from "@/components/ui/data";
import { FixtureBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionLabel, actorView, entryIntegrity, prettyPayload } from "./audit-logic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 border-b border-hairline py-2 text-dense">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

/** One ledger entry: fields, hash link, recomputed integrity, payload and canonical text. */
export function AuditEntryDrawer({
  entry,
  onOpenChange,
  onStep,
  canStep,
}: {
  entry: AuditEntry | null;
  onOpenChange: (open: boolean) => void;
  onStep: (dir: -1 | 1) => void;
  canStep: { prev: boolean; next: boolean };
}) {
  const integrity = entry ? entryIntegrity(entry) : null;
  const actor = entry ? actorView(entry.actor) : null;
  const fixture = entry ? entry.action === "demo.injected" || entry.payload.fixture === true : false;
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      {entry && integrity && actor ? (
        <DrawerContent
          width="lg"
          title={`Kayıt #${fmtInt(entry.chain_pos)}`}
          description={`${actionLabel(entry.action)} · ${fmtDate(entry.occurred_at)} ${fmtTime(entry.occurred_at, true)}`}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="code text-meta text-muted">seq {fmtInt(entry.seq)}</span>
              {fixture ? <FixtureBadge /> : null}
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" disabled={!canStep.prev} onClick={() => onStep(-1)} aria-label="Önceki kayıt (daha yeni)">
                  ‹ #{fmtInt(entry.chain_pos + 1)}
                </Button>
                <Button size="sm" variant="ghost" disabled={!canStep.next} onClick={() => onStep(1)} aria-label="Sonraki kayıt (daha eski)">
                  #{fmtInt(entry.chain_pos - 1)} ›
                </Button>
              </div>
            </div>

            <section aria-labelledby="hash-link" className={cn("border-[1.5px] p-3", integrity.hashOk ? "border-ink bg-paper" : "border-north bg-north-tint")}>
              <h3 id="hash-link" className="text-dense font-medium text-ink">
                Hash bağı
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <HashChip hash={entry.prev_hash} label="prev_hash" />
                <span aria-hidden className="text-muted">
                  ‖ canonical →
                </span>
                <HashChip hash={entry.hash} label="hash" />
              </div>
              <p className={cn("mt-2 text-dense", integrity.hashOk ? "text-ink-soft" : "font-medium text-north")}>
                {integrity.hashOk ? (
                  <>
                    Panelde yeniden hesaplandı: <span className="code">sha256(prev_hash ‖ canonical)</span> saklanan hash ile eşleşiyor <span aria-hidden>✓</span>
                  </>
                ) : (
                  <>
                    Yeniden hesaplanan hash eşleşmiyor <span aria-hidden>✗</span> — bu kayıt yazıldıktan sonra değiştirilmiş. Yeniden hesaplanan:{" "}
                    <span className="code break-all">{integrity.recomputed}</span>
                  </>
                )}
              </p>
            </section>

            <dl>
              <Row label="Aktör">
                {actor.label} <span className="code text-muted">{entry.actor}</span>
              </Row>
              <Row label="Eylem">
                {actionLabel(entry.action)} <span className="code text-muted">{entry.action}</span>
              </Row>
              <Row label="Varlık">
                <span className="code">
                  {entry.entity_type} · {entry.entity_id}
                </span>
              </Row>
              <Row label="Run">
                {entry.run_id ? (
                  <Link href={`/runs/${encodeURIComponent(entry.run_id)}`} className="code underline underline-offset-4 hover:text-wash">
                    {entry.run_id}
                  </Link>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Row>
              <Row label="Strateji">{entry.strategy_version ? <span className="code">{entry.strategy_version}</span> : <span className="text-muted">—</span>}</Row>
              <Row label="Zaman (UTC)">
                <span className="code">{entry.occurred_at}</span>
              </Row>
            </dl>

            <section aria-labelledby="payload-title">
              <h3 id="payload-title" className="mb-1.5 text-dense font-medium text-ink">
                Payload (JSON)
              </h3>
              <pre tabIndex={0} className="max-h-[260px] overflow-auto border border-rule-soft bg-sunk p-3 font-mono text-[12px] leading-[18px] text-ink">
                {prettyPayload(entry.payload)}
              </pre>
            </section>

            <details className="group border-t border-hairline pt-3">
              <summary className="cursor-pointer text-dense font-medium text-ink-soft hover:text-ink">Canonical metin (hash girdisi)</summary>
              <pre tabIndex={0} className="mt-2 max-h-[200px] overflow-auto border border-rule-soft bg-sunk p-3 font-mono text-[12px] leading-[18px] break-all whitespace-pre-wrap text-ink">
                {integrity.canonical}
              </pre>
              <p className="mt-1.5 text-meta text-muted">
                [chain_pos, occurred_at, actor, action, entity_type, entity_id, run_id, strategy_version, payload] — anahtarlar sıralı JSON dizisi (09 §7.1).
              </p>
            </details>
            <p className="text-meta text-muted">Kayıt salt okunurdur; hiçbir rol düzenleyemez ya da silemez.</p>
          </div>
        </DrawerContent>
      ) : null}
    </Dialog>
  );
}
