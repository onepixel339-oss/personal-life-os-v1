/* v1.3.0 fixes & features — unit layer.
   1. shouldWeeklyNudge: the honest alarm's truth table (data, not mood).
   2. hasAnyClosure / closedInLast7Days: the graduated-cards + nudge gates.
   3. EGYPT_CITIES: valid, unique, in Egypt, Cairo = the default.
   4. i18n: the new keys exist in BOTH dictionaries; the dead cancel-key
      trio is gone from both; Arabic-Indic digits where numbers appear. */

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "../src/lib/lifeos/db";
import { addDays, dayOfWeek, diffDays, todayLocal } from "../src/lib/lifeos/dates";
import { shouldWeeklyNudge } from "../src/lib/lifeos/services/backup-service";
import {
  closedInLast7Days,
  hasAnyClosure,
} from "../src/lib/lifeos/services/day-closure";
import { generateDates } from "../src/lib/lifeos/services/recurrence-service";
import {
  DEFAULT_PRAYER_SETTINGS,
  EGYPT_CITIES,
} from "../src/lib/lifeos/prayer";
import { ar, en } from "../src/lib/lifeos/i18n";

const WEEK = 7 * 86_400_000;

async function freshDb(): Promise<void> {
  await db.delete();
  await db.open();
}

function seedClosed(date: string) {
  return db.dailyPlans.add({
    id: `plan-${date}`,
    date,
    createdAt: Date.now(),
    closedAt: Date.now(),
  } as never);
}

beforeAll(async () => {
  await freshDb();
});

beforeEach(async () => {
  for (const store of db.tables) await store.clear();
});

/* ---------------- 1: the weekly nudge decision ---------------- */

describe("shouldWeeklyNudge — one line, at most once a week, never a scolding", () => {
  const base = {
    now: Date.now(),
    closedInLast7Days: true,
    itemCount: 40,
  };

  test("never exported + a lived week → speaks", () => {
    expect(
      shouldWeeklyNudge({ ...base, lastExportAt: null, lastNudgeAt: null })
    ).toBe(true);
  });

  test("exported 3 days ago → stays quiet", () => {
    expect(
      shouldWeeklyNudge({
        ...base,
        lastExportAt: base.now - 3 * WEEK / 7,
        lastNudgeAt: null,
      })
    ).toBe(false);
  });

  test("exported 8 days ago and already nudged this week → stays quiet", () => {
    expect(
      shouldWeeklyNudge({
        ...base,
        lastExportAt: base.now - 8 * 86_400_000,
        lastNudgeAt: base.now - 2 * 86_400_000,
      })
    ).toBe(false);
  });

  test("exported 8 days ago, nudged 8 days ago → speaks again", () => {
    expect(
      shouldWeeklyNudge({
        ...base,
        lastExportAt: base.now - 8 * 86_400_000,
        lastNudgeAt: base.now - 8 * 86_400_000,
      })
    ).toBe(true);
  });

  test("a week with no قفلة is not a lived week → silence", () => {
    expect(
      shouldWeeklyNudge({
        ...base,
        closedInLast7Days: false,
        lastExportAt: null,
        lastNudgeAt: null,
      })
    ).toBe(false);
  });

  test("nothing worth protecting → silence", () => {
    expect(
      shouldWeeklyNudge({
        ...base,
        itemCount: 0,
        lastExportAt: null,
        lastNudgeAt: null,
      })
    ).toBe(false);
  });
});

/* ---------------- 2: closure-history gates ---------------- */

describe("closure history — the graduated-cards gates", () => {
  test("hasAnyClosure: false on a virgin device, true after one قفلة", async () => {
    expect(await hasAnyClosure()).toBe(false);
    await seedClosed(addDays(todayLocal(), -1));
    expect(await hasAnyClosure()).toBe(true);
  });

  test("closedInLast7Days: an old closure alone doesn't count, a recent one does", async () => {
    await seedClosed(addDays(todayLocal(), -20));
    expect(await closedInLast7Days()).toBe(false);
    await seedClosed(addDays(todayLocal(), -2));
    expect(await closedInLast7Days()).toBe(true);
  });

  test("today's own closure counts as recent (the nudge can fire on قفلة day)", async () => {
    await seedClosed(todayLocal());
    expect(await closedInLast7Days()).toBe(true);
  });
});

/* ---------------- 3: Egyptian cities ---------------- */

describe("EGYPT_CITIES — pre-baked, valid, zero-network", () => {
  test("ids are unique", () => {
    expect(new Set(EGYPT_CITIES.map((c) => c.id)).size).toBe(EGYPT_CITIES.length);
  });

  test("every city lies inside Egypt's bounds and has both names", () => {
    for (const c of EGYPT_CITIES) {
      expect(c.lat).toBeGreaterThan(21.5);
      expect(c.lat).toBeLessThan(31.7);
      expect(c.lng).toBeGreaterThan(24.5);
      expect(c.lng).toBeLessThan(37.0);
      expect(c.nameAr.length).toBeGreaterThan(1);
      expect(c.nameEn.length).toBeGreaterThan(1);
    }
  });

  test("Cairo matches the default prayer coordinates", () => {
    const cairo = EGYPT_CITIES.find((c) => c.id === "cairo");
    expect(cairo).toBeDefined();
    expect(cairo!.lat).toBe(DEFAULT_PRAYER_SETTINGS.calculated.latitude);
    expect(cairo!.lng).toBe(DEFAULT_PRAYER_SETTINGS.calculated.longitude);
  });
});

/* ---------------- 3: the weekday-shift engine fix ---------------- */

describe("v1.3 engine fix — weekdays are what the labels say (0=الأحد..6=السبت)", () => {
  let seq = 0;
  function rule(over: Record<string, unknown>): import("../src/lib/lifeos/types").RecurrenceRule {
    seq += 1;
    return {
      id: `fix-rule-${seq}`,
      itemId: "i",
      state: "active",
      pattern: "weekdays",
      interval: 1,
      weekAnchor: 6, // the app default: Saturday-first calendar
      startDate: "2026-11-01",
      createdAt: 0,
      updatedAt: 0,
      version: 1,
      ...over,
    } as never;
  }

  test("byWeekday [2,4] with the default Saturday anchor fires Tuesday+Thursday, not Monday+Wednesday", () => {
    const dates = generateDates(
      rule({ pattern: "weekdays", byWeekday: [2, 4] }),
      "2026-11-01",
      "2026-11-15"
    );
    // 2026-11-03 is a Tuesday, 2026-11-05 a Thursday, and so on
    expect(dates).toEqual([
      "2026-11-03",
      "2026-11-05",
      "2026-11-10",
      "2026-11-12",
    ]);
    for (const d of dates) {
      expect([2, 4]).toContain(dayOfWeek(d));
    }
  });

  test("weekly with anchor 6 fires on the start weekday itself (no more one-day-early)", () => {
    // 2026-11-24 is a Tuesday
    const dates = generateDates(
      rule({ pattern: "weekly", startDate: "2026-11-24" }),
      "2026-11-22",
      "2026-12-08"
    );
    expect(dates).toEqual(["2026-11-24", "2026-12-01", "2026-12-08"]);
    for (const d of dates) expect(dayOfWeek(d)).toBe(2);
  });

  test("anchor 0 (Sunday-first) behaves exactly as before — no regression", () => {
    const dates = generateDates(
      rule({ pattern: "weekdays", byWeekday: [1, 3], weekAnchor: 0 }),
      "2026-11-01",
      "2026-11-14"
    );
    expect(dates).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11"]);
  });
});

/* ---------------- 4: welcome-back gap math ---------------- */

describe("welcome-back gap — diffDays feeds the threshold", () => {
  test("a 4-day gap crosses the line; a 3-day gap doesn't", () => {
    const today = "2026-11-18";
    expect(diffDays("2026-11-14", today)).toBe(4);
    expect(diffDays("2026-11-15", today)).toBe(3);
  });
});

/* ---------------- 5: i18n ---------------- */

describe("i18n — new keys in both dictionaries, dead keys gone, digits honest", () => {
  const NEW_KEYS = [
    "entry.liveHere",
    "entry.liveHereHint",
    "entry.liveHereToast",
    "entry.notToday",
    "entry.notTodayToast",
    "today.welcomeBack",
    "backup.nudgeTitle",
    "backup.nudgeBody",
    "backup.nudgeAction",
    "backup.nudgeLater",
    "backup.nudgeExportedToast",
    "prayer.city",
    "prayer.cityCustom",
  ];
  const DEAD_KEYS = [
    "entry.cancelJustThisOne",
    "entry.oneCancelledToast",
    "entry.offTodayToast",
    "entry.cancelThisOne",
  ];

  test("every new key exists in en AND ar", () => {
    for (const k of NEW_KEYS) {
      expect(en[k], `en missing: ${k}`).toBeDefined();
      expect(ar[k], `ar missing: ${k}`).toBeDefined();
    }
  });

  test("the dead cancel-key quartet is gone from BOTH dictionaries", () => {
    for (const k of DEAD_KEYS) {
      expect(en[k], `en still has: ${k}`).toBeUndefined();
      expect(ar[k], `ar still has: ${k}`).toBeUndefined();
    }
  });

  test("the nudge body carries Arabic-Indic numerals in Arabic", () => {
    expect(ar["backup.nudgeBody"]).toContain("٥");
    // and no western digits snuck into the Arabic value
    expect(ar["backup.nudgeBody"]).not.toMatch(/[0-9]/);
  });

  test("خلّيه يعيش هنا؟ is exactly the phrase the product speaks", () => {
    expect(ar["entry.liveHere"]).toContain("خلّيه يعيش هنا؟");
    expect(ar["entry.notToday"]).toBe("مش النهارده");
  });
});
