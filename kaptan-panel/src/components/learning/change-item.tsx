"use client";

import "./learning.css";

import type { LearningChange, LearningChangeStatus } from "@/lib/domain/learning";
import { fmtDate, fmtInt } from "@/lib/format";
import { pointsWords, rangeWords, stepWords } from "@/lib/learning/words";
import { Button } from "@/components/ui/button";

const STATUS: Readonly<Record<LearningChangeStatus, string>> = {
  applied: "Uygulandı",
  proposed: "Yalnızca önerildi",
  reverted: "Geri alındı",
};

/** One rule change: what moved, why, what the past test showed, and "Geri al" while it can still be undone. */
export function ChangeItem({
  change,
  pending,
  onRevert,
  compact = false,
}: {
  change: LearningChange;
  pending: boolean;
  onRevert: (version: number) => void;
  compact?: boolean;
}) {
  return (
    <li className="ln-item" data-testid={`degisiklik-${change.version}`} data-status={change.status}>
      <div className="ln-item-top">
        <p className="ln-item-name">
          {change.label_tr} <span className="ln-step">{stepWords(change)}</span>
        </p>
        <span className="ln-badge" data-status={change.status}>
          {STATUS[change.status]}
        </span>
      </div>
      <p className="ln-item-why">{change.reason_tr}</p>
      {compact ? null : (
        <p className="ln-item-proof">
          Geçmiş testte karar başına {pointsWords(change.gain_bps)} ({rangeWords(change.ci_low_bps, change.ci_high_bps)}), {fmtInt(change.n)} olay. {fmtDate(change.at)}.
        </p>
      )}
      {change.can_revert ? (
        <Button variant="secondary" className="mt-3" pending={pending} onClick={() => onRevert(change.version)}>
          Geri al<span className="sr-only">: {change.label_tr}</span>
        </Button>
      ) : null}
    </li>
  );
}
