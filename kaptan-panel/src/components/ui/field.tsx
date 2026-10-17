"use client";

import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full border-2 border-ink bg-panel px-3 text-ui text-ink placeholder:text-muted " +
  "transition-[border-color,box-shadow] duration-[var(--dur-quick)] focus-visible:outline-none focus-visible:border-brand focus-visible:shadow-[3px_3px_0_var(--brand)] " +
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
 * A field's hint, outside its <label>: give it an id and point the control at it with
 * aria-describedby, so the label stays short and the hint is still read out.
 */
export function Hint({ id, className, ...props }: HTMLAttributes<HTMLParagraphElement> & { id: string }) {
  return <p id={id} className={cn("text-dense text-ink-soft", className)} {...props} />;
}
