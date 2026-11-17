/* Life-day boundary (v1.2) — the day belongs to the waking hours, not to the
   clock. Before Fajr, "life today" is still yesterday: a 1 AM capture belongs
   to the day that is still spiritually and practically alive. Falls back to
   the calendar day whenever prayer times can't be resolved. */

import { addDays, minutesOfDate, timeToMinutes, todayLocal } from "./dates";
import { resolvePrayerTimes, type PrayerSettings } from "./prayer";

export interface PrayerPrefsLike {
  prayer: PrayerSettings;
}

/** Minutes-of-day of Fajr for a calendar date (null = unknown → midnight rule). */
export function fajrMinutesFor(
  calToday: string,
  prefs: PrayerPrefsLike | null | undefined
): number | null {
  if (!prefs) return null;
  try {
    const { times } = resolvePrayerTimes(calToday, prefs.prayer);
    const fajr = timeToMinutes(times.fajr);
    return Number.isFinite(fajr) ? fajr : null;
  } catch {
    return null;
  }
}

/** The "life day" key: yesterday until Fajr, today afterwards (v1.2). */
export function lifeDayFor(
  prefs: PrayerPrefsLike | null | undefined,
  nowMs: number = Date.now()
): string {
  const cal = todayLocal(nowMs);
  const fajr = fajrMinutesFor(cal, prefs);
  if (fajr === null) return cal;
  return minutesOfDate(new Date(nowMs)) < fajr ? addDays(cal, -1) : cal;
}
