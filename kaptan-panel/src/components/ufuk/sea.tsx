import { cn } from "@/lib/utils";
import { seaStrokes } from "./engrave";

const WIDTH = 1920;
const HEIGHT = 720;
/** Computed once: the drawing is the same on every page that wants it. */
const STROKES = seaStrokes(WIDTH, HEIGHT);

/**
 * A printed sea with no data in it, for the sign-in and the 404: water and its engraved strokes,
 * filling its box from the horizon down. Works on the server.
 */
export function Sea({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("u-sea overflow-hidden", className)}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMin slice" focusable="false" className="block size-full">
        <path d={STROKES} fill="var(--sea-stroke)" />
      </svg>
    </div>
  );
}
