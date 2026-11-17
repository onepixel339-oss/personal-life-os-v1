/* Year-scale test (v1.3) — the app promises to live for years; this test
   makes it live one year in seconds: 365 plans, ~1100 entries, two rules,
   and the real assembly + prayer-anchored period resolution re-run for
   EVERY single day. Catches: expansion blowups, duplicate keys, rows
   leaking across days, pathological sizes, accidental O(n²) regressions. */

import { beforeAll, describe, expect, test } from "bun:test";
import { db } from "../src/lib/lifeos/db";
import { addDays, dayOfWeek, todayLocal } from "../src/lib/lifeos/dates";
import { DEFAULT_PRAYER, defaultPeriodSettings } from "../src/lib/lifeos/defaults";
import { buildTodayData } from "../src/lib/lifeos/services/today-assembly";
import { resolvePeriodsForDate } from "../src/lib/lifeos/services/planning-service";
import { createItem } from "../src/lib/lifeos/services/item-service";
import { createRule } from "../src/lib/lifeos/services/recurrence-service";
import { getClosedMap } from "../src/lib/lifeos/services/day-closure";
import type { DailyEntry, DailyPlan } from "../src/lib/lifeos/types";

function must<T>(res: { ok: boolean; value?: T }): T {
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("seed failed");
  return res.value as T;
}

const START = "2026-01-01";
const DAYS = 365;
const days = Array.from({ length: DAYS }, (_, i) => addDays(START, i));

beforeAll(async () => {
  await db.delete();
  await db.open();
  for (const store of db.tables) await store.clear();

  // items: one daily habit, one Tue/Thu habit, three plain everyday items
  const daily = must(await createItem({ title: "وِرد يومي", type: "activity" })).id;
  const weekly = must(await createItem({ title: "جيم", type: "activity" })).id;
  const plain = [
    must(await createItem({ title: "شغل", type: "task" })).id,
    must(await createItem({ title: "قيلولة", type: "activity" })).id,
    must(await createItem({ title: "مذاكرة", type: "task" })).id,
  ];

  must(
    await createRule({
      itemId: daily,
      pattern: "daily",
      interval: 1,
      startDate: START,
      startTime: "21:00",
      periodSettingId: "ps-evening",
      weekAnchor: 6,
    })
  );
  must(
    await createRule({
      itemId: weekly,
      pattern: "weekdays",
      interval: 1,
      byWeekday: [2, 4],
      startDate: START,
      weekAnchor: 6,
    })
  );

  // 365 plans + 3 plain entries a day, seeded directly (the fast bulk path)
  const plans: DailyPlan[] = days.map((d, i) => ({
    id: `plan-${i}`,
    date: d,
    createdAt: Date.now(),
  }));
  await db.dailyPlans.bulkAdd(plans as never[]);
  const entries: DailyEntry[] = [];
  let sortCounter = 0;
  for (let i = 0; i < days.length; i++) {
    for (let j = 0; j < plain.length; j++) {
      entries.push({
        id: `e-${i}-${j}`,
        dailyPlanId: `plan-${i}`,
        kind: "item",
        itemId: plain[j],
        executionStatus: "pending",
        sortOrder: String(++sortCounter).padStart(8, "0"),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
  await db.dailyEntries.bulkAdd(entries as never[]);

  // closures on the first 30 days — a month of قفلات
  await Promise.all(
    plans.slice(0, 30).map((p) =>
      db.dailyPlans.update(p.id, { closedAt: Date.now() })
    )
  );
});

describe("year scale — 365 days through the real assembly", () => {
  test("every day: unique keys, correct counts, no cross-day leaks — and fast enough", async () => {
    const rules = await db.recurrenceRules.toArray();
    const items = await db.items.toArray();
    const planIdByDate = new Map(
      (await db.dailyPlans.toArray()).map((p) => [p.date, p.id])
    );
    const allEntries = await db.dailyEntries.toArray();

    const expectedWeeklyDays = days.filter((d) =>
      [2, 4].includes(dayOfWeek(d))
    ).length;
    expect(expectedWeeklyDays).toBeGreaterThan(90); // sanity: a real year

    const startedAt = Date.now();
    let totalOccurrenceRows = 0;
    let totalEntryRows = 0;

    for (const date of days) {
      const planId = planIdByDate.get(date)!;
      const dayEntries = allEntries.filter((e) => e.dailyPlanId === planId);
      const data = buildTodayData({
        date,
        plan: await db.dailyPlans.get(planId),
        periodRows: resolvePeriodsForDate(
          date,
          defaultPeriodSettings(),
          DEFAULT_PRAYER
        ),
        entries: dayEntries,
        items,
        routines: [],
        rules,
        occStates: [],
      });

      // no duplicated rows on any day of the year
      expect(new Set(data.allRows.map((r) => r.key)).size).toBe(
        data.allRows.length
      );
      // 3 manual entries + the daily occurrence + the weekly one (Tue/Thu)
      const weeklyToday = [2, 4].includes(dayOfWeek(date)) ? 1 : 0;
      expect(data.allRows.length).toBe(3 + 1 + weeklyToday);
      expect(
        data.allRows.filter((r) => r.kind === "occurrence").length
      ).toBe(1 + weeklyToday);
      expect(
        data.allRows.filter((r) => r.kind === "entry").length
      ).toBe(3);

      totalOccurrenceRows += 1 + weeklyToday;
      totalEntryRows += 3;
    }

    const elapsed = Date.now() - startedAt;
    // generous guard: a full year must assemble in seconds, not minutes
    expect(elapsed).toBeLessThan(10_000);

    expect(totalOccurrenceRows).toBe(DAYS + expectedWeeklyDays);
    expect(totalEntryRows).toBe(DAYS * 3);
  });

  test("a year of entries stays far below the snapshot size ceiling", () => {
    // the auto-backup refuses to snapshot above 50 MB — a year of real
    // life must never come close
    const allEntries = JSON.stringify(
      Array.from({ length: 365 * 3 }, (_, i) => ({
        id: `e-${i}`,
        dailyPlanId: `plan-${Math.floor(i / 3)}`,
        kind: "item",
        itemId: "item-1",
        executionStatus: "completed",
        sortOrder: String(i).padStart(8, "0"),
        createdAt: 1760000000000,
        updatedAt: 1760000000000,
      }))
    );
    expect(allEntries.length).toBeLessThan(25 * 1024 * 1024);
  });

  test("getClosedMap over a whole year: 30 closures found, nothing invented", async () => {
    const map = await getClosedMap(days);
    expect(map.size).toBe(30);
    const today = todayLocal();
    expect(map.has(today)).toBe(false); // today was never closed in this seed
  });
});
