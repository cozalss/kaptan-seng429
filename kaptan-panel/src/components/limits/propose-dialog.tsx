"use client";

import { useState } from "react";
import { LIMIT_META, type LimitKey, type LimitValue } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, RequiredComment, validateComment } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { collectChanges, formatLimit, toInputText, unitLabel } from "./limits-logic";

const REASON_MIN = 10;

/**
 * Change proposal (04 §11 POST /limits/proposals): edit any values, give a reason (≥ 10),
 * send as 1/2. Only changed rows are sent; the server re-checks everything.
 */
export function ProposeDialog({
  open,
  onOpenChange,
  active,
  activeVersion,
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  active: readonly LimitValue[];
  activeVersion: number;
  pending: boolean;
  error: string | null;
  onSubmit: (changes: LimitValue[], reason: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Partial<Record<LimitKey, string>>>({});
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const { changes, errors } = collectChanges(active, draft);
  const reasonErr = validateComment(reason, REASON_MIN);
  const changedKeys = new Set(changes.map((c) => c.key));

  const close = (o: boolean) => {
    if (!o) {
      setDraft({});
      setReason("");
      setTouched(false);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="lg" title="Limit değişikliği öner" description={`Geçerli sürüm v${activeVersion} üzerine. Gönderince 1/2 olur; farklı bir Risk Officer ya da Admin onaylayınca yürürlüğe girer.`}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setTouched(true);
            if (reasonErr || Object.keys(errors).length || changes.length === 0) return;
            if (await onSubmit(changes, reason.trim())) close(false);
          }}
        >
          <fieldset>
            <legend className="mb-2 text-dense font-medium text-ink">Değerler</legend>
            <div className="grid max-h-[46vh] gap-x-4 overflow-y-auto border-y border-hairline sm:grid-cols-2">
              {active.map((v) => {
                const err = errors[v.key];
                const changed = changedKeys.has(v.key);
                const id = `limit-${v.key}`;
                return (
                  <div key={v.key} className={cn("flex items-center gap-3 border-b border-hairline py-2", changed && "bg-wash-tint")}>
                    <label htmlFor={id} className="min-w-0 flex-1 pl-2">
                      <span className="block truncate text-dense text-ink">{LIMIT_META[v.key].label_tr}</span>
                      <span className="block text-meta text-muted">
                        <span className="code">{LIMIT_META[v.key].rule}</span> · şu an {formatLimit(v.key, v.value)}
                      </span>
                      {err ? (
                        <span id={`${id}-err`} role="alert" className="block text-meta font-medium text-north">
                          {err}
                        </span>
                      ) : null}
                    </label>
                    <div className="flex shrink-0 items-center gap-1.5 pr-2">
                      <Input
                        id={id}
                        inputMode="decimal"
                        className="h-9 w-[84px] text-right tabular-nums"
                        value={draft[v.key] ?? toInputText(v.key, v.value)}
                        onChange={(e) => setDraft((d) => ({ ...d, [v.key]: e.target.value }))}
                        aria-invalid={Boolean(err)}
                        aria-describedby={err ? `${id}-err` : undefined}
                      />
                      <span className="w-11 text-meta text-muted">{unitLabel(v.key)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>
          <p aria-live="polite" className="text-dense text-ink-soft">
            {changes.length === 0 ? "Henüz değişiklik yok." : `${changes.length} limit değişecek.`}
            {touched && changes.length === 0 ? <span className="ml-1 font-medium text-north">En az bir değer değiştirin.</span> : null}
          </p>
          <RequiredComment
            value={reason}
            onChange={setReason}
            label="Gerekçe"
            hint={`En az ${REASON_MIN} karakter. Audit kaydına ve sürüm geçmişine yazılır.`}
            error={touched ? reasonErr : null}
          />
          {error ? (
            <p role="alert" className="border-l-[3px] border-north bg-north-tint px-3 py-2 text-dense text-north">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>
              Vazgeç
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Gönderiliyor…" : "Öneriyi gönder (1/2)"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
