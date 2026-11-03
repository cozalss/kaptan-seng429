"use client";

import { useState } from "react";
import type { LimitKey, LimitsView } from "@/lib/domain";
import { useApiMutation } from "@/lib/api/react";
import { cn } from "@/lib/utils";
import { useDesk } from "@/components/shell/desk-state";
import { Button } from "@/components/ui/button";
import { Hint, Input, Textarea } from "@/components/ui/field";
import { fromInput, inputUnit, limitForYou, limitSentence, limitTitle, toInput, valueOf } from "./limits-logic";

/** A reason must say something: at least this many letters (the mock and API agree). */
const MIN_REASON = 10;

/**
 * Changing one limit: the form says in words what the new limit would mean for you, counts the
 * reason's letters and, if sent too early, says what is missing instead of silently refusing.
 * Behind the button the API still records two steps (propose, approve), which Geçmiş shows.
 */
export function ChangeLimit({ limit, view, onDone }: { limit: LimitKey; view: LimitsView; onDone: () => void }) {
  const { risk } = useDesk();
  const current = valueOf(view.active.values, limit);
  const [value, setValue] = useState(current === null ? "" : toInput(limit, current));
  const [reason, setReason] = useState("");
  const [early, setEarly] = useState(false);
  const change = useApiMutation(async (api, k: LimitKey, v: number, r: string) => {
    const proposed = await api.proposeLimit({ key: k, value: v, reason: r });
    return proposed.pending ? api.decideLimit(proposed.pending.version, { decision: "approve", comment: "" }) : proposed;
  });
  const parsed = fromInput(limit, value);
  const letters = reason.trim().length;
  const ready = parsed !== null && letters >= MIN_REASON;
  const changed = parsed !== null && current !== null && parsed !== current;
  const forYou = changed && parsed !== null ? limitForYou(limit, parsed, risk) : null;

  return (
    <form
      className="ay-form"
      aria-label="Sınırı değiştir"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || parsed === null) {
          setEarly(true);
          return;
        }
        const r = await change.run(limit, parsed, reason.trim());
        if (r) onDone();
      }}
    >
      <p className="text-body text-ink-soft">Sınırları yalnızca daraltabilirsin: KAPtan’a daha az alan verirsin, daha çok değil. Kaydedince hemen geçerli olur.</p>
      <label className="mt-3 block space-y-1.5">
        <span className="block text-dense font-semibold text-ink">
          {limitTitle(limit)}: yeni değer ({inputUnit(limit)})
        </span>
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[180px] tabular-nums" />
      </label>
      {changed && parsed !== null ? (
        <p className="ay-form-new">
          Yeni hali: {limitSentence(limit, parsed)}
          {forYou ? ` ${forYou}` : ""}
        </p>
      ) : null}
      <div className="mt-3 space-y-1.5">
        <label htmlFor={`sinir-neden-${limit}`} className="block text-dense font-semibold text-ink">
          Neden?
        </label>
        <Textarea id={`sinir-neden-${limit}`} aria-describedby={`sinir-ipucu-${limit}`} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Hint id={`sinir-ipucu-${limit}`} className="flex justify-between gap-3">
          <span>En az {MIN_REASON} harf; Geçmiş&apos;e yazılır.</span>{" "}
          <span aria-live="polite" className={cn("tabular-nums", letters >= MIN_REASON && "text-ink")}>
            {Math.min(letters, MIN_REASON)}/{MIN_REASON}
          </span>
        </Hint>
      </div>
      {early && !ready ? (
        <p role="alert" className="mt-2 text-dense text-north">
          {parsed === null ? "Önce yeni değeri yaz." : `Neden en az ${MIN_REASON} harf olmalı.`}
        </p>
      ) : null}
      {change.error ? (
        <p role="alert" className="mt-2 text-dense text-north">
          {change.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="mt-3" pending={change.pending} disabled={change.pending}>
        {change.pending ? "Kaydediliyor…" : "Kaydet"}
      </Button>
    </form>
  );
}
