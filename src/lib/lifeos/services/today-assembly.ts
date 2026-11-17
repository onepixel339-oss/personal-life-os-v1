/* Today assembly (v1.3) — the pure heart of the Today screen: entries +
   virtual occurrences → one ordered row list, split by period.
   Extracted from useTodayData so the rendering layer can be
   integration-tested directly: duplication and placement regressions
   are caught here, not on someone's phone. */

import type {
  DailyEntry,
  DailyPlan,
  Item,
  Occurrence,
  OccurrenceState,
  RecurrenceRule,
  ResolvedPeriod,
  Routine,
} from "../types";
import {
  buildRulesById,
  buildStatesByKey,
  expand,
} from "./recurrence-service";
import { proposePeriodSettingId } from "./planning-service";

export interface TodayRow {
  key: string;
  kind: "entry" | "occurrence";
  entry?: DailyEntry;
  occurrence?: Occurrence;
  item?: Item;
  routine?: Routine;
  title: string;
  executionStatus: "pending" | "completed" | "skipped" | "partial";
  periodId?: string;
  periodSettingId?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  occurrenceKey?: string;
  isRecurring: boolean;
}

export interface TodayData {
  date: string;
  plan: DailyPlan | undefined;
  periods: (ResolvedPeriod & { settingId?: string })[];
  byPeriod: Map<string, TodayRow[]>;
  unplaced: TodayRow[];
  allRows: TodayRow[];
  itemsById: Map<string, Item>;
  routinesById: Map<string, Routine>;
  materializedOccurrenceKeys: Set<string>;
}

export interface TodayAssemblyInput {
  date: string;
  plan: DailyPlan | undefined;
  periodRows: (ResolvedPeriod & { settingId?: string })[];
  entries: DailyEntry[];
  items: Item[];
  routines: Routine[];
  rules: RecurrenceRule[];
  occStates: OccurrenceState[];
}

export function buildTodayData(input: TodayAssemblyInput): TodayData {
  const { date, plan, periodRows, entries, items, routines, rules, occStates } =
    input;
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const routinesById = new Map(routines.map((r) => [r.id, r]));
  const materializedOccurrenceKeys = new Set(
    entries
      .filter((e) => e.occurrenceKey)
      .map((e) => e.occurrenceKey as string)
  );

  const statesByKey = buildStatesByKey(occStates);
  const rulesById = buildRulesById(rules);
  const occurrences: Occurrence[] = [];
  for (const rule of rules) {
    if (!rule.itemId && !rule.routineId) continue;
    occurrences.push(...expand(rule, date, date, statesByKey, rulesById));
  }
  const virtualOccurrences = occurrences.filter(
    (o) =>
      o.date === date &&
      !o.cancelled &&
      !materializedOccurrenceKeys.has(o.occurrenceKey)
  );

  const periodBySetting = new Map<string, ResolvedPeriod>();
  for (const p of periodRows) {
    if (p.settingId) periodBySetting.set(p.settingId, p);
  }

  const rows: TodayRow[] = [];
  for (const entry of entries) {
    const item = entry.itemId ? itemsById.get(entry.itemId) : undefined;
    const routine = entry.routineId ? routinesById.get(entry.routineId) : undefined;
    rows.push({
      key: `entry:${entry.id}`,
      kind: "entry",
      entry,
      item,
      routine,
      title: item?.title ?? routine?.name ?? "",
      executionStatus: entry.executionStatus,
      periodId: entry.periodId,
      startTime: entry.startTime,
      endTime: entry.endTime,
      durationMinutes: entry.durationMinutes,
      occurrenceKey: entry.occurrenceKey,
      isRecurring: !!entry.occurrenceKey,
    });
  }
  for (const occ of virtualOccurrences) {
    const item = occ.itemId ? itemsById.get(occ.itemId) : undefined;
    const routine = occ.routineId ? routinesById.get(occ.routineId) : undefined;
    let periodId: string | undefined;
    if (occ.periodSettingId) {
      periodId = periodBySetting.get(occ.periodSettingId)?.id;
    } else if (occ.startTime) {
      const proposed = proposePeriodSettingId(periodRows, occ.startTime);
      periodId = proposed ? periodBySetting.get(proposed)?.id : undefined;
    }
    rows.push({
      key: `occ:${occ.occurrenceKey}`,
      kind: "occurrence",
      occurrence: occ,
      item,
      routine,
      title: occ.title || item?.title || routine?.name || "",
      executionStatus: occ.executionStatus,
      periodId,
      periodSettingId: occ.periodSettingId,
      startTime: occ.startTime,
      endTime: occ.endTime,
      durationMinutes: occ.durationMinutes,
      occurrenceKey: occ.occurrenceKey,
      isRecurring: true,
    });
  }

  const byPeriod = new Map<string, TodayRow[]>();
  for (const p of periodRows) byPeriod.set(p.id, []);
  const unplaced: TodayRow[] = [];
  for (const row of rows) {
    if (row.periodId && byPeriod.has(row.periodId)) {
      byPeriod.get(row.periodId)!.push(row);
    } else {
      unplaced.push(row);
    }
  }
  for (const list of byPeriod.values()) {
    list.sort((a, b) => {
      const sa = a.entry?.sortOrder ?? a.occurrenceKey ?? "";
      const sb = b.entry?.sortOrder ?? b.occurrenceKey ?? "";
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
  }
  unplaced.sort((a, b) => {
    const sa = a.entry?.sortOrder ?? a.occurrenceKey ?? "";
    const sb = b.entry?.sortOrder ?? b.occurrenceKey ?? "";
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return {
    date,
    plan,
    periods: periodRows,
    byPeriod,
    unplaced,
    allRows: rows,
    itemsById,
    routinesById,
    materializedOccurrenceKeys,
  };
}
