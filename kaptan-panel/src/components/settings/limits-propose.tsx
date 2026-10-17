"use client";

import { useState } from "react";
import type { LimitKey, LimitsView } from "@/lib/domain";
import { useApiMutation } from "@/lib/api/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint, Input, Textarea } from "@/components/ui/field";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";
import { CARD, CARD_PAD, Pill } from "@/components/portfolio/kit";
import { fromInput, inputUnit, limitSentence, PLAIN_LIMITS, toInput, valueOf } from "./limits-logic";

/** A reason must say something: at least this many letters (the mock and API agree). */
const MIN_REASON = 10;

/**
 * "Değişiklik öner": the Yönetici's first signature (1/2) on a limit change. The form says in
 * words what the new limit would be, counts the reason's letters and, if sent too early,
 * says what is missing instead of silently refusing. The button always looks pressable: a
 * dashed, faded one would read as "closed for your role", which it is not.
 */
export function ProposeLimit({ view, onDone }: { view: LimitsView; onDone: () => void }) {
  const { can } = useRole();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<LimitKey>("risk_per_trade_pct");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [early, setEarly] = useState(false);
  const propose = useApiMutation((api, k: LimitKey, v: number, r: string) => api.proposeLimit({ key: k, value: v, reason: r }));
  const parsed = fromInput(key, value);
  const current = valueOf(view.active.values, key);
  const letters = reason.trim().length;
  const ready = parsed !== null && letters >= MIN_REASON;

  const pick = (k: LimitKey) => {
    setKey(k);
    const cur = valueOf(view.active.values, k);
    setValue(cur === null ? "" : toInput(k, cur));
  };

  if (!open) {
    const allowed = can("limits.propose");
    return (
      <div className="space-y-2">
        <Button
          variant="secondary"
          locked={!allowed}
          disabled={!allowed}
          onClick={() => {
            propose.reset();
            pick(key);
            setReason("");
            setEarly(false);
            setOpen(true);
          }}
        >
          Değişiklik öner
        </Button>
        <Denied action="limits.propose" />
      </div>
    );
  }

  return (
    <form
      className={cn(CARD, CARD_PAD, "animate-fade-in space-y-4")}
      aria-label="Sınır değişikliği öner"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready || parsed === null) {
          setEarly(true);
          return;
        }
        const r = await propose.run(key, parsed, reason.trim());
        if (r) {
          setOpen(false);
          onDone();
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[18px] leading-7 font-semibold text-ink">Değişiklik öner</h3>
        <Pill tone="neutral">1/2 imza</Pill>
      </div>
      <p className="text-ui text-ink-soft">Risk Sorumlusu onaylayınca yürürlüğe girer.</p>
      <label className="block space-y-1.5">
        <span className="text-dense text-ink-soft">Hangi sınır?</span>
        <select value={key} onChange={(e) => pick(e.target.value as LimitKey)} className="h-11 w-full border-2 border-rule-ui bg-panel px-3 text-ui text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:h-10">
          {PLAIN_LIMITS.map((k) => (
            <option key={k} value={k}>
              {limitSentence(k, valueOf(view.active.values, k) ?? 0)}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-dense text-ink-soft">Yeni değer ({inputUnit(key)})</span>
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[180px] tabular-nums" />
      </label>
      {parsed !== null && current !== null && parsed !== current ? <p className="text-ui text-ink">Önerilen: {limitSentence(key, parsed)}</p> : null}
      <div className="space-y-1.5">
        <label htmlFor="sinir-neden" className="block text-dense text-ink-soft">
          Neden?
        </label>
        <Textarea id="sinir-neden" aria-describedby="sinir-ipucu" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Hint id="sinir-ipucu" className="flex justify-between gap-3">
          <span>En az {MIN_REASON} harf; denetim defterine yazılır.</span>{" "}
          <span aria-live="polite" className={cn("tabular-nums", letters >= MIN_REASON && "text-ink")}>
            {Math.min(letters, MIN_REASON)}/{MIN_REASON}
          </span>
        </Hint>
      </div>
      {early && !ready ? (
        <p role="alert" className="text-dense text-north">
          {parsed === null ? "Önce yeni değeri yaz." : `Gerekçe en az ${MIN_REASON} harf olmalı.`}
        </p>
      ) : null}
      {propose.error ? (
        <p role="alert" className="text-dense text-north">
          {propose.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" pending={propose.pending} disabled={propose.pending}>
          {propose.pending ? "Kaydediliyor…" : "Öner (1/2)"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
