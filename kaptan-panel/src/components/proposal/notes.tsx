"use client";

import { useState } from "react";
import type { ApprovalCard } from "@/lib/domain";
import { ROLE_LABEL } from "@/lib/domain/user";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { fmtTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Denied } from "@/components/roles/denied";
import { useRole } from "@/components/roles/use-role";

/**
 * Notes on a proposal — the Analist's job ("okur, not ekler"). A note never changes the
 * decision; it is kept with the proposal and written to the ledger.
 */
export function Notes({ card }: { card: ApprovalCard }) {
  const { can } = useRole();
  const notes = useApiQuery((api) => api.listNotes(card.proposal_id), [card.proposal_id]);
  const add = useApiMutation((api, body: string) => api.addNote(card.proposal_id, body));
  const [text, setText] = useState("");
  const mayNote = can("proposal.note");

  const submit = async () => {
    const r = await add.run(text.trim());
    if (!r) return;
    setText("");
    await notes.refetch();
  };

  return (
    <section aria-labelledby="notlar" className="space-y-4">
      <div className="space-y-1.5">
        <h2 id="notlar" className="text-[13px] font-medium tracking-[0.04em] text-ink uppercase">
          Notlar
        </h2>
        <p className="text-[15px] leading-[23px] text-ink-soft">Analist okur ve not düşer; not kararı değiştirmez, öneriyle birlikte saklanır.</p>
      </div>
      {notes.data?.length ? (
        <ul aria-label="Öneri notları" className="divide-y divide-hairline border-y border-hairline">
          {notes.data.map((n) => (
            <li key={n.id} className="py-3">
              <p className="text-[16px] leading-[24px] text-ink">{n.body}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {n.name} · {ROLE_LABEL[n.role]} · {fmtTime(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-muted">Henüz not yok.</p>
      )}
      {mayNote ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="block space-y-1.5">
            <span className="sr-only">Not</span>
            <Textarea rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Kısa bir not…" className="min-h-[64px]" />
          </label>
          {add.error ? (
            <p role="alert" className="text-[14px] text-north">
              {add.error}
            </p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={text.trim().length < 3 || add.pending}>
            {add.pending ? "Ekleniyor…" : "Not ekle"}
          </Button>
        </form>
      ) : (
        <Denied action="proposal.note" />
      )}
    </section>
  );
}
