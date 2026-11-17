/* Render-layer integration tests (v1.3) — the assembly that feeds the
   Today screen, exercised end-to-end over fake-indexeddb with the REAL
   services: rules expand, entries materialize, periods resolve from
   prayer anchors (or a plan snapshot). The duplication regression that
   v1.2.1 fixed must never be able to return silently. */

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "../src/lib/lifeos/db";
import { DEFAULT_PRAYER, defaultPeriodSettings } from "../src/lib/lifeos/defaults";
import {
  buildTodayData,
  type TodayData,
} from "../src/lib/lifeos/services/today-assembly";
import {
  addEntryToDay,
  resolvePeriodsForDate,
} from "../src/lib/lifeos/services/planning-service";
import { createItem } from "../src/lib/lifeos/services/item-service";
import {
  buildRulesById,
  buildStatesByKey,
  cancelOccurrence,
  createRule,
  modifyOccurrence,
  ruleRootId,
  setRulePeriod,
} from "../src/lib/lifeos/services/recurrence-service";
import type { RecurrenceRule } from "../src/lib/lifeos/types";

const DAY = "2026-11-20";

/** The stable occurrence key for a rule on a date — the same composition
 *  expand() uses, through the same root-id walk. */
async function occurrenceKeyOf(rule: RecurrenceRule, date: string): Promise<string> {
  const rulesById = buildRulesById(await db.recurrenceRules.toArray());
  return `${ruleRootId(rule.id, rulesById)}:${date}`;
}

async function freshDb(): Promise<void> {
  await db.delete();
  await db.open();
}

function must<T>(res: { ok: boolean; value?: T }): T {
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("seed failed");
  return res.value as T;
}

async function makeItem(title: string): Promise<string> {
  return must(await createItem({ title, type: "task" })).id;
}

/** The exact data path useTodayData walks: plan snapshot if the day was
 *  materialized, fresh prayer-anchored periods otherwise. */
async function snapshot(date: string): Promise<TodayData> {
  const plan = await db.dailyPlans.where("date").equals(date).first();
  const periodRows = plan
    ? (
        await db.dailyPeriods.where("dailyPlanId").equals(plan.id).toArray()
      )
        .sort((a, b) => a.order - b.order)
        .map((p) => ({
          id: p.id,
          settingId: p.settingId,
          name: p.name,
          tagline: p.tagline,
          mode: p.mode,
          startTime: p.startTime,
          endTime: p.endTime,
          endDayOffset: p.endDayOffset,
          durationMinutes: p.durationMinutes,
          order: p.order,
        }))
    : resolvePeriodsForDate(date, defaultPeriodSettings(), DEFAULT_PRAYER);
  const entries = plan
    ? await db.dailyEntries.where("dailyPlanId").equals(plan.id).toArray()
    : [];
  return buildTodayData({
    date,
    plan,
    periodRows,
    entries,
    items: await db.items.toArray(),
    routines: [],
    rules: await db.recurrenceRules.toArray(),
    occStates: await db.occurrenceStates.toArray(),
  });
}

function rowsFor(data: TodayData, itemId: string) {
  return data.allRows.filter((r) => r.item?.id === itemId);
}

function rowKeysUnique(data: TodayData): boolean {
  return new Set(data.allRows.map((r) => r.key)).size === data.allRows.length;
}

function periodSectionOf(data: TodayData, settingId: string) {
  const p = data.periods.find((x) => x.settingId === settingId);
  if (!p) throw new Error("period not resolved: " + settingId);
  return { period: p, rows: data.byPeriod.get(p.id) ?? [] };
}

beforeAll(async () => {
  await freshDb();
});

beforeEach(async () => {
  for (const store of db.tables) await store.clear();
});

describe("render integration — the duplication regression can never return", () => {
  test("a materialized entry with occurrenceKey suppresses the virtual occurrence (one row, not two)", async () => {
    const item = await makeItem("قراءة قرآن");
    const rule = must(
      await createRule({
        itemId: item,
        pattern: "daily",
        interval: 1,
        startDate: DAY,
        weekAnchor: 6,
      })
    ) as RecurrenceRule;
    const key = await occurrenceKeyOf(rule, DAY);
    // what the pre-v1.2.1 quick-add used to do: place today's occurrence
    // as a manual entry — before the fix this DOUBLED the row.
    must(
      await addEntryToDay({
        date: DAY,
        kind: "item",
        itemId: item,
        occurrenceKey: key,
      })
    );

    const data = await snapshot(DAY);
    const rows = rowsFor(data, item);
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe("entry");
    expect(rowKeysUnique(data)).toBe(true);
  });

  test("the same rule on the NEXT day renders exactly one virtual occurrence (no plan, fresh periods)", async () => {
    const item = await makeItem("مشي ٣٠ دقيقة");
    must(
      await createRule({
        itemId: item,
        pattern: "daily",
        interval: 1,
        startDate: DAY,
        startTime: "07:30",
        weekAnchor: 6,
      })
    );

    const next = "2026-11-21";
    const data = await snapshot(next);
    const rows = rowsFor(data, item);
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe("occurrence");
    expect(rowKeysUnique(data)).toBe(true);
  });
});

describe("render integration — placement", () => {
  test("a rule with periodSettingId lands its occurrences in that period", async () => {
    const item = await makeItem("وِرد قبل النوم");
    must(
      await createRule({
        itemId: item,
        pattern: "daily",
        interval: 1,
        startDate: DAY,
        startTime: "21:00",
        periodSettingId: "ps-evening",
        weekAnchor: 6,
      })
    );

    const data = await snapshot(DAY);
    const rows = rowsFor(data, item);
    expect(rows.length).toBe(1);
    const { rows: evening } = periodSectionOf(data, "ps-evening");
    expect(evening.some((r) => r.item?.id === item)).toBe(true);
    expect(data.unplaced.length).toBe(0);
  });

  test("a rule with a time but no period is proposed into the period containing that time", async () => {
    const item = await makeItem("فطار و قراية");
    must(
      await createRule({
        itemId: item,
        pattern: "daily",
        interval: 1,
        startDate: DAY,
        startTime: "07:30",
        weekAnchor: 6,
      })
    );

    const data = await snapshot(DAY);
    const rows = rowsFor(data, item);
    expect(rows.length).toBe(1);
    // 07:30 in Cairo in November sits between Fajr and Dhuhr → morning
    const { period } = periodSectionOf(data, "ps-morning");
    expect(rows[0].periodId).toBe(period.id);
  });

  test("a per-day override moves ONE day only; the rule's home survives", async () => {
    const item = await makeItem("شغل على المشروع");
    const rule = must(
      await createRule({
        itemId: item,
        pattern: "daily",
        interval: 1,
        startDate: DAY,
        startTime: "21:00",
        periodSettingId: "ps-evening",
        weekAnchor: 6,
      })
    ) as RecurrenceRule;
    const key = await occurrenceKeyOf(rule, DAY);
    must(
      await modifyOccurrence(rule.id, key, DAY, {
        overridePeriodSettingId: "ps-morning",
      })
    );

    const today = await snapshot(DAY);
    const { rows: morning } = periodSectionOf(today, "ps-morning");
    expect(morning.some((r) => r.item?.id === item)).toBe(true);

    const tomorrow = await snapshot("2026-11-21");
    const { rows: evening } = periodSectionOf(tomorrow, "ps-evening");
    expect(evening.some((r) => r.item?.id === item)).toBe(true);
    expect(periodSectionOf(tomorrow, "ps-morning").rows.length).toBe(0);
  });

  test("خلّيه يعيش هنا؟ — setRulePeriod moves every following day into the period", async () => {
    const item = await makeItem("عادة قديمة من غير بيت");
    const rule = must(
      await createRule({
        itemId: item,
        pattern: "daily",
        interval: 1,
        startDate: DAY,
        weekAnchor: 6,
      })
    ) as RecurrenceRule;

    // before: no time, no home → genuinely unplaced (the chip's target case)
    const before = await snapshot(DAY);
    expect(rowsFor(before, item)[0].periodId).toBeUndefined();

    must(await setRulePeriod(rule.id, "ps-morning"));

    // after: the SAME day and every following day live in the morning
    const after = await snapshot(DAY);
    const { period } = periodSectionOf(after, "ps-morning");
    expect(rowsFor(after, item)[0].periodId).toBe(period.id);
    const next = await snapshot("2026-11-21");
    expect(rowsFor(next, item)[0].periodId).toBe(
      periodSectionOf(next, "ps-morning").period.id
    );
  });

  test("مش النهارده — a cancelled occurrence renders nowhere, tomorrow untouched", async () => {
    const item = await makeItem("جيم بعد الشغل");
    const rule = must(
      await createRule({
        itemId: item,
        pattern: "daily",
        interval: 1,
        startDate: DAY,
        weekAnchor: 6,
      })
    ) as RecurrenceRule;
    const key = await occurrenceKeyOf(rule, DAY);
    must(await cancelOccurrence(rule.id, key, DAY));

    const today = await snapshot(DAY);
    expect(rowsFor(today, item).length).toBe(0);

    const tomorrow = await snapshot("2026-11-21");
    expect(rowsFor(tomorrow, item).length).toBe(1);
  });
});
