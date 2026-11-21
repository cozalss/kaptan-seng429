"use client";

import { useId, type ReactNode } from "react";

/** A label, one control and a hint: the label names the control, the hint is read as its description. */
export function ImportField({ name, hint, children }: { name: string; hint?: string; children: (props: { id: string; "aria-describedby"?: string }) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="im-field">
      <label htmlFor={id} className="im-field-name">
        {name}
      </label>
      {children({ id, "aria-describedby": hint ? hintId : undefined })}
      {hint ? (
        <span id={hintId} className="im-field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
