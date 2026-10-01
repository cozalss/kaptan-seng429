// SENG 429 calendar (KAPTAN-BRIEF.md §0). `date` is ISO: "YYYY-MM-DD" for a fixed day,
// "YYYY-MM" when only the month is known (the final). A [data-timeline] plate highlights the next one.

import { formatDayTr, formatMonthTr } from '../utils/format.js';

export const MILESTONES = Object.freeze(
  [
    { id: 'proposal', date: '2026-10-12', label: 'Proposal' },
    { id: 'iskelet', date: '2026-10-26', label: 'İskelet' },
    { id: 'canli-test-kurallar', date: '2026-11-09', label: 'Canlı test · kurallar' },
    { id: 'progress', date: '2026-11-23', label: 'Progress · canlı test, tüm ajanlar' },
    { id: 'final', date: '2027-01', label: 'Final' },
  ].map((milestone) => Object.freeze(milestone)),
);

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;

/**
 * Local-time bounds of a milestone: the day itself, or the whole month for "YYYY-MM".
 * @returns {{start: Date, end: Date, precision: 'day'|'month'}}
 */
export function milestoneRange(date) {
  const day = DAY.exec(date);
  if (day) {
    const [y, m, d] = day.slice(1).map(Number);
    return { start: new Date(y, m - 1, d), end: new Date(y, m - 1, d, 23, 59, 59, 999), precision: 'day' };
  }
  const month = MONTH.exec(date);
  if (month) {
    const [y, m] = month.slice(1).map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999), precision: 'month' };
  }
  throw new RangeError(`milestoneRange: expected YYYY-MM-DD or YYYY-MM, got "${date}"`);
}

/** Index of the first milestone that has not ended by `today`; -1 once all are past. */
export function nextMilestoneIndex(milestones, today = new Date()) {
  const now = today.getTime();
  return milestones.findIndex((milestone) => milestoneRange(milestone.date).end.getTime() >= now);
}

/** "12 Eki 2026" for a day, "Ocak 2027" for a month-only milestone. */
export function formatMilestoneDate(date) {
  const { start, precision } = milestoneRange(date);
  return precision === 'day' ? formatDayTr(start) : formatMonthTr(start);
}
