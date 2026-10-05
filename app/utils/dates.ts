/** Date helpers. Months are always `YYYY-MM` strings. */

export type Quarter = 1 | 2 | 3 | 4;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function makeMonth(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function isValidMonth(month: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return false;
  const n = Number(m[2]);
  return n >= 1 && n <= 12;
}

export function getYearFromMonth(month: string): number {
  return Number(month.slice(0, 4));
}

export function getMonthNumber(month: string): number {
  return Number(month.slice(5, 7));
}

export function getQuarterFromMonth(month: string): Quarter {
  return (Math.floor((getMonthNumber(month) - 1) / 3) + 1) as Quarter;
}

export function isQuarter(n: number): n is Quarter {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

export function getMonthsForQuarter(year: number, quarter: Quarter): string[] {
  const start = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map((i) => makeMonth(year, start + i));
}

export function getPreviousQuarter(year: number, quarter: Quarter): { year: number; quarter: Quarter } {
  return quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: (quarter - 1) as Quarter };
}

export function getNextQuarter(year: number, quarter: Quarter): { year: number; quarter: Quarter } {
  return quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: (quarter + 1) as Quarter };
}

export function shiftMonth(month: string, delta: number): string {
  const index = getYearFromMonth(month) * 12 + (getMonthNumber(month) - 1) + delta;
  return makeMonth(Math.floor(index / 12), (index % 12) + 1);
}

export function getQuarterLabel(quarter: number): string {
  return `Q${quarter}`;
}

export function formatQuarter(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

/** "Apr 2026" */
export function getMonthLabel(month: string): string {
  return `${MONTH_NAMES[getMonthNumber(month) - 1].slice(0, 3)} ${getYearFromMonth(month)}`;
}

/** "Apr" */
export function getMonthShortLabel(month: string): string {
  return MONTH_NAMES[getMonthNumber(month) - 1].slice(0, 3);
}

/** "April 2026" */
export function formatMonth(month: string): string {
  return `${MONTH_NAMES[getMonthNumber(month) - 1]} ${getYearFromMonth(month)}`;
}

export function getMonthName(monthNumber: number): string {
  return MONTH_NAMES[monthNumber - 1];
}

export function getCurrentMonth(now: Date = new Date()): string {
  return makeMonth(now.getFullYear(), now.getMonth() + 1);
}

export function getCurrentYear(now: Date = new Date()): number {
  return now.getFullYear();
}

export function getCurrentQuarter(now: Date = new Date()): Quarter {
  return getQuarterFromMonth(getCurrentMonth(now));
}

/** Years offered in selectors: a window around now, widened to include `include`. */
export function getYearOptions(include: number[] = []): number[] {
  const current = getCurrentYear();
  const years = new Set<number>(include);
  for (let y = current - 5; y <= current + 2; y++) years.add(y);
  return [...years].sort((a, b) => a - b);
}

/** Parses a quarter route param: "Q2", "q2" or "2". */
export function parseQuarterParam(value: string | undefined): Quarter | null {
  const n = Number(value?.replace(/^q/i, ""));
  return Number.isInteger(n) && isQuarter(n) ? n : null;
}

export function parseYearParam(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

export function parseMonthParam(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export function generateId(): string {
  return crypto.randomUUID();
}
