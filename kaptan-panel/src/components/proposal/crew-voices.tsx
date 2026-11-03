import type { CrewLine } from "@/components/story/plain";
import { cn } from "@/lib/utils";

/**
 * "KAPtan neye baktı?": the eight steps in the order they ran, each as a plain question and what
 * came out of it. The ones that changed the amount read a little stronger.
 */
export function CrewVoices({ lines, loading }: { lines: readonly CrewLine[]; loading: boolean }) {
  return (
    <ul aria-label="KAPtan'ın baktıkları" aria-busy={loading || undefined} className="oneri-looks">
      {lines.map((l) => (
        <li key={l.agent}>
          <p className="oneri-looks-q">{l.question}</p>
          <p className={cn("oneri-looks-a", l.changed && "oneri-looks-changed")}>{l.text}</p>
        </li>
      ))}
    </ul>
  );
}
