"use client";

import { useId, type InputHTMLAttributes, type Ref } from "react";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import "./money.css";

/** A text field the way the money forms want it: the label above, one plain line of error under it (announced). */
export function PlainField({
  label,
  error,
  hint,
  className,
  inputRef,
  ...input
}: { label: string; error: string | null; hint?: string; inputRef?: Ref<HTMLInputElement> } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "aria-invalid" | "aria-describedby">) {
  const id = useId();
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mf">
      <label htmlFor={id} className="mf-label">
        {label}
      </label>
      <Input id={id} ref={inputRef} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cn("mf-plain", className)} {...input} />
      {error ? (
        <p id={`${id}-err`} role="alert" className="mf-error">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="mf-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
