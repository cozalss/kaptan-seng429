import type { ReactNode } from "react";

/** Every home block opens the same way: a small label that names it and one plain line saying what it is. */
export function BlockHead({ id, label, about, action }: { id: string; label: string; about: ReactNode; action?: ReactNode }) {
  return (
    <div className="hm-head">
      <div className="hm-head-words">
        <h2 id={id} className="hm-label">
          {label}
        </h2>
        <p className="hm-about">{about}</p>
      </div>
      {action ? <div className="hm-head-action">{action}</div> : null}
    </div>
  );
}
