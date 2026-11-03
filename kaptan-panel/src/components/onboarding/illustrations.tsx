import { Boat } from "@/components/ufuk/boat";

/**
 * The three pictures of "KAPtan nasıl çalışır", in the landing's ink: a sheaf of duyuru falling
 * toward the boat, the same hill of paper as Okunanlar narrowing to a thread, and the seal that only
 * your own hand sets down. Decorative; the words beside them carry the meaning.
 */
const SHEETS = [
  [6, 18, -8],
  [17, 6, 5],
  [28, 22, -4],
  [39, 8, 9],
  [50, 26, -7],
  [61, 12, 4],
  [72, 24, -10],
  [12, 42, 7],
  [33, 48, -6],
  [54, 44, 8],
  [24, 62, -3],
  [44, 66, 6],
] as const;

export function StepRead() {
  return (
    <div className="hw-scene">
      {SHEETS.map(([x, y, r], i) => (
        <span key={`${x}-${y}`} className="hw-sheet-paper" style={{ left: `${x}%`, top: `${y}%`, "--hw-r": `${r}deg`, "--hw-i": i } as React.CSSProperties}>
          <i />
          <i />
          <i />
        </span>
      ))}
      <Boat className="hw-scene-boat" />
    </div>
  );
}

export function StepSift() {
  return (
    <div className="hw-scene">
      <div className="hw-hill u-hatch" />
      <Boat className="hw-scene-boat" />
    </div>
  );
}

export function StepDecide() {
  return (
    <div className="hw-scene hw-decide">
      <div className="hw-verbs">
        <span className="hw-verb-al">
          AL
          <svg viewBox="0 0 120 120" className="hw-seal">
            <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" strokeWidth="4" />
            <circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M38 62l16 16 30-34" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="square" />
          </svg>
        </span>
        <span>TUT</span>
        <span>SAT</span>
      </div>
      <Boat className="hw-scene-boat" />
    </div>
  );
}
