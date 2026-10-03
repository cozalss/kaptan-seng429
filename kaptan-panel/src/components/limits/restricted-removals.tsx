"use client";

import { useState } from "react";
import type { RestrictedSecurity } from "@/lib/domain";
import { accountName } from "@/lib/auth/accounts";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/overlay";
import { notify } from "@/components/ui/toast";
import { KIND_LABEL } from "@/components/admin/admin-logic";
import { useAction } from "@/components/admin/use-action";

/**
 * Team block list removals awaiting the Risk Officer (09 §5, 06 R13): Admin requests on
 * /admin, a Risk Officer confirms here. Adding is immediate; removing needs two people.
 */
export function RestrictedRemovals({
  entries,
  canConfirm,
  deniedReason,
  onChanged,
}: {
  entries: readonly RestrictedSecurity[];
  canConfirm: boolean;
  deniedReason: string;
  onChanged: () => void;
}) {
  const [target, setTarget] = useState<RestrictedSecurity | null>(null);
  const confirm = useAction();
  const pendingRemovals = entries.filter((e) => e.removal_requested_by);

  return (
    <Panel aria-labelledby="removals-title">
      <PanelHeader
        id="removals-title"
        code="R13"
        title="Engel listesi · bekleyen çıkarmalar"
        meta="Ekleme hemen etkili; çıkarma için Admin talebi + Risk Officer onayı (iki kişi)."
      />
      {pendingRemovals.length === 0 ? (
        <p className="px-4 py-4 text-dense text-muted">Bekleyen çıkarma talebi yok. Talebi Admin, Yönetim ekranındaki engel listesinden açar.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {pendingRemovals.map((e) => {
            const btn = (
              <Button size="sm" variant="secondary" disabled={!canConfirm} onClick={() => setTarget(e)}>
                Çıkarmayı onayla (2/2)
              </Button>
            );
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="code text-[15px] font-medium text-ink">{e.ticker}</span>
                <span className="min-w-0 flex-1 text-dense">
                  <span className="block text-ink">{KIND_LABEL[e.kind]}</span>
                  <span className="block text-meta text-muted">
                    Listede {fmtDate(e.added_at)}&#39;ten beri · çıkarma talebi: {accountName(e.removal_requested_by ?? "")} (1/2)
                  </span>
                </span>
                {canConfirm ? (
                  btn
                ) : (
                  <Tooltip content={deniedReason}>
                    <span tabIndex={0} className="inline-flex">
                      {btn}
                    </span>
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) {
            setTarget(null);
            confirm.reset();
          }
        }}
        tone="default"
        title={`${target?.ticker ?? ""} engel listesinden çıkarılsın mı?`}
        description="Çıkarma onaylanınca sembol yeniden ön elemeden geçebilir (R13). Audit'e iki kişinin kimliği yazılır."
        phrase={target?.ticker ?? ""}
        confirmLabel="Çıkarmayı onayla"
        pending={confirm.pending}
        error={confirm.error}
        onConfirm={async () => {
          if (!target) return;
          const { id, ticker } = target;
          const r = await confirm.run((api) => api.confirmRestrictedRemoval(id));
          if (!r.ok) return;
          notify.success(`${ticker} listeden çıkarıldı`, "Dört göz: talep + onay audit'e yazıldı.");
          setTarget(null);
          onChanged();
        }}
      />
    </Panel>
  );
}
