"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full border-[1.5px] border-ink bg-panel px-3 text-ui text-ink placeholder:text-muted " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:bg-sunk disabled:text-muted aria-[invalid=true]:border-north";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(control, "min-h-[88px] resize-y py-2 leading-5", className)} {...props} />;
});

/**
 * Field: label, control, hint and error wired together (ids, aria-describedby,
 * aria-invalid). Pass a render function to get the ids for the control.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline gap-1 text-dense font-medium text-ink">
        {label}
        {required ? (
          <span className="text-meta font-normal text-muted" aria-hidden>
            · zorunlu
          </span>
        ) : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error ? (
        <p id={hintId} className="text-meta text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="text-meta font-medium text-north">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const COMMENT_MIN = 1;
export const COMMENT_MAX = 500;

/** Validation for the required-comment pattern (approve/shrink/reject, limits, reset). */
export function validateComment(value: string, min = COMMENT_MIN, max = COMMENT_MAX): string | null {
  const len = value.trim().length;
  if (len < min) return min <= 1 ? "Yorum zorunludur." : `Yorum en az ${min} karakter olmalı.`;
  if (len > max) return `En çok ${max} karakter.`;
  return null;
}

/**
 * Required comment: a textarea with a live counter. Every decision that changes money or
 * limits carries a written reason that goes to the audit log (05 ApprovalDecision ≤ 500).
 */
export function RequiredComment({
  value,
  onChange,
  error,
  label = "Gerekçe",
  hint = "Audit kaydına yazılır. Kişisel veri yazmayın.",
  max = COMMENT_MAX,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  label?: ReactNode;
  hint?: ReactNode;
  max?: number;
  autoFocus?: boolean;
}) {
  const len = value.length;
  return (
    <Field label={label} hint={hint} error={error} required>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            aria-required
            maxLength={max + 50}
            autoFocus={autoFocus}
          />
          <span className={cn("pointer-events-none absolute right-2 bottom-1.5 text-meta tabular-nums", len > max ? "text-north" : "text-muted")}>
            {len}/{max}
          </span>
        </div>
      )}
    </Field>
  );
}
