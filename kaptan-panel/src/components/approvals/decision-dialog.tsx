"use client";

import { useState } from "react";
import type { ApprovalCard } from "@/lib/domain";
import { IS_MOCK } from "@/lib/api/config";
import { fmtInt, fmtPrice, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, RequiredComment } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import {
  DECISION_COPY,
  draftErrors,
  hasErrors,
  lotsFor,
  parseTryAmount,
  shrinkPresets,
  type DecisionDraft,
  type DecisionKind,
} from "./approvals-logic";

/**
 * The decision sheet (FRONTEND-SPEC §2.3, 05 ApprovalDecision): Onayla · Küçült · Reddet,
 * a required written reason (≤ 500, audit log) and the step-up code (09 §6; any 6 digits in
 * mock). "Küçült" approves a smaller amount — it can never grow the order (FR-24, §9 Ç-9).
 */
export function DecisionDialog({
  card,
  kind,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  card: ApprovalCard;
  kind: DecisionKind | null;
  onClose: () => void;
  onSubmit: (draft: DecisionDraft) => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={(o) => (!o && !pending ? onClose() : undefined)}>
      {kind ? (
        <DialogContent
          title={`${DECISION_COPY[kind].title} · ${card.ticker}`}
          description={`${card.company_name} — ${card.headline_tr}`}
          tone={kind === "reject" ? "critical" : "default"}
          size="md"
        >
          <DecisionForm key={`${card.proposal_id}-${kind}`} card={card} kind={kind} onClose={onClose} onSubmit={onSubmit} pending={pending} error={error} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function DecisionForm({
  card,
  kind,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  card: ApprovalCard;
  kind: DecisionKind;
  onClose: () => void;
  onSubmit: (draft: DecisionDraft) => void;
  pending: boolean;
  error: string | null;
}) {
  const presets = shrinkPresets(card.final_notional_try, card.limit_price);
  const [draft, setDraft] = useState<DecisionDraft>({ kind, comment: "", totp: "", amount: kind === "shrink" && presets[1] ? String(presets[1].amount) : "" });
  const [touched, setTouched] = useState(false);
  const errors = draftErrors(draft, card);
  const shown = touched ? errors : { comment: null, totp: null, amount: null };
  const amount = kind === "shrink" ? parseTryAmount(draft.amount) : null;
  const lots = kind === "shrink" ? lotsFor(amount ?? 0, card.limit_price) : card.qty;
  const notional = kind === "shrink" ? Math.round(lots * card.limit_price) : card.final_notional_try;
  const copy = DECISION_COPY[kind];

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!hasErrors(errors) && !pending) onSubmit(draft);
      }}
    >
      <div className={cn("border-l-[3px] px-3 py-2 text-ui", kind === "reject" ? "border-north bg-north-tint" : "border-ink bg-sunk")}>
        {kind === "reject" ? (
          <p>
            <b className="font-medium">{card.ticker}</b> önerisi <b className="font-medium text-north">reddediliyor</b>. Emir yazılmaz; graf NO_TRADE ile kapanır.
          </p>
        ) : (
          <p className="tabular-nums">
            <b className="font-medium">{card.ticker}</b> · AL · {fmtInt(lots)} lot × {fmtPrice(card.limit_price)} ={" "}
            <b className="font-medium">{fmtTry(notional)}</b> {copy.verb}.
            <span className="mt-0.5 block text-meta text-muted">Risk sonrası tutar {fmtTry(card.final_notional_try)} · SimBIST paper (sanal para) · otomatik yürütme yok</span>
          </p>
        )}
      </div>

      {kind === "shrink" ? (
        <Field
          label="Onaylanacak tutar (TL)"
          required
          error={shown.amount}
          hint={`Risk sonrası ${fmtTry(card.final_notional_try)}'den az olmalı · ${amount && amount > 0 ? `${fmtInt(lots)} lot` : "lot sayısı tutardan hesaplanır"}`}
        >
          {({ id, describedBy, invalid }) => (
            <div className="space-y-2">
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                className="w-48 tabular-nums"
              />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hazır küçültme oranları">
                {presets.map((p) => (
                  <button
                    key={p.factor}
                    type="button"
                    onClick={() => setDraft({ ...draft, amount: String(p.amount) })}
                    aria-pressed={amount === p.amount}
                    className={cn(
                      "h-8 border px-2 text-dense tabular-nums",
                      amount === p.amount ? "border-ink bg-ink text-on-dark" : "border-rule-soft bg-panel text-ink hover:border-ink",
                    )}
                  >
                    ×{String(p.factor).replace(".", ",")} · {fmtTry(p.amount)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>
      ) : null}

      <RequiredComment
        value={draft.comment}
        onChange={(v) => setDraft({ ...draft, comment: v })}
        label="Karar gerekçesi"
        error={shown.comment}
        autoFocus={kind !== "shrink"}
      />

      <Field
        label="Doğrulama kodu (TOTP)"
        required
        error={shown.totp}
        hint={IS_MOCK ? "Adım-yukarı doğrulama · demo: herhangi 6 hane (ör. 000000)" : "Adım-yukarı doğrulama: son 5 dakika içinde kod gerekir."}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={draft.totp}
            onChange={(e) => setDraft({ ...draft, totp: e.target.value.replace(/\D/g, "") })}
            className="w-40 font-mono tracking-[0.3em]"
          />
        )}
      </Field>

      {error ? (
        <p role="alert" className="border-l-[3px] border-north bg-north-tint px-3 py-2 text-dense text-north">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-3">
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Vazgeç
        </Button>
        <Button type="submit" size="lg" variant={kind === "reject" ? "danger" : "primary"} disabled={pending}>
          {pending ? "Gönderiliyor…" : copy.submit}
        </Button>
      </div>
    </form>
  );
}
