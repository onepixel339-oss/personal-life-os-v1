/* Life-day boundary tests (v1.2) — before Fajr it is still yesterday.
   Uses manual prayer mode with a pinned Fajr so results are timezone-free. */

import { describe, expect, test } from "bun:test";
import { DEFAULT_PRAYER_SETTINGS, type PrayerSettings } from "../src/lib/lifeos/prayer";
import { fajrMinutesFor, lifeDayFor } from "../src/lib/lifeos/day-boundary";
import { todayLocal } from "../src/lib/lifeos/dates";

function prefsWithFajr(hhmm: string): { prayer: PrayerSettings } {
  return {
    prayer: {
      ...DEFAULT_PRAYER_SETTINGS,
      mode: "manual",
      manual: { ...DEFAULT_PRAYER_SETTINGS.manual, fajr: hhmm },
    },
  };
}

describe("fajrMinutesFor", () => {
  test("reads the manual Fajr as minutes", () => {
    expect(fajrMinutesFor("2026-05-05", prefsWithFajr("05:30"))).toBe(330);
  });

  test("null prefs → null (midnight rule)", () => {
    expect(fajrMinutesFor("2026-05-05", null)).toBe(null);
    expect(fajrMinutesFor("2026-05-05", undefined)).toBe(null);
  });
});

describe("lifeDayFor — the day flips at Fajr", () => {
  const prefs = prefsWithFajr("05:00");

  function atTime(dateIso: string, hh: number, mm: number): number {
    return new Date(`${dateIso}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).getTime();
  }

  test("01:00 → still yesterday", () => {
    expect(lifeDayFor(prefs, atTime("2026-05-05", 1, 0))).toBe("2026-05-04");
  });

  test("04:59 → still yesterday", () => {
    expect(lifeDayFor(prefs, atTime("2026-05-05", 4, 59))).toBe("2026-05-04");
  });

  test("05:00 sharp → today", () => {
    expect(lifeDayFor(prefs, atTime("2026-05-05", 5, 0))).toBe("2026-05-05");
  });

  test("14:00 → today", () => {
    expect(lifeDayFor(prefs, atTime("2026-05-05", 14, 0))).toBe("2026-05-05");
  });

  test("23:30 → today (until midnight, then the life day holds via Fajr)", () => {
    expect(lifeDayFor(prefs, atTime("2026-05-05", 23, 30))).toBe("2026-05-05");
  });

  test("no prefs → calendar day (fallback)", () => {
    const now = atTime("2026-05-05", 1, 0);
    expect(lifeDayFor(null, now)).toBe(todayLocal(now));
  });

  test("calculated mode also lands on a sane boundary (Cairo defaults)", () => {
    const now = atTime("2026-05-05", 1, 0);
    // before any Fajr (Egyptian Fajr is never after 05:30 in May)
    expect(lifeDayFor({ prayer: DEFAULT_PRAYER_SETTINGS }, now)).toBe("2026-05-04");
    const afternoon = atTime("2026-05-05", 15, 0);
    expect(lifeDayFor({ prayer: DEFAULT_PRAYER_SETTINGS }, afternoon)).toBe("2026-05-05");
  });
});
