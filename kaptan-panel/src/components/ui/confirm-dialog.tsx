"use client";

import { IS_MOCK } from "@/lib/api/config";
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent } from "./overlay";
import { Button } from "./button";
import { Field, Input, RequiredComment, validateComment } from "./field";

/**
 * Type-to-confirm dialog for irreversible or high-stakes actions (kill switch, reset).
 * The confirm button stays disabled until the phrase is typed exactly; an optional
 * required comment and 6-digit step-up code (09 §6 TOTP; any 6 digits in mock) can be asked.
 */
export interface ConfirmResult {
  comment: string;
  totp: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  phrase,
  confirmLabel,
  tone = "critical",
  requireComment = false,
  commentLabel = "Gerekçe",
  requireTotp = false,
  totpHint,
  pending = false,
  error,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** The exact text to type (e.g. "DURDUR"). */
  phrase: string;
  confirmLabel: string;
  tone?: "critical" | "default";
  requireComment?: boolean;
  commentLabel?: string;
  requireTotp?: boolean;
  totpHint?: ReactNode;
  pending?: boolean;
  error?: string | null;
  onConfirm: (r: ConfirmResult) => void;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const [comment, setComment] = useState("");
  const [totp, setTotp] = useState("");
  const [touched, setTouched] = useState(false);

  const phraseOk = typed.trim().toLocaleUpperCase("tr-TR") === phrase.toLocaleUpperCase("tr-TR");
  const commentErr = requireComment ? validateComment(comment, 5) : null;
  const totpOk = !requireTotp || /^\d{6}$/.test(totp);
  const canConfirm = phraseOk && !commentErr && totpOk && !pending;

  const close = (next: boolean) => {
    if (!next) {
      setTyped("");
      setComment("");
      setTotp("");
      setTouched(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={title} description={description} tone={tone === "critical" ? "critical" : "default"}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (canConfirm) onConfirm({ comment: comment.trim(), totp });
          }}
        >
          {children}
          {requireComment ? (
            <RequiredComment value={comment} onChange={setComment} label={commentLabel} error={touched ? commentErr : null} />
          ) : null}
          {requireTotp ? (
            <Field label="Doğrulama kodu (TOTP)" hint={totpHint ?? (IS_MOCK ? "Demo: herhangi 6 hane kabul edilir (ör. 000000)." : "Son 5 dakika içinde doğrulama gerekir.")} required>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
                  className="w-40 font-mono tracking-[0.3em]"
                />
              )}
            </Field>
          ) : null}
          <Field label={<>Onaylamak için <span className="code font-semibold">{phrase}</span> yazın</>} required>
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            )}
          </Field>
          {error ? (
            <p role="alert" className="border-l-[3px] border-north bg-north-tint px-3 py-2 text-dense text-north">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => close(false)}>
              Vazgeç
            </Button>
            <Button type="submit" variant={tone === "critical" ? "danger" : "primary"} disabled={!canConfirm} aria-disabled={!canConfirm}>
              {pending ? "İşleniyor…" : confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
