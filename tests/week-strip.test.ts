/* WeekStrip tests (v1.1) — the qualitative review visualization.
   Pure functions: density levels, per-day/per-period aggregation, and the
   superlatives that drive the no-numbers summary lines. */

import { describe, expect, test } from "bun:test";
import {
  buildWeekStrip,
  densityLevel,
  type StripEntry,
} from "../src/lib/lifeos/services/week-strip";

const DAYS = [
  "2026-11-14",
  "2026-11-15",
  "2026-11-16",
  "2026-11-17",
  "2026-11-18",
  "2026-11-19",
  "2026-11-20",
];

function entry(
  date: string,
  order: number,
  executionStatus: string
): StripEntry {
  return { date, order, executionStatus };
}

describe("densityLevel", () => {
  test("0 -> empty, 1-2 -> light, 3+ -> full", () => {
    expect(densityLevel(0)).toBe(0);
    expect(densityLevel(1)).toBe(1);
    expect(densityLevel(2)).toBe(1);
    expect(densityLevel(3)).toBe(2);
    expect(densityLevel(9)).toBe(2);
  });
});

describe("buildWeekStrip", () => {
  test("an empty week is all quiet", () => {
    const strip = buildWeekStrip(DAYS, [], [1, 2, 3, 4, 5]);
    expect(strip.emptyDays).toBe(7);
    expect(strip.busiestDate).toBe(null);
    expect(strip.quietestDate).toBe(null);
    expect(strip.fullestOrder).toBe(null);
    expect(strip.uniform).toBe(true);
    for (const d of DAYS) {
      expect(strip.dayTotals.get(d)).toBe(0);
    }
  });

  test("entries outside the week are ignored", () => {
    const strip = buildWeekStrip(DAYS, [entry("2026-11-13", 1, "pending")], [
      1, 2, 3, 4, 5,
    ]);
    expect(strip.emptyDays).toBe(7);
  });

  test("cells aggregate per day+period", () => {
    const strip = buildWeekStrip(
      DAYS,
      [
        entry(DAYS[0], 1, "pending"),
        entry(DAYS[0], 1, "completed"),
        entry(DAYS[0], 1, "skipped"),
        entry(DAYS[0], 2, "pending"),
        entry(DAYS[1], 1, "pending"),
      ],
      [1, 2, 3, 4, 5]
    );
    expect(strip.cells.get(`${DAYS[0]}|1`)).toBe(3);
    expect(strip.cells.get(`${DAYS[0]}|2`)).toBe(1);
    expect(strip.cells.get(`${DAYS[1]}|1`)).toBe(1);
    expect(strip.dayTotals.get(DAYS[0])).toBe(4);
    expect(strip.dayTotals.get(DAYS[1])).toBe(1);
  });

  test("busiest, quietest and fullest period", () => {
    const strip = buildWeekStrip(
      DAYS,
      [
        entry(DAYS[0], 1, "pending"),
        entry(DAYS[0], 1, "pending"),
        entry(DAYS[0], 1, "pending"),
        entry(DAYS[0], 2, "pending"),
        entry(DAYS[1], 1, "pending"),
      ],
      [1, 2, 3, 4, 5]
    );
    expect(strip.busiestDate).toBe(DAYS[0]);
    expect(strip.quietestDate).toBe(DAYS[1]);
    expect(strip.fullestOrder).toBe(1);
    expect(strip.emptyDays).toBe(5);
    expect(strip.uniform).toBe(false);
  });

  test("a uniform week is flagged (no busiest line)", () => {
    const strip = buildWeekStrip(
      DAYS,
      DAYS.map((d) => entry(d, 1, "pending")),
      [1, 2, 3, 4, 5]
    );
    expect(strip.uniform).toBe(true);
    expect(strip.busiestDate).toBe(DAYS[0]); // still available, UI hides it
    expect(strip.quietestDate).toBe(DAYS[0]); // same totals -> first day
    expect(strip.emptyDays).toBe(0);
  });

  test("completion mix per day: done vs open", () => {
    const strip = buildWeekStrip(
      DAYS,
      [
        entry(DAYS[0], 1, "completed"),
        entry(DAYS[0], 2, "skipped"),
        entry(DAYS[1], 1, "pending"),
        entry(DAYS[1], 2, "partial"),
      ],
      [1, 2, 3, 4, 5]
    );
    // day 0: one completed, one skipped -> no open, allDone
    expect(strip.dayDone.get(DAYS[0])).toBe(1);
    expect(strip.dayOpen.get(DAYS[0])).toBe(0);
    expect(strip.allDoneDays).toBe(1);
    // day 1: pending + partial -> open
    expect(strip.dayOpen.get(DAYS[1])).toBe(2);
  });

  test("unplaced entries (order 0) get their own row when present", () => {
    const strip = buildWeekStrip(
      DAYS,
      [entry(DAYS[0], 0, "pending"), entry(DAYS[1], 3, "completed")],
      [1, 2, 3, 4, 5]
    );
    // the known orders stay (default rows) + order 0 joins, sorted
    expect(strip.orders).toEqual([0, 1, 2, 3, 4, 5]);
    expect(strip.cells.get(`${DAYS[0]}|0`)).toBe(1);
    expect(strip.cells.get(`${DAYS[1]}|3`)).toBe(1);
  });

  test("known orders keep the five default rows even when empty", () => {
    const strip = buildWeekStrip(DAYS, [], [1, 2, 3, 4, 5]);
    expect(strip.orders).toEqual([1, 2, 3, 4, 5]);
  });
});
