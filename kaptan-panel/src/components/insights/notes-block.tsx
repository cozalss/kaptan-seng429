"use client";

import "@/components/ufuk/ufuk.css";
import "@/components/portfolio/own-money.css";
import "./insights.css";

import { useId, useState } from "react";
import type { HoldingNote } from "@/lib/domain/insights";
import { NOTE_MAX, NOTE_MIN } from "@/lib/domain/insights";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { Button } from "@/components/ui/button";

export interface NoteTarget {
  ticker: string;
  company: string;
}

/**
 * One share's private note ("neden aldım, ne zaman satarım"): read it, write it, change it, delete it. Kept on this
 * computer only; saving and deleting are written to Geçmiş. A note moves no money.
 */
function NoteRow({ target, note, onChanged }: { target: NoteTarget; note: HoldingNote | undefined; onChanged: () => void }) {
  const api = useApi();
  const fieldId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const editing = draft !== null;

  const run = async (job: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await job();
      setDraft(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  const save = () => {
    const text = (draft ?? "").trim();
    if (text.length < NOTE_MIN) return setError(`Notun en az ${NOTE_MIN} harf olsun.`);
    if (text.length > NOTE_MAX) return setError(`Not en çok ${NOTE_MAX} harf olabilir.`);
    void run(() => api.saveHoldingNote(target.ticker, text));
  };

  return (
    <li className="ins-note" aria-label={`${target.ticker} notu`}>
      <div>
        <strong>{target.company}</strong> <span className="ins-sub">{target.ticker}</span>
      </div>
      {editing ? (
        <>
          <label htmlFor={fieldId} className="ins-sub">
            Neden aldın, ne zaman satmayı düşünüyorsun?
          </label>
          <textarea id={fieldId} className="ins-text" value={draft} maxLength={NOTE_MAX + 50} onChange={(e) => setDraft(e.target.value)} />
          <p className="ins-sub">
            {draft.trim().length} / {NOTE_MAX}
          </p>
          <div className="ins-actions">
            <Button variant="primary" pending={pending} onClick={save}>
              Notu kaydet
            </Button>
            <Button variant="ghost" onClick={() => (setDraft(null), setError(null))}>
              Vazgeç
            </Button>
          </div>
        </>
      ) : note ? (
        <>
          <p className="ins-note-body">{note.body}</p>
          <div className="ins-actions">
            <Button variant="secondary" onClick={() => setDraft(note.body)} aria-label={`${target.ticker} notunu değiştir`}>
              Değiştir
            </Button>
            <Button variant="ghost" pending={pending} onClick={() => void run(() => api.clearHoldingNote(target.ticker))} aria-label={`${target.ticker} notunu sil`}>
              Sil
            </Button>
          </div>
        </>
      ) : (
        <div className="ins-actions">
          <Button variant="secondary" onClick={() => setDraft("")} aria-label={`${target.ticker} için not yaz`}>
            Not yaz
          </Button>
        </div>
      )}
      <p role="alert" className="ins-status ins-error">
        {error ?? ""}
      </p>
    </li>
  );
}

/** Notes per holding. Shown when the person holds something or has written a note. */
export function NotesBlock({ holdings, notes, onChanged }: { holdings: NoteTarget[]; notes: HoldingNote[] | undefined; onChanged: () => void }) {
  if (!notes) return null;
  const known = new Set(holdings.map((h) => h.ticker));
  const extra = notes.filter((n) => !known.has(n.ticker)).map((n) => ({ ticker: n.ticker, company: n.company }));
  const targets = [...holdings, ...extra];
  if (targets.length === 0) return null;

  return (
    <section aria-labelledby="notlarim" className="om">
      <div className="om-head">
        <h2 id="notlarim" className="u-chapter text-ink">
          {notes.length === 0 ? "Hisselerine kendine not yazabilirsin." : `Hisselerine ${notes.length} not yazmışsın.`}
        </h2>
        <p className="ins-lead">“Neden aldım?” ya da “Ne zaman satarım?” gibi şeyleri yaz; sonra hatırlamak kolay olur. Notlar yalnızca bu bilgisayarda durur.</p>
      </div>
      <ul className="mt-4 p-0" style={{ listStyle: "none" }} aria-label="Hisse notların">
        {targets.map((t) => (
          <NoteRow key={t.ticker} target={t} note={notes.find((n) => n.ticker === t.ticker)} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}
