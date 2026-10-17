"use client";

import { useState } from "react";
import type { ApprovalCard, ApprovalStatus } from "@/lib/domain";
import { useApiMutation } from "@/lib/api/react";
import { useDesk } from "@/components/shell/desk-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { decideGate } from "@/components/approvals/approvals-logic";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";

/**
 * Where the second signature is given: Onayla (primary) and Reddet (secondary, with an optional
 * note in a small dialog). Only the Risk Sorumlusu signs; every other role sees both buttons
 * closed, with the one-line reason and a way to look through the Risk Sorumlusu's eyes.
 */
export function DecisionActions({ card, status, onDecided }: { card: ApprovalCard; status: ApprovalStatus; onDecided: (c: ApprovalCard) => void }) {
  const desk = useDesk();
  const { can } = useRole();
  const maySign = can("proposal.decide");
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const decide = useApiMutation((api, decision: "approve" | "reject", comment: string) =>
    api.decideApproval(card.proposal_id, { decision, approved_notional_try: null, comment }),
  );
  const gate = decideGate({ status, killSwitchOn: desk.risk?.kill_switch === "on", haltedToday: desk.risk?.halted_today ?? false });
  const approving = decide.pending && !rejecting;

  const run = async (decision: "approve" | "reject") => {
    const r = await decide.run(decision, decision === "reject" ? note.trim() : "");
    if (!r) return;
    setRejecting(false);
    onDecided(r);
    void desk.refresh();
  };

  return (
    <div className="space-y-3">
      {gate.reason ? (
        <p role="status" className="border-l-[3px] border-ink bg-sunk px-4 py-2.5 text-[16px] leading-6 text-ink">
          {gate.tone === "kill" ? "Her şey durduruldu; yeni öneri onaylanamaz." : gate.tone === "halt" ? "Bugün yeni emir yok (günlük −%1 sınırı); yalnızca reddedebilirsin." : gate.reason}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          variant="primary"
          size="lg"
          className="h-12 w-full px-10 text-[16px] sm:w-auto"
          locked={!maySign}
          pending={approving}
          disabled={!maySign || !gate.canApprove || decide.pending}
          onClick={() => void run("approve")}
        >
          {approving ? "İmzalanıyor…" : "Onayla"}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="h-12 w-full px-6 text-[16px] sm:w-auto"
          locked={!maySign}
          disabled={!maySign || !gate.canDecide || decide.pending}
          onClick={() => {
            decide.reset();
            setRejecting(true);
          }}
        >
          Reddet
        </Button>
        {maySign && gate.canApprove ? <p className="text-dense text-muted sm:ml-auto sm:text-right">Onayla, 2. imzayı senin adınla atar.</p> : null}
      </div>
      <Denied action="proposal.decide" />
      {decide.error && !rejecting ? (
        <p role="alert" className="text-ui text-north">
          {decide.error}
        </p>
      ) : null}

      <Dialog open={rejecting} onOpenChange={(o) => (!decide.pending ? setRejecting(o) : undefined)}>
        <DialogContent title="Bu öneriyi reddet" description="Emir yazılmaz; kararın kayda geçer." size="sm">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run("reject");
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-ui text-ink-soft">Kısa not (isteğe bağlı)</span>
              <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {decide.error ? (
              <p role="alert" className="text-ui text-north">
                {decide.error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Vazgeç
              </Button>
              <Button type="submit" variant="secondary" pending={decide.pending} disabled={decide.pending}>
                {decide.pending ? "Kaydediliyor…" : "Reddet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
