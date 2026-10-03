import { DAY_BY_ANCHOR, DAY_TOTAL } from "./ids";
import { CLOCK_ANCHOR_MS, DEMO_DAY } from "./clock";
import { istanbulIso } from "@/lib/time";

const START_MS = Date.parse(istanbulIso(DEMO_DAY, "07:00"));
const LATE_END_MS = Date.parse(istanbulIso(DEMO_DAY, "18:30"));

/**
 * Publication time of the day's slot `s` (0-based). Slots 0…211 fall between 07:00 and
 * 13:39 (before the clock anchor); 212…317 fall between 13:40 and 18:30 and are released
 * by the mock stream. Monotonic, so KAP indices increase with time as they do on KAP.
 */
export function slotTime(slot: number): string {
  if (slot < DAY_BY_ANCHOR.total) {
    const span = CLOCK_ANCHOR_MS - 60_000 - START_MS;
    return new Date(START_MS + Math.floor((span * slot) / DAY_BY_ANCHOR.total)).toISOString();
  }
  const late = slot - DAY_BY_ANCHOR.total;
  const lateCount = DAY_TOTAL - DAY_BY_ANCHOR.total;
  const span = LATE_END_MS - CLOCK_ANCHOR_MS;
  return new Date(CLOCK_ANCHOR_MS + 30_000 + Math.floor((span * late) / lateCount)).toISOString();
}
