/**
 * Mock clock. The demo day is Monday 11 January 2027 (course hour, BIST session open,
 * 11-demo-senaryosu §0); "now" starts at 13:40 Istanbul (UTC+3, no DST) and advances in
 * real time from the moment the mock session started.
 */
export const DEMO_DAY = "2027-01-11";
/** 13:40 Istanbul = 10:40Z. */
export const CLOCK_ANCHOR_ISO = "2027-01-11T10:40:00.000Z";
export const CLOCK_ANCHOR_MS = Date.parse(CLOCK_ANCHOR_ISO);

export function mockNowMs(realNowMs: number, sessionStartedRealMs: number): number {
  return CLOCK_ANCHOR_MS + Math.max(0, realNowMs - sessionStartedRealMs);
}

export {
  istanbulIso,
  istanbulMinutes,
  isTradingDay,
  addDays,
  nextTradingDay,
  tradingDaysBetween,
  approvalExpiry,
  ISTANBUL_OFFSET_H,
} from "@/lib/time";
