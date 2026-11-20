"use client";

import { useId, useLayoutEffect, useRef, type ClipboardEvent, type ChangeEvent } from "react";
import { caretAfterFormat, formatMoneyDraft, liraInWords, moneyDraftOf, parseMoney } from "@/lib/solo/money-input";
import { cn } from "@/lib/utils";
import "./money.css";

/**
 * One amount of money, as a person writes it: the lira grouped with dots while they type
 * ("1.250"), a comma for the kuruş, "₺" beside it. A pasted "1250.5" or "1.250,50" both become the
 * same draft. The label is above the field, the error under it (announced), and once the draft is
 * a usable amount it is read out in words, so a slipped zero is seen before anything is sent.
 * The parent keeps the draft as text and parses it once, on submit (`parseMoney`).
 */
export function MoneyField({
  label,
  value,
  onChange,
  error,
  hint,
  large = false,
  maxDecimals = 2,
  readOut = true,
  autoFocus = false,
  inputRef,
  name,
}: {
  label: string;
  value: string;
  onChange: (draft: string) => void;
  /** Plain words under the field; null = fine. */
  error: string | null;
  hint?: string;
  large?: boolean;
  maxDecimals?: number;
  readOut?: boolean;
  autoFocus?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
  name?: string;
}) {
  const id = useId();
  const own = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current !== null && own.current && document.activeElement === own.current) {
      own.current.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  }, [value]);

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    // One typed dot at the end, before any comma, means "kuruş": Turkish keyboards have the comma there.
    if (raw.length === value.length + 1 && raw.endsWith(".") && !raw.includes(",")) raw = `${raw.slice(0, -1)},`;
    const next = formatMoneyDraft(raw, maxDecimals);
    caret.current = caretAfterFormat(raw, e.target.selectionStart ?? raw.length, next);
    onChange(next);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = parseMoney(e.clipboardData.getData("text"), maxDecimals);
    if (pasted === null) return;
    e.preventDefault();
    onChange(moneyDraftOf(pasted, maxDecimals));
  };

  const amount = parseMoney(value, maxDecimals);
  const words = readOut && amount !== null && amount > 0 ? liraInWords(amount) : null;
  const describedBy = [error ? `${id}-err` : null, words ? `${id}-words` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("mf", large && "mf--large")}>
      <label htmlFor={id} className="mf-label">
        {label}
      </label>
      <div className="mf-box" data-invalid={error ? "true" : undefined}>
        <input
          id={id}
          name={name}
          ref={(el) => {
            own.current = el;
            inputRef?.(el);
          }}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          onChange={onInput}
          onPaste={onPaste}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="mf-input"
        />
        <span aria-hidden className="mf-unit">
          ₺
        </span>
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mf-error">
          {error}
        </p>
      ) : null}
      {words ? (
        <p id={`${id}-words`} className="mf-words">
          {words[0]?.toLocaleUpperCase("tr-TR")}
          {words.slice(1)}.
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
