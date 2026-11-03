"use client";

import { useId, useRef, useState } from "react";
import type { ApprovalCard } from "@/lib/domain";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Disclosure } from "./disclosure";

/** A note shorter than this is a slip of the keyboard, not a note. */
const MIN_NOTE = 3;
const MAX_NOTE = 500;

/**
 * "Notlar": your notes on a proposal, in a quiet collapsed row. A note never changes the decision;
 * it is kept with the proposal and written to the ledger.
 */
export function Notes({ card }: { card: ApprovalCard }) {
  const notes = useApiQuery((api) => api.listNotes(card.proposal_id), [card.proposal_id]);
  const add = useApiMutation((api, body: string) => api.addNote(card.proposal_id, body));
  const [text, setText] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const list = notes.data ?? [];

  const submit = async () => {
    if (text.trim().length < MIN_NOTE) {
      setTooShort(true);
      field.current?.focus();
      return;
    }
    const r = await add.run(text.trim());
    if (!r) return;
    setText("");
    await notes.refetch();
  };

  return (
    <Disclosure
      id="notlar"
      title="Notlar"
      meta={list.length ? `${list.length} not · kararı değiştirmez, Geçmiş’e yazılır` : "Henüz not yok · not kararı değiştirmez"}
    >
      <div className="space-y-4">
        {list.length ? (
          <ul aria-label="Öneri notları" className="divide-y divide-hairline border-y border-hairline">
            {list.map((n) => (
              <li key={n.id} className={"grid grid-cols-[3px_minmax(0,1fr)] gap-x-4 py-3"}>
                <span aria-hidden className="bg-brand" />
                <div className="min-w-0">
                  <p className="text-[16px] leading-6 text-pretty text-ink">{n.body}</p>
                  <p className="mt-0.5 text-dense text-muted tabular-nums">
                    {fmtTime(n.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <form
            noValidate
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              <span className="sr-only">Not</span>
              <textarea
                ref={field}
                rows={2}
                maxLength={MAX_NOTE}
                value={text}
                aria-describedby={hintId}
                aria-invalid={tooShort || undefined}
                onChange={(e) => {
                  setText(e.target.value);
                  if (tooShort && e.target.value.trim().length >= MIN_NOTE) setTooShort(false);
                }}
                placeholder="Kısa bir not…"
                className="block min-h-[80px] w-full resize-y border border-rule-ui bg-panel px-3.5 py-2.5 text-[16px] leading-6 text-ink outline-none placeholder:text-muted focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <p id={hintId} role={tooShort ? "alert" : undefined} className={cn("text-dense tabular-nums", tooShort ? "text-ink" : "text-muted")}>
                {add.error ? <span className="text-north">{add.error}</span> : tooShort ? "Önce birkaç kelime yaz." : `${text.length}/${MAX_NOTE}`}
              </p>
              <Button type="submit" variant="secondary" pending={add.pending} disabled={add.pending}>
                {add.pending ? "Ekleniyor…" : "Not ekle"}
              </Button>
            </div>
          </form>
      </div>
    </Disclosure>
  );
}
