"use client";

import { useId, useRef, useState } from "react";
import type { ApprovalCard } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain/user";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";

/** A note shorter than this is a slip of the keyboard, not a note. */
const MIN_NOTE = 3;
const MAX_NOTE = 500;

/**
 * Notes on a proposal — the Analist's job ("okur, not ekler"). A note never changes the
 * decision; it is kept with the proposal and written to the ledger. Notes read like a margin
 * log (each signed in its writer's role ink); the writing space is one ruled sheet whose
 * button is always live and says what it needs if pressed too early.
 */
export function Notes({ card }: { card: ApprovalCard }) {
  const { can } = useRole();
  const notes = useApiQuery((api) => api.listNotes(card.proposal_id), [card.proposal_id]);
  const add = useApiMutation((api, body: string) => api.addNote(card.proposal_id, body));
  const [text, setText] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const mayNote = can("proposal.note");
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
    <section aria-labelledby="notlar" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h2 id="notlar" className="label">
          Notlar{list.length ? <span className="ml-2 font-normal text-muted tabular-nums">{list.length}</span> : null}
        </h2>
        <p className="text-dense text-muted">Not kararı değiştirmez; öneriyle birlikte deftere yazılır.</p>
      </div>

      {list.length ? (
        <ul aria-label="Öneri notları" className="border-t border-hairline">
          {list.map((n) => (
            <li key={n.id} className={cn("grid grid-cols-[3px_minmax(0,1fr)] gap-x-4 border-b border-hairline py-3.5", `tone-${n.role}`)}>
              <span aria-hidden className="bg-[var(--tone)]" />
              <div className="min-w-0">
                <p className="text-body text-pretty text-ink">{n.body}</p>
                <p className="mt-1 text-dense text-muted tabular-nums">
                  <span className="font-medium text-[var(--tone)]">{n.name}</span> · {ROLE_LABEL[n.role]} · {fmtTime(n.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ui text-muted">{mayNote ? "Henüz not yok. Gözüne takılan bir şey varsa buraya yaz." : "Henüz not yok."}</p>
      )}

      {mayNote ? (
        <form
          noValidate
          className="border-2 border-ink bg-panel transition-[border-color,box-shadow] duration-[var(--dur-quick)] focus-within:border-brand focus-within:shadow-[3px_3px_0_var(--brand)]"
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
              className="block min-h-[76px] w-full resize-y bg-[repeating-linear-gradient(transparent_0,transparent_25px,var(--hairline)_25px,var(--hairline)_26px)] bg-local bg-[position:0_10px] px-4 pt-2.5 pb-1 text-body leading-[26px] text-ink outline-none placeholder:text-muted"
            />
          </label>
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
            <p id={hintId} role={tooShort ? "alert" : undefined} className={cn("text-dense tabular-nums", tooShort ? "text-ink" : "text-muted")}>
              {add.error ? <span className="text-north">{add.error}</span> : tooShort ? "Önce birkaç kelime yaz." : `${text.length}/${MAX_NOTE}`}
            </p>
            <Button type="submit" variant="secondary" pending={add.pending} disabled={add.pending}>
              {add.pending ? "Ekleniyor…" : "Not ekle"}
            </Button>
          </div>
        </form>
      ) : (
        <Denied action="proposal.note" />
      )}
    </section>
  );
}
