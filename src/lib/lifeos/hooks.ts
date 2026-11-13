/* Data hooks — the only place that talks to Dexie on behalf of the UI (§12.3). */

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db } from "./db";
import { DEFAULT_PRAYER, SETTING_KEYS } from "./defaults";
import type { PrayerSettings } from "./prayer";
import {
  expand,
  buildRulesById,
  buildStatesByKey,
} from "./services/recurrence-service";
import { resolvePeriodsForDate, proposePeriodSettingId } from "./services/planning-service";
import { computeSuggestions, type ResumeTrigger } from "./services/resume-service";
import { todayLocal, weekStart } from "./dates";
import type {
  DailyEntry,
  DailyPeriod,
  DailyPlan,
  EntertainmentDetails,
  Item,
  NoteDetails,
  Occurrence,
  PeriodSetting,
  RecurrenceRule,
  ResolvedPeriod,
  ReturnNoteSettings,
  Routine,
  Space,
  WeeklyEntry,
  WeeklyPlan,
} from "./types";

export interface ViewPrefs {
  calendar: {
    firstDayOfWeek: number;
    dateFormat: string;
    timeFormat24: boolean;
  };
  prayer: PrayerSettings;
  todayView: "list" | "timeline";
  weeklyView: "list" | "timeline";
  inboxBadge: boolean;
}

const FALLBACK_PREFS: ViewPrefs = {
  calendar: { firstDayOfWeek: 6, dateFormat: "dmy", timeFormat24: false },
  prayer: DEFAULT_PRAYER,
  todayView: "list",
  weeklyView: "list",
  inboxBadge: true,
};

export function useViewPrefs(): ViewPrefs | undefined {
  return useLiveQuery(async () => {
    const rows = await db.appSettings.toArray();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const firstDay = (map.get(SETTING_KEYS.firstDayOfWeek) as number) ?? 6;
    return {
      calendar: {
        firstDayOfWeek: firstDay % 7,
        dateFormat: (map.get(SETTING_KEYS.dateFormat) as string) ?? "dmy",
        timeFormat24: (map.get(SETTING_KEYS.timeFormat24) as boolean) ?? false,
      },
      prayer: (map.get(SETTING_KEYS.prayer) as PrayerSettings) ?? DEFAULT_PRAYER,
      todayView: (map.get(SETTING_KEYS.todayView) as "list" | "timeline") ?? "list",
      weeklyView:
        (map.get(SETTING_KEYS.weeklyView) as "list" | "timeline") ?? "list",
      inboxBadge: (map.get(SETTING_KEYS.inboxBadge) as boolean) ?? true,
    };
  }, []);
}

/** The registered user's name. `undefined` = still loading, `null` = not registered yet. */
export function useUserName(): string | null | undefined {
  return useLiveQuery(async () => {
    const row = await db.appSettings.get(SETTING_KEYS.userName);
    return row ? ((row.value as string) ?? null) : null;
  }, []);
}

/** ISO date (YYYY-MM-DD) of registration, if any. */
export function useRegisteredAt(): string | null | undefined {
  return useLiveQuery(async () => {
    const row = await db.appSettings.get(SETTING_KEYS.registeredAt);
    return row ? ((row.value as string) ?? null) : null;
  }, []);
}

export function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return tick;
}

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

export function useTodayData(date: string): TodayData | undefined {
  const plan = useLiveQuery(
    () => db.dailyPlans.where("date").equals(date).first(),
    [date]
  );
  const tick = useMinuteTick();

  const periodRows = useLiveQuery(
    async () => {
      if (plan) {
        const rows = await db.dailyPeriods
          .where("dailyPlanId")
          .equals(plan.id)
          .toArray();
        return rows
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
          }));
      }
      const settings = await db.periodSettings.orderBy("order").toArray();
      const prayerRow = await db.appSettings.get(SETTING_KEYS.prayer);
      const prayer = (prayerRow?.value as PrayerSettings) ?? DEFAULT_PRAYER;
      return resolvePeriodsForDate(date, settings, prayer);
    },
    [date, plan?.id]
  );

  const entries = useLiveQuery(
    () =>
      plan
        ? db.dailyEntries.where("dailyPlanId").equals(plan.id).toArray()
        : Promise.resolve([] as DailyEntry[]),
    [plan?.id]
  );

  const items = useLiveQuery(() => db.items.toArray(), []);
  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const rules = useLiveQuery(() => db.recurrenceRules.toArray(), []);
  const occStates = useLiveQuery(() => db.occurrenceStates.toArray(), []);

  return useMemo(() => {
    if (!periodRows || !entries || items === undefined || routines === undefined || rules === undefined || occStates === undefined) {
      return undefined;
    }
    void tick;
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
    const sortRows = (a: TodayRow, b: TodayRow) =>
      (a.entry?.sortOrder ?? "") < (b.entry?.sortOrder ?? "") ? -1 : 1;
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
      void sortRows;
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
  }, [date, plan, periodRows, entries, items, routines, rules, occStates, tick]);
}

export interface WeeklyRow {
  key: string;
  kind: "entry" | "occurrence";
  entry?: WeeklyEntry;
  occurrence?: Occurrence;
  item: Item;
  role: "regular" | "outcome";
  scheduledDate?: string;
  occurrenceKey?: string;
}

export interface WeeklyData {
  weekStart: string;
  weekEnd: string;
  days: string[];
  plan: WeeklyPlan | undefined;
  rows: WeeklyRow[];
  unscheduled: WeeklyRow[];
  byDay: Map<string, WeeklyRow[]>;
  outcomes: WeeklyRow[];
  hasIncompleteInPastWeek: boolean;
}

export function useWeeklyData(weekStartDate: string, firstDay: number): WeeklyData | undefined {
  const plan = useLiveQuery(
    () => db.weeklyPlans.where("startDate").equals(weekStartDate).first(),
    [weekStartDate]
  );
  const entries = useLiveQuery(
    () =>
      plan
        ? db.weeklyEntries.where("weeklyPlanId").equals(plan.id).toArray()
        : Promise.resolve([] as WeeklyEntry[]),
    [plan?.id]
  );
  const items = useLiveQuery(() => db.items.toArray(), []);
  const rules = useLiveQuery(() => db.recurrenceRules.toArray(), []);
  const occStates = useLiveQuery(() => db.occurrenceStates.toArray(), []);
  const today = todayLocal();

  return useMemo(() => {
    if (!entries || items === undefined || rules === undefined || occStates === undefined) {
      return undefined;
    }
    void plan;
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const weekStartStr = weekStartDate;
    const days: string[] = [];
    const [y, m, d] = weekStartStr.split("-").map(Number);
    for (let i = 0; i < 7; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i));
      days.push(
        `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
          dt.getUTCDate()
        ).padStart(2, "0")}`
      );
    }
    const weekEnd = days[6];
    void firstDay;

    const materializedKeys = new Set(
      entries.filter((e) => e.occurrenceKey).map((e) => e.occurrenceKey as string)
    );
    const statesByKey = buildStatesByKey(occStates);
    const rulesById = buildRulesById(rules);
    const occurrences: Occurrence[] = [];
    for (const rule of rules) {
      if (!rule.itemId && !rule.routineId) continue;
      occurrences.push(...expand(rule, weekStartStr, weekEnd, statesByKey, rulesById));
    }
    const virtualOccurrences = occurrences.filter(
      (o) => !o.cancelled && !materializedKeys.has(o.occurrenceKey)
    );

    const rows: WeeklyRow[] = [];
    for (const entry of entries) {
      const item = itemsById.get(entry.itemId);
      if (!item) continue;
      rows.push({
        key: `entry:${entry.id}`,
        kind: "entry",
        entry,
        item,
        role: entry.role,
        scheduledDate: entry.scheduledDate,
        occurrenceKey: entry.occurrenceKey,
      });
    }
    for (const occ of virtualOccurrences) {
      const item = occ.itemId ? itemsById.get(occ.itemId) : undefined;
      if (!item) continue;
      rows.push({
        key: `occ:${occ.occurrenceKey}`,
        kind: "occurrence",
        occurrence: occ,
        item,
        role: "regular",
        scheduledDate: occ.date,
        occurrenceKey: occ.occurrenceKey,
      });
    }

    const byDay = new Map<string, WeeklyRow[]>();
    for (const day of days) byDay.set(day, []);
    const unscheduled: WeeklyRow[] = [];
    const outcomes: WeeklyRow[] = [];
    for (const row of rows) {
      if (row.role === "outcome") outcomes.push(row);
      if (row.scheduledDate && byDay.has(row.scheduledDate)) {
        byDay.get(row.scheduledDate)!.push(row);
      } else if (row.role !== "outcome") {
        unscheduled.push(row);
      }
    }
    const sortOrderOf = (r: WeeklyRow) => r.entry?.sortOrder ?? r.key ?? "";
    for (const list of byDay.values()) {
      list.sort((a, b) => (sortOrderOf(a) < sortOrderOf(b) ? -1 : 1));
    }
    unscheduled.sort((a, b) => (sortOrderOf(a) < sortOrderOf(b) ? -1 : 1));
    const hasIncompleteInPastWeek =
      weekEnd < today &&
      rows.some(
        (r) => r.item.status !== "completed" && r.item.status !== "cancelled"
      );
    return {
      weekStart: weekStartStr,
      weekEnd,
      days,
      plan,
      rows,
      unscheduled,
      byDay,
      outcomes,
      hasIncompleteInPastWeek,
    };
  }, [weekStartDate, plan, entries, items, rules, occStates, firstDay, today]);
}

export function useInboxData() {
  return useLiveQuery(async () => {
    const entries = await db.inboxEntries.toArray();
    const items = await db.items.toArray();
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const rows = entries
      .map((entry) => ({ entry, item: itemsById.get(entry.itemId) }))
      .filter((r): r is { entry: (typeof entries)[number]; item: Item } => !!r.item)
      .filter((r) => r.item.status !== "archived" && !r.item.archivedAt)
      .sort((a, b) => (a.entry.sortOrder < b.entry.sortOrder ? -1 : 1));
    return { rows, total: entries.length };
  }, []);
}

export function useSpaces(): { active: Space[]; archived: Space[] } | undefined {
  return useLiveQuery(async () => {
    const spaces = await db.spaces.toArray();
    const sorted = spaces.sort((a, b) =>
      a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0
    );
    return {
      active: sorted.filter((s) => !s.archivedAt),
      archived: sorted.filter((s) => s.archivedAt),
    };
  }, []);
}

export function useSpaceData(spaceId: string) {
  return useLiveQuery(async () => {
    const space = await db.spaces.get(spaceId);
    if (!space) return null;
    const links = await db.itemSpaceLinks
      .where("spaceId")
      .equals(spaceId)
      .toArray();
    const linkByItem = new Map(links.map((l) => [l.itemId, l]));
    const items = (await db.items.bulkGet(links.map((l) => l.itemId))).filter(
      (i): i is Item => !!i
    );
    const dailyEntries = await db.dailyEntries.toArray();
    const dailyPlans = await db.dailyPlans.toArray();
    const dateByPlan = new Map(dailyPlans.map((p) => [p.id, p.date]));
    const today = todayLocal();
    const todayItemIds = new Set(
      dailyEntries
        .filter((e) => dateByPlan.get(e.dailyPlanId) === today && e.itemId)
        .map((e) => e.itemId as string)
    );
    const weeklyEntries = await db.weeklyEntries.toArray();
    const weeklyPlans = await db.weeklyPlans.toArray();
    const weekStartById = new Map(
      weeklyPlans.map((p) => [p.id, p.startDate])
    );
    const thisWeekStart = weekStart(today, 6);
    const weekItemIds = new Set(
      weeklyEntries
        .filter(
          (e) => weekStartById.get(e.weeklyPlanId) === thisWeekStart
        )
        .map((e) => e.itemId)
    );
    return {
      space,
      links,
      linkByItem,
      items: items.sort((a, b) =>
        (linkByItem.get(a.id)?.sortOrder ?? "") <
          (linkByItem.get(b.id)?.sortOrder ?? "")
          ? -1
          : 1
      ),
      todayItemIds,
      weekItemIds,
    };
  }, [spaceId]);
}

export function useNotes() {
  return useLiveQuery(async () => {
    const noteRows = await db.noteDetails.toArray();
    const items = await db.items.bulkGet(noteRows.map((n) => n.itemId));
    const returnSettings = await db.returnNoteSettings.toArray();
    const settingsByNote = new Map(
      returnSettings.map((s) => [s.noteItemId, s])
    );
    const rows = noteRows
      .map((details, i) => ({
        details,
        item: items[i],
        settings: settingsByNote.get(details.itemId),
      }))
      .filter(
        (r): r is { details: NoteDetails; item: Item; settings: ReturnNoteSettings | undefined } =>
          !!r.item && r.item.status !== "archived" && !r.item.archivedAt
      )
      .sort((a, b) => b.details.updatedAt - a.details.updatedAt);
    return rows;
  }, []);
}

export function useNoteEditor(itemId: string) {
  return useLiveQuery(async () => {
    const item = await db.items.get(itemId);
    const details = await db.noteDetails.get(itemId);
    const settings = await db.returnNoteSettings.get(itemId);
    if (!item || !details) return null;
    return { item, details, settings };
  }, [itemId]);
}

export function useEntertainment() {
  return useLiveQuery(async () => {
    const details = await db.entertainmentDetails.toArray();
    const items = await db.items.bulkGet(details.map((d) => d.itemId));
    const rows = details
      .map((d, i) => ({ details: d, item: items[i] }))
      .filter((r): r is { details: EntertainmentDetails; item: Item } => !!r.item)
      .filter((r) => r.item.status !== "archived" && !r.item.archivedAt);
    return rows;
  }, []);
}

export function useRoutines() {
  return useLiveQuery(async () => {
    const routines = await db.routines.toArray();
    const items = await db.routineItems.toArray();
    const active = routines
      .filter((r) => !r.archivedAt)
      .sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : 1));
    const archived = routines.filter((r) => r.archivedAt);
    const itemsByRoutine = new Map<string, typeof items>();
    for (const ri of items) {
      const list = itemsByRoutine.get(ri.routineId) ?? [];
      list.push(ri);
      itemsByRoutine.set(ri.routineId, list);
    }
    for (const list of itemsByRoutine.values()) {
      list.sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : 1));
    }
    return { active, archived, itemsByRoutine };
  }, []);
}

export function usePeriodSettings(): PeriodSetting[] | undefined {
  return useLiveQuery(
    () => db.periodSettings.orderBy("order").toArray(),
    []
  );
}

export function useArchivedItems() {
  return useLiveQuery(async () => {
    const items = await db.items.toArray();
    const spaces = await db.spaces.toArray();
    const inbox = await db.inboxEntries.toArray();
    const inboxIds = new Set(inbox.map((e) => e.itemId));
    return {
      items: items.filter((i) => i.status === "archived" || i.archivedAt),
      spaces: spaces.filter((s) => s.archivedAt),
      inboxCount: inbox.length,
    };
  }, []);
}

export function useInboxCount(): number {
  const data = useLiveQuery(async () => {
    const entries = await db.inboxEntries.toArray();
    const items = await db.items.toArray();
    const itemsById = new Map(items.map((i) => [i.id, i]));
    return entries.filter((e) => {
      const item = itemsById.get(e.itemId);
      return item && item.status !== "archived" && !item.archivedAt;
    }).length;
  }, []);
  return data ?? 0;
}

export function useResumeSuggestions(trigger: ResumeTrigger) {
  const tick = useMinuteTick();
  return useLiveQuery(async () => {
    void tick;
    const [
      returnSettings,
      markers,
      items,
      spaces,
      dailyEntries,
      dailyPlans,
      weeklyEntries,
      projectRows,
      states,
    ] = await Promise.all([
      db.returnNoteSettings.toArray(),
      db.resumeMarkers.toArray(),
      db.items.toArray(),
      db.spaces.toArray(),
      db.dailyEntries.toArray(),
      db.dailyPlans.toArray(),
      db.weeklyEntries.toArray(),
      db.projectDetails.toArray(),
      db.resumeSuggestionStates.toArray(),
    ]);
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const dateByPlan = new Map(dailyPlans.map((p) => [p.id, p.date]));
    const today = todayLocal();
    const notes = returnSettings
      .map((settings) => ({ settings, item: itemsById.get(settings.noteItemId) }))
      .filter(
        (n): n is { settings: (typeof returnSettings)[number]; item: Item } =>
          !!n.item && n.item.status !== "archived"
      );
    return computeSuggestions({
      today,
      now: Date.now(),
      trigger,
      returnNotes: notes,
      markers,
      itemsById,
      spacesById: new Map(spaces.map((s) => [s.id, s])),
      dailyPlacements: dailyEntries.flatMap((e) =>
        e.itemId ? [{ itemId: e.itemId, date: dateByPlan.get(e.dailyPlanId) ?? "" }] : []
      ),
      weeklyPlacements: weeklyEntries.map((e) => ({
        itemId: e.itemId,
        scheduledDate: e.scheduledDate,
      })),
      projectTargetDates: projectRows.flatMap((p) =>
        p.targetDate ? [{ itemId: p.itemId, targetDate: p.targetDate }] : []
      ),
      todayItemIds: new Set(
        dailyEntries
          .filter((e) => dateByPlan.get(e.dailyPlanId) === today && e.itemId)
          .map((e) => e.itemId as string)
      ),
      states,
    });
  }, [trigger, tick]);
}

export function useReviewData(weekStartDate: string) {
  return useLiveQuery(async () => {
    const plan = await db.weeklyPlans.where("startDate").equals(weekStartDate).first();
    const review = plan
      ? await db.weeklyReviews.where("weeklyPlanId").equals(plan.id).first()
      : undefined;
    return { plan, review };
  }, [weekStartDate]);
}

export function useItemDetail(itemId: string | null) {
  return useLiveQuery(async () => {
    if (!itemId) return null;
    const item = await db.items.get(itemId);
    if (!item) return null;
    const [
      links,
      rels,
      project,
      note,
      entertainment,
      inboxEntry,
      dailyEntries,
      dailyPlans,
      weeklyEntries,
      weeklyPlans,
      rules,
      markers,
    ] = await Promise.all([
      db.itemSpaceLinks.where("itemId").equals(itemId).toArray(),
      db.itemRelationships
        .filter((r) => r.sourceItemId === itemId || r.targetItemId === itemId)
        .toArray(),
      db.projectDetails.get(itemId),
      db.noteDetails.get(itemId),
      db.entertainmentDetails.get(itemId),
      db.inboxEntries.where("itemId").equals(itemId).first(),
      db.dailyEntries.where("itemId").equals(itemId).toArray(),
      db.dailyPlans.toArray(),
      db.weeklyEntries.where("itemId").equals(itemId).toArray(),
      db.weeklyPlans.toArray(),
      db.recurrenceRules.where("itemId").equals(itemId).toArray(),
      db.resumeMarkers.where("itemId").equals(itemId).toArray(),
    ]);
    const spaces = await db.spaces.bulkGet(links.map((l) => l.spaceId));
    const dateByPlan = new Map(dailyPlans.map((p) => [p.id, p.date]));
    const weekByPlan = new Map(weeklyPlans.map((p) => [p.id, p]));
    const relatedItemIds = new Set<string>();
    for (const rel of rels) {
      relatedItemIds.add(rel.sourceItemId);
      relatedItemIds.add(rel.targetItemId);
    }
    relatedItemIds.delete(itemId);
    const relatedItems = (await db.items.bulkGet([...relatedItemIds])).filter(
      (i): i is Item => !!i
    );
    return {
      item,
      spaces: spaces.filter((s): s is Space => !!s),
      links,
      rels,
      relatedItems,
      project,
      note,
      entertainment,
      inInbox: !!inboxEntry,
      onToday: dailyEntries
        .map((e) => dateByPlan.get(e.dailyPlanId))
        .filter((d): d is string => !!d)
        .sort()
        .slice(-6),
      onWeekly: weeklyEntries
        .map((e) => weekByPlan.get(e.weeklyPlanId))
        .filter((w): w is WeeklyPlan => !!w)
        .map((w) => w.startDate)
        .sort()
        .slice(-6),
      rules,
      markers,
    };
  }, [itemId]);
}

export type { DailyPeriod };
