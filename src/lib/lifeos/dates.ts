/* Date & time utilities — Master Specification §9.5.
   Date-only values are 'YYYY-MM-DD' strings, wall-clock times are 'HH:mm'.
   All date arithmetic uses UTC-date components (never local Date parsing).
   Display strings follow the active language (lang-state, zero-dependency). */

import {
  AR_AM,
  AR_MONTHS_LONG,
  AR_MONTHS_SHORT,
  AR_PM,
  AR_WEEKDAYS_LONG,
  AR_WEEKDAYS_SHORT,
  getLangState,
  toArabicDigits,
} from "./lang-state";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDateString(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const utc = new Date(Date.UTC(y, m - 1, d));
  return (
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() === m - 1 &&
    utc.getUTCDate() === d
  );
}

export function isValidTimeString(s: unknown): s is string {
  return typeof s === "string" && TIME_RE.test(s);
}

export function toDateString(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${String(y).padStart(4, "0")}-${mm}-${dd}`;
}

export function parseDate(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** UTC-anchored Date (safe for arithmetic; never use local parse). */
function utcDate(s: string): Date {
  const { y, m, d } = parseDate(s);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  return toDateString(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate()
  );
}

export function addDays(s: string, n: number): string {
  const d = utcDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export function addMonths(s: string, n: number): string {
  const { y, m, d } = parseDate(s);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  const lastDay = daysInMonth(year, month);
  return toDateString(year, month, Math.min(d, lastDay));
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Local calendar date of "now" on the device (§9.5 rule 2). */
export function todayLocal(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  return toDateString(get("year"), get("month"), get("day"));
}

/** Day of week 0=Sunday..6=Saturday. */
export function dayOfWeek(s: string): number {
  return utcDate(s).getUTCDay();
}

/** Start of the week containing s, given firstDay (0=Sunday..6=Saturday). */
export function weekStart(s: string, firstDay: number): string {
  const dow = dayOfWeek(s);
  const diff = (dow - firstDay + 7) % 7;
  return addDays(s, -diff);
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function dateInRange(s: string, start: string, end: string): boolean {
  return s >= start && s <= end;
}

export function diffDays(a: string, b: string): number {
  return Math.round(
    (utcDate(b).getTime() - utcDate(a).getTime()) / 86_400_000
  );
}

/* ---- time helpers (HH:mm strings) ---- */

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Current local wall-clock minutes since midnight. */
export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function digits(s: string): string {
  return getLangState() === "ar" ? toArabicDigits(s) : s;
}

export function formatTime(t: string, use24h: boolean): string {
  const total = timeToMinutes(t);
  const isAr = getLangState() === "ar";
  if (use24h) {
    const h = String(Math.floor(total / 60)).padStart(2, "0");
    const m = String(total % 60).padStart(2, "0");
    return digits(`${h}:${m}`);
  }
  let h = Math.floor(total / 60);
  const m = String(total % 60).padStart(2, "0");
  const suffix = h >= 12 ? (isAr ? AR_PM : "PM") : isAr ? AR_AM : "AM";
  h = h % 12 === 0 ? 12 : h % 12;
  return digits(`${h}:${m} ${suffix}`);
}

export type DateFormatKind = "dmy" | "mdy" | "ymd";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDate(
  s: string,
  kind: DateFormatKind = "dmy"
): string {
  const { y, m, d } = parseDate(s);
  if (getLangState() === "ar") {
    const month = AR_MONTHS_SHORT[m - 1];
    if (kind === "ymd") return digits(`${y} ${month} ${d}`);
    if (kind === "mdy") return digits(`${month} ${d}، ${y}`);
    return digits(`${d} ${month} ${y}`);
  }
  if (kind === "ymd") return `${y} ${MONTHS_SHORT[m - 1]} ${d}`;
  if (kind === "mdy") return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

export function formatDateLong(s: string): string {
  const { y, m, d } = parseDate(s);
  if (getLangState() === "ar") {
    return digits(
      `${AR_WEEKDAYS_LONG[dayOfWeek(s)]}، ${d} ${AR_MONTHS_LONG[m - 1]} ${y}`
    );
  }
  return `${WEEKDAYS_LONG[dayOfWeek(s)]}, ${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

export function weekdayName(s: string, short = false): string {
  if (getLangState() === "ar") {
    return (short ? AR_WEEKDAYS_SHORT : AR_WEEKDAYS_LONG)[dayOfWeek(s)];
  }
  return (short ? WEEKDAYS_SHORT : WEEKDAYS_LONG)[dayOfWeek(s)];
}

export function monthName(y: number, m: number): string {
  if (getLangState() === "ar") {
    void y;
    return AR_MONTHS_LONG[m - 1];
  }
  return MONTHS_LONG[m - 1];
}

export function dayNumber(s: string): number {
  return parseDate(s).d;
}

/** e.g. 'Sat 9 – Fri 15 Nov' for a week range. */
export function formatWeekRange(
  start: string,
  end: string,
  kind: DateFormatKind = "dmy"
): string {
  const s = parseDate(start);
  const e = parseDate(end);
  const sameMonth = s.m === e.m && s.y === e.y;
  if (getLangState() === "ar") {
    return sameMonth
      ? digits(`${s.d} – ${e.d} ${AR_MONTHS_SHORT[e.m - 1]} ${e.y}`)
      : digits(
          `${s.d} ${AR_MONTHS_SHORT[s.m - 1]} – ${e.d} ${AR_MONTHS_SHORT[e.m - 1]} ${e.y}`
        );
  }
  if (kind === "mdy") {
    return sameMonth
      ? `${WEEKDAYS_SHORT[dayOfWeek(start)]} ${MONTHS_SHORT[s.m - 1]} ${s.d} – ${WEEKDAYS_SHORT[dayOfWeek(end)]} ${MONTHS_SHORT[e.m - 1]} ${e.d}, ${e.y}`
      : `${WEEKDAYS_SHORT[dayOfWeek(start)]} ${MONTHS_SHORT[s.m - 1]} ${s.d} – ${WEEKDAYS_SHORT[dayOfWeek(end)]} ${MONTHS_SHORT[e.m - 1]} ${e.d}, ${e.y}`;
  }
  return sameMonth
    ? `${s.d} – ${e.d} ${MONTHS_SHORT[e.m - 1]} ${e.y}`
    : `${s.d} ${MONTHS_SHORT[s.m - 1]} – ${e.d} ${MONTHS_SHORT[e.m - 1]} ${e.y}`;
}

/** Does time t (minutes since midnight, may exceed 1440 via dayOffset) fall in [start,end)? */
export function minutesInPeriod(
  t: number,
  start: number,
  end: number,
  endOffset: 0 | 1
): boolean {
  const endAbs = end + endOffset * 1440;
  return t >= start && t < endAbs;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
