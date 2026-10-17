import type { ReactNode } from "react";

/**
 * A figure inside a Bodoni line. Bodoni's figures turn into hairlines at reading sizes and
 * change width from line to line, so every number in a Bodoni sentence is set in tabular
 * Inter instead (`.num` in globals.css).
 */
export function Num({ children }: { children: ReactNode }) {
  return <span className="num">{children}</span>;
}

/**
 * A digit run with its sign and percent: "%0,31", "−%5", "+%1,4", "1.240", "48,40", "09:50".
 * A separator counts only between digits, so the full stop or comma of a sentence stays out.
 */
const NUMBER_RUN = /((?:[+−-]?%|[+−-])?\d(?:[.,:]?\d)*(?:\s?%)?)/;

/**
 * Splits a sentence into words and <Num> figures, for Bodoni lines:
 * `withNums("%0,31’i")` → `[<Num>%0,31</Num>, "’i"]`. Pure: the input is never changed and
 * empty pieces are dropped.
 */
export function withNums(text: string): ReactNode[] {
  return text
    .split(NUMBER_RUN)
    .map((piece, i) => (i % 2 === 1 ? <Num key={i}>{piece}</Num> : piece))
    .filter((piece) => piece !== "");
}
