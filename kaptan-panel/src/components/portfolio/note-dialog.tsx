"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint, Textarea } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { NOTE_MIN, type AskCopy } from "./stop-copy";

/** A closed-looking submit that still answers a press (aria-disabled): it then says why. */
const SOFT_CLOSED =
  "aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-rule-ui aria-disabled:bg-transparent aria-disabled:text-muted aria-disabled:shadow-none aria-disabled:hover:border-rule-ui aria-disabled:hover:bg-transparent aria-disabled:active:translate-x-0 aria-disabled:active:translate-y-0";

/**
 * One reason, written down: the Durdur and restart dialogs. The submit stays pressable while
 * the reason is short and, if pressed, says what is missing instead of doing nothing.
 */
export function NoteDialog({
  open,
  onClose,
  copy,
  danger,
  busy,
  error,
  onSubmit,
  onCloseAutoFocus,
}: {
  open: boolean;
  onClose: () => void;
  copy: AskCopy;
  danger: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (note: string) => void;
  /** Where focus goes once the dialog has closed (preventDefault to choose the place). */
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const shortId = `${id}-short`;
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setNote("");
      setTried(false);
    }
  }
  const length = note.trim().length;
  const short = length < NOTE_MIN;
  const showShort = tried && short;
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent title={copy.title} description={copy.lead} size="sm" tone={danger ? "critical" : "default"} onCloseAutoFocus={onCloseAutoFocus}>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            if (short) {
              setTried(true);
              return;
            }
            onSubmit(note.trim());
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor={`${id}-note`} className="block text-dense text-ink-soft">
              {copy.label}
            </label>
            <Textarea
              id={`${id}-note`}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={showShort ? `${shortId} ${hintId}` : hintId}
              aria-invalid={showShort || undefined}
              autoFocus
            />
            <Hint id={hintId} className="flex justify-between gap-3">
              <span>En az {NOTE_MIN} harf; denetim defterine yazılır.</span>
              <span className={cn("shrink-0 tabular-nums", short ? "text-muted" : "text-ink")}>
                {Math.min(length, NOTE_MIN)}/{NOTE_MIN}
              </span>
            </Hint>
          </div>
          {showShort ? (
            <p id={shortId} role="alert" className="text-dense text-north">
              En az {NOTE_MIN} harf yazmalısın.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-dense text-north">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant={danger ? "danger" : "primary"}
              aria-disabled={short || undefined}
              pending={busy}
              disabled={busy}
              className={SOFT_CLOSED}
            >
              {busy ? "Kaydediliyor…" : copy.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
