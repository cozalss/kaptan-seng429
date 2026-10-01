// Turkish-facing date formatting. Always goes through Intl — never a hand-rolled month table — so
// the tr-TR month names and abbreviations ("Eki", "Kas", "Ocak") are correct by construction.

const DAY_TR = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const MONTH_TR = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });

function assertDate(date, name) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError(`${name}: date must be a valid Date`);
  }
}

/** @param {Date} date @returns {string} e.g. "12 Eki 2026" */
export function formatDayTr(date) {
  assertDate(date, 'formatDayTr');
  return DAY_TR.format(date);
}

/** @param {Date} date @returns {string} e.g. "Ocak 2027" */
export function formatMonthTr(date) {
  assertDate(date, 'formatMonthTr');
  return MONTH_TR.format(date);
}
