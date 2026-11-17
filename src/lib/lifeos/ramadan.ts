/* Ramadan awareness (v1.2) — the biggest calendar event of the year flips
   the whole day structure (Suhoor, fasting, Taraweeh, night-flipped energy).
   Detection is offline via the browser's built-in Islamic calendar (Intl);
   no library, no network, no lookup table. */

export interface HijriDate {
  month: number; // 1..12 — 9 = Ramadan
  day: number; // 1..30
}

/** Hijri month/day of a date, or null when the runtime lacks the calendar. */
export function hijriMonthDay(date: Date): HijriDate | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "numeric",
    });
    const parts = fmt.formatToParts(date);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { month, day };
  } catch {
    return null;
  }
}

export function isRamadan(date: Date = new Date()): boolean {
  return hijriMonthDay(date)?.month === 9;
}

/** Which third of Ramadan we're in (copy variety; 1 outside Ramadan). */
export function ramadanThird(date: Date = new Date()): 1 | 2 | 3 {
  const h = hijriMonthDay(date);
  if (!h || h.month !== 9) return 1;
  return h.day <= 10 ? 1 : h.day <= 20 ? 2 : 3;
}

/** Canonical (English) names for the five default periods in Ramadan mode.
    Arabic labels come from i18n's period-name map, exactly like the defaults. */
export const RAMADAN_PERIODS: { order: number; name: string; tagline: string }[] = [
  { order: 1, name: "Suhoor", tagline: "The quiet night kitchen" },
  { order: 2, name: "Ramadan Morning", tagline: "Slow hours" },
  { order: 3, name: "Before Iftar", tagline: "Hold it gently" },
  { order: 4, name: "After Iftar", tagline: "The day opens again" },
  { order: 5, name: "Taraweeh & Night", tagline: "Leave it open" },
];
