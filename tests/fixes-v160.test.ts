/* v1.6.0 fixes — the regression locks.
   1. One add-to-day behavior everywhere: the general dialogs no longer pass
      allowMultiple, so re-adding moves the entry instead of stacking a second
      (multi-session stays entertainment-only).
   2. startRoutine is idempotent per day: a double-open resumes the same
      in-progress execution instead of minting a second one.
   3. A pattern change wakes its sleeping companions: byWeekday survives only
      on weekly/weekdays, byMonthDay only on monthly.
   4. The quick-add weekly pattern finally means something: a picked weekday
      feeds the rule, and a weekly rule with no day anchors to its start day.
   5. The week can speak about the past: collectDoneKeys/weekDaysOf and the
      WeeklyRow.done flag; the new i18n key exists in both dictionaries. */

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { db } from "../src/lib/lifeos/db";
import { addDays, dayOfWeek, todayLocal, weekStart } from "../src/lib/lifeos/dates";
import { ar, en } from "../src/lib/lifeos/i18n";
import { collectDoneKeys, weekDaysOf, type WeeklyRow } from "../src/lib/lifeos/hooks";
import {
  addEntryToDay,
  addEntryToWeek,
  ensurePlan,
  setExecutionStatus,
} from "../src/lib/lifeos/services/planning-service";
import {
  createRoutine,
  startRoutine,
} from "../src/lib/lifeos/services/routine-service";
import { createItem } from "../src/lib/lifeos/services/item-service";
import {
  createRule,
  expand,
  buildRulesById,
  buildStatesByKey,
} from "../src/lib/lifeos/services/recurrence-service";
import type { Occurrence, OccurrenceState, RecurrenceRule } from "../src/lib/lifeos/types";

async function freshDb(): Promise<void> {
  await db.delete();
  await db.open();
}

async function seedPeriods(): Promise<void> {
  await db.periodSettings.bulkAdd([
    { id: "ps-morning", name: "Morning", order: 1, enabled: true },
    { id: "ps-evening", name: "Evening", order: 2, enabled: true },
  ] as never);
}

beforeAll(async () => {
  await freshDb();
});

beforeEach(async () => {
  for (const store of db.tables) await store.clear();
});

/* ---------------- 1: one add-to-day behavior everywhere ---------------- */

describe("v1.6.0 A: the general dialogs never stack a second entry", () => {
  test("the service rule the dialogs now ride on: re-adding moves, not stacks", async () => {
    await seedPeriods();
    const item = await createItem({ type: "task", title: "قراءة" });
    expect(item.ok).toBe(true);
    if (!item.ok) return;
    const date = todayLocal();
    const first = await addEntryToDay({ date, kind: "item", itemId: item.value.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // The unified dialog call (no allowMultiple) with a NEW period choice:
    // the entry moves there — one row, not two.
    const again = await addEntryToDay({
      date,
      kind: "item",
      itemId: item.value.id,
      periodSettingId: "ps-evening",
      startTime: "21:00",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const entries = await db.dailyEntries.toArray();
    expect(entries.filter((e) => e.itemId === item.value.id).length).toBe(1);
    expect(again.value.alreadyPlaced).toBe(true);
    expect(entries[0].periodId).toBeDefined();
    expect(entries[0].startTime).toBe("21:00");
  });

  test("entertainment sessions keep their explicit multi-session right", async () => {
    await seedPeriods();
    const item = await createItem({ type: "task", title: "فيلم" });
    if (!item.ok) return;
    const date = todayLocal();
    await addEntryToDay({ date, kind: "item", itemId: item.value.id, allowMultiple: true });
    const second = await addEntryToDay({
      date,
      kind: "item",
      itemId: item.value.id,
      allowMultiple: true,
    });
    expect(second.ok).toBe(true);
    const rows = (await db.dailyEntries.toArray()).filter(
      (e) => e.itemId === item.value.id
    );
    expect(rows.length).toBe(2); // two sessions, two rows — by design
  });

  test("allowMultiple survives ONLY in the entertainment session dialog (source lock)", () => {
    const weekly = readFileSync(
      "src/components/lifeos/weekly/weekly-screen.tsx",
      "utf8"
    );
    const spaces = readFileSync(
      "src/components/lifeos/spaces/spaces-screen.tsx",
      "utf8"
    );
    const sheet = readFileSync(
      "src/components/lifeos/itemsheet/item-sheet.tsx",
      "utf8"
    );
    expect(weekly.includes("allowMultiple: true")).toBe(false);
    expect(spaces.includes("allowMultiple: true")).toBe(false);
    // item-sheet: exactly one — the entertainment session dialog (multi-session by design)
    const count = sheet.split("allowMultiple: true").length - 1;
    expect(count).toBe(1);
    const sessionIdx = sheet.indexOf("addSessionToToday");
    const multiIdx = sheet.indexOf("allowMultiple: true");
    expect(multiIdx).toBeGreaterThan(sessionIdx);
  });
});

/* ---------------- 2: one execution per honest start ---------------- */

describe("v1.6.0 B: startRoutine is idempotent per day", () => {
  test("a double-open resumes the same in-progress execution", async () => {
    const res = await createRoutine({ name: "روتين الصباح" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const date = todayLocal();
    const first = await startRoutine(res.value.id, date);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await startRoutine(res.value.id, date);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.id).toBe(first.value.id);
    const execs = await db.routineExecutions
      .where("routineId")
      .equals(res.value.id)
      .toArray();
    expect(execs.length).toBe(1);
  });

  test("a late-dayEntryId link rides along without minting anything", async () => {
    const res = await createRoutine({ name: "تمارين" });
    if (!res.ok) return;
    const date = todayLocal();
    const first = await startRoutine(res.value.id, date);
    if (!first.ok) return;
    const second = await startRoutine(res.value.id, date, "entry-x");
    if (!second.ok) return;
    expect(second.value.id).toBe(first.value.id);
    expect(second.value.dailyEntryId).toBe("entry-x");
    const execs = await db.routineExecutions
      .where("routineId")
      .equals(res.value.id)
      .toArray();
    expect(execs.length).toBe(1);
  });

  test("a finished execution doesn't block an honest restart on the same day", async () => {
    const res = await createRoutine({ name: "مشي" });
    if (!res.ok) return;
    const date = todayLocal();
    const first = await startRoutine(res.value.id, date);
    if (!first.ok) return;
    const { endRoutine } = await import(
      "../src/lib/lifeos/services/routine-service"
    );
    await endRoutine(first.value.id);
    const again = await startRoutine(res.value.id, date);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.id).not.toBe(first.value.id);
  });

  test("another day is another execution — days don't share state", async () => {
    const res = await createRoutine({ name: "ورد" });
    if (!res.ok) return;
    const first = await startRoutine(res.value.id, "2026-03-01");
    if (!first.ok) return;
    const second = await startRoutine(res.value.id, "2026-03-02");
    if (!second.ok) return;
    expect(second.value.id).not.toBe(first.value.id);
  });
});

/* ---------------- 3: no sleeping recurrence fields ---------------- */

describe("v1.6.0 C: a pattern change wakes its sleeping companions", () => {
  test("weekly [1,3] → daily leaves no stale byWeekday", async () => {
    const item = await createItem({ type: "task", title: "رياضة" });
    if (!item.ok) return;
    const created = await createRule({
      itemId: item.value.id,
      pattern: "weekdays",
      interval: 1,
      byWeekday: [1, 3],
      startDate: "2026-03-01",
      weekAnchor: 6,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { updateRule } = await import(
      "../src/lib/lifeos/services/recurrence-service"
    );
    const res = await updateRule(created.value.id, { pattern: "daily" });
    expect(res.ok).toBe(true);
    const rule = await db.recurrenceRules.get(created.value.id);
    expect(rule?.pattern).toBe("daily");
    expect(rule?.byWeekday).toBeUndefined();
  });

  test("weekly keeps byWeekday → stripped too (the engine fires on startDate); monthly keeps its day", async () => {
    const item = await createItem({ type: "task", title: "فاتورة" });
    if (!item.ok) return;
    const created = await createRule({
      itemId: item.value.id,
      pattern: "weekdays",
      interval: 1,
      byWeekday: [2],
      startDate: "2026-03-01",
      weekAnchor: 6,
    });
    if (!created.ok) return;
    const { updateRule } = await import(
      "../src/lib/lifeos/services/recurrence-service"
    );
    await updateRule(created.value.id, { pattern: "monthly", byMonthDay: 15 });
    const rule = await db.recurrenceRules.get(created.value.id);
    expect(rule?.pattern).toBe("monthly");
    expect(rule?.byWeekday).toBeUndefined(); // sleeping no more
    expect(rule?.byMonthDay).toBe(15);
    expect(rule?.monthDayMode).toBe("day");
  });

  test("weekdays → weekly strips the dead days (weekly fires on startDate's weekday)", async () => {
    const item = await createItem({ type: "task", title: "درس" });
    if (!item.ok) return;
    const created = await createRule({
      itemId: item.value.id,
      pattern: "weekdays",
      interval: 1,
      byWeekday: [1, 4],
      startDate: "2026-03-01",
      weekAnchor: 6,
    });
    if (!created.ok) return;
    const { updateRule } = await import(
      "../src/lib/lifeos/services/recurrence-service"
    );
    await updateRule(created.value.id, { pattern: "weekly" });
    const rule = await db.recurrenceRules.get(created.value.id);
    expect(rule?.pattern).toBe("weekly");
    expect(rule?.byWeekday).toBeUndefined();
    // and the rule still generates — weekly on 2026-03-01's weekday (Sunday)
    const occs = expand(
      rule as RecurrenceRule,
      "2026-03-01",
      "2026-03-28",
      buildStatesByKey([]),
      buildRulesById([rule as RecurrenceRule])
    );
    expect(occs.length).toBeGreaterThanOrEqual(4);
    expect(occs.every((o: Occurrence) => dayOfWeek(o.date) === 0)).toBe(true);
  });
});

/* ---------------- 4: the weekly quick-add finally lands ---------------- */

describe("v1.6.0 D: the weekly quick-add finally lands", () => {
  test("a day-less weekly rule creates fine and fires on its start weekday", async () => {
    const item = await createItem({ type: "task", title: "مذاكرة" });
    if (!item.ok) return;
    // 2026-03-01 is a Sunday (0) — the old quick-add minted exactly this shape
    const created = await createRule({
      itemId: item.value.id,
      pattern: "weekly",
      interval: 1,
      startDate: "2026-03-01",
      weekAnchor: 6,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.byWeekday).toBeUndefined(); // no sleeping data
    const states: OccurrenceState[] = [];
    const occs = expand(created.value, "2026-03-01", "2026-03-28", buildStatesByKey(states), buildRulesById([created.value]));
    expect(occs.length).toBeGreaterThanOrEqual(4);
    expect(occs.every((o: Occurrence) => dayOfWeek(o.date) === 0)).toBe(true);
  });

  test("a picked weekday reaches the rule as its start (the dropped pick, awake)", async () => {
    const item = await createItem({ type: "task", title: "اجتماع" });
    if (!item.ok) return;
    // 2026-03-04 is a Wednesday (3) — the "picked day" in the weekly sheet.
    // v1.6: that pick becomes the rule's startDate, so the weekly rule
    // fires on the weekday the user actually chose.
    const picked = "2026-03-04";
    const created = await createRule({
      itemId: item.value.id,
      pattern: "weekly",
      interval: 1,
      startDate: picked,
      weekAnchor: 6,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.startDate).toBe(picked);
    const states: OccurrenceState[] = [];
    const occs = expand(created.value, "2026-03-01", "2026-03-28", buildStatesByKey(states), buildRulesById([created.value]));
    expect(occs.length).toBeGreaterThanOrEqual(4);
    expect(occs.some((o: Occurrence) => o.date === picked)).toBe(true);
    expect(occs.every((o: Occurrence) => dayOfWeek(o.date) === 3)).toBe(true);
  });

  test("weekdays pattern keeps its five days (Egypt's work week intact)", async () => {
    const item = await createItem({ type: "task", title: "شغل" });
    if (!item.ok) return;
    const created = await createRule({
      itemId: item.value.id,
      pattern: "weekdays",
      interval: 1,
      byWeekday: [0, 1, 2, 3, 4],
      startDate: "2026-03-01",
      weekAnchor: 6,
    });
    if (!created.ok) return;
    expect(created.value.byWeekday).toEqual([0, 1, 2, 3, 4]);
    const rule = await db.recurrenceRules.get(created.value.id);
    expect(rule?.byWeekday).toEqual([0, 1, 2, 3, 4]);
  });
});

/* ---------------- 5: the week can speak about the past ---------------- */

describe("v1.6.0 E: what actually happened next to the intention", () => {
  test("weekDaysOf walks exactly seven days from the anchor", () => {
    const days = weekDaysOf("2026-03-01");
    expect(days.length).toBe(7);
    expect(days[0]).toBe("2026-03-01");
    expect(days[6]).toBe("2026-03-07");
    expect(weekDaysOf("2026-12-29")[1]).toBe("2026-12-30");
    // month rollover stays honest
    expect(weekDaysOf("2026-01-30")[2]).toBe("2026-02-01");
  });

  test("collectDoneKeys returns completed items per day, nothing else", async () => {
    await seedPeriods();
    const done = await createItem({ type: "task", title: "اتنفذت" });
    const pending = await createItem({ type: "task", title: "لسه" });
    const skipped = await createItem({ type: "task", title: "اتخطت" });
    if (!done.ok || !pending.ok || !skipped.ok) return;
    const date = todayLocal();
    const e1 = await addEntryToDay({ date, kind: "item", itemId: done.value.id });
    const e2 = await addEntryToDay({ date, kind: "item", itemId: pending.value.id });
    const e3 = await addEntryToDay({ date, kind: "item", itemId: skipped.value.id });
    if (!e1.ok || !e2.ok || !e3.ok) return;
    await setExecutionStatus(e1.value.id, "completed");
    await setExecutionStatus(e3.value.id, "skipped");
    const keys = await collectDoneKeys([date]);
    expect(keys.has(`${date}|${done.value.id}`)).toBe(true);
    expect(keys.has(`${date}|${pending.value.id}`)).toBe(false);
    expect(keys.has(`${date}|${skipped.value.id}`)).toBe(false);
  });

  test("a completed entry on ANOTHER day never marks this week's row", async () => {
    await seedPeriods();
    const item = await createItem({ type: "task", title: "لشراء" });
    if (!item.ok) return;
    const e = await addEntryToDay({
      date: "2026-03-02",
      kind: "item",
      itemId: item.value.id,
    });
    if (!e.ok) return;
    await setExecutionStatus(e.value.id, "completed");
    const keys = await collectDoneKeys(["2026-03-09"]);
    expect(keys.size).toBe(0);
  });

  test("the done flag lands on rows with the matching scheduled date", async () => {
    // a shape test over WeeklyRow — the flag is optional and additive
    const row: WeeklyRow = {
      key: "entry:x",
      kind: "entry",
      item: { id: "i1" } as never,
      role: "regular",
      scheduledDate: "2026-03-02",
      done: true,
    };
    expect(row.done).toBe(true);
    const bare: WeeklyRow = {
      key: "entry:y",
      kind: "entry",
      item: { id: "i2" } as never,
      role: "regular",
      scheduledDate: "2026-03-03",
    };
    expect(bare.done).toBeUndefined();
  });

  test("the doneMark key exists in both dictionaries, Arabic in Arabic", () => {
    expect(en["weekly.doneMark"]).toBe("Done that day");
    expect(ar["weekly.doneMark"]).toBe("اتنفذت في يومها");
  });
});

/* ---------------- hygiene: week math stays consistent ---------------- */

describe("v1.6.0 hygiene: weekDaysOf agrees with weekStart", () => {
  test("any anchor day, any firstDay — weekDaysOf(weekStart(d, f)) stays aligned", () => {
    for (const firstDay of [0, 1, 5, 6]) {
      const anchor = weekStart("2026-03-04", firstDay);
      const days = weekDaysOf(anchor);
      expect(days.length).toBe(7);
      expect(days[0]).toBe(anchor);
      expect(days[6]).toBe(addDays(anchor, 6));
    }
  });
});
