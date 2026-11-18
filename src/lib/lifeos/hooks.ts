/* Data hooks — the only place that talks to Dexie on behalf of the UI (§12.3). */

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db } from "./db";
import { DEFAULT_FIRST_DAY, DEFAULT_PRAYER, SETTING_KEYS } from "./defaults";
import type { PrayerSettings } from "./prayer";
import {
  expand,
  buildRulesById,
  buildStatesByKey,
} from "./services/recurrence-service";
import { resolvePeriodsForDate } from "./services/planning-service";
import { getWeekBridgeItems, type WeekBridgeRow } from "./services/planning-service";
import { buildTodayData, type TodayData } from "./services/today-assembly";
import { computeSuggestions, type ResumeTrigger } from "./services/resume-service";
import { buildWeekInsights, type InsightsInput } from "./services/review-insights";
import type { StripEntry } from "./services/week-strip";
import { lifeDayFor } from "./day-boundary";
import { addDays, localDayStartMs, weekStart } from "./dates";
import type {
  DailyEntry,
  DailyPeriod,
  EntertainmentDetails,
  Item,
  NoteDetails,
  Occurrence,
  PeriodSetting,
  ReturnNoteSettings,
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
  /** v1.5 — where the life-day flips */
  dayStart: "fajr" | "midnight";
  todayView: "list" | "timeline";
  weeklyView: "list" | "timeline";
  inboxBadge: boolean;
}

export function useViewPrefs(): ViewPrefs | undefined {
  return useLiveQuery(async () => {
    const rows = await db.appSettings.toArray();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const firstDay =
      (map.get(SETTING_KEYS.firstDayOfWeek) as number) ?? DEFAULT_FIRST_DAY;
    return {
      calendar: {
        firstDayOfWeek: firstDay % 7,
        dateFormat: (map.get(SETTING_KEYS.dateFormat) as string) ?? "dmy",
        timeFormat24: (map.get(SETTING_KEYS.timeFormat24) as boolean) ?? false,
      },
      prayer: (map.get(SETTING_KEYS.prayer) as PrayerSettings) ?? DEFAULT_PRAYER,
      dayStart:
        (map.get(SETTING_KEYS.dayStart) as "fajr" | "midnight") ?? "fajr",
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

/** The Fajr-relative "life day" (v1.2): before Fajr it is still yesterday.
    Re-evaluates on the minute tick and whenever prayer settings change. */
export function useLifeToday(): string {
  const prefs = useViewPrefs();
  const tick = useMinuteTick();
  void tick;
  return lifeDayFor(prefs);
}

/* TodayRow / TodayData + the pure row assembly live in services/today-assembly
   since v1.3, so the rendering layer can be integration-tested directly. */
export type { TodayRow, TodayData } from "./services/today-assembly";

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
    return buildTodayData({
      date,
      plan,
      periodRows,
      entries,
      items,
      routines,
      rules,
      occStates,
    });
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
      // v1.5: a scheduled outcome used to appear TWICE — pinned above and in
      // its day column. It stays pinned (with its day noted) and leaves the
      // day column to the week's regular work.
      if (row.role === "outcome") {
        outcomes.push(row);
        continue;
      }
      if (row.scheduledDate && byDay.has(row.scheduledDate)) {
        byDay.get(row.scheduledDate)!.push(row);
      } else {
        unscheduled.push(row);
      }
    }
    const sortOrderOf = (r: WeeklyRow) => r.entry?.sortOrder ?? r.key ?? "";
    for (const list of byDay.values()) {
      list.sort((a, b) => (sortOrderOf(a) < sortOrderOf(b) ? -1 : 1));
    }
    unscheduled.sort((a, b) => (sortOrderOf(a) < sortOrderOf(b) ? -1 : 1));
    return {
      weekStart: weekStartStr,
      weekEnd,
      days,
      plan,
      rows,
      unscheduled,
      byDay,
      outcomes,
    };
  }, [weekStartDate, plan, entries, items, rules, occStates, firstDay]);
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
  const prefs = useViewPrefs();
  const tick = useMinuteTick();
  return useLiveQuery(async () => {
    void tick;
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
    const today = lifeDayFor(prefs);
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
    // v1.5: the space's "this week" chip follows the user's week-start
    // setting — it used to be a hardcoded Saturday.
    const thisWeekStart = weekStart(
      today,
      prefs?.calendar.firstDayOfWeek ?? DEFAULT_FIRST_DAY
    );
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
  }, [spaceId, prefs, tick]);
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

/** v1.5: the week → day bridge — what this date's week plan intends and the
 *  day page doesn't have yet (TodayScreen renders it with gentle buttons). */
export function useWeekBridge(
  date: string,
  firstDay: number
): WeekBridgeRow[] | undefined {
  return useLiveQuery(
    () => getWeekBridgeItems(date, firstDay),
    [date, firstDay]
  );
}

export function useArchivedItems() {
  return useLiveQuery(async () => {
    const items = await db.items.toArray();
    const spaces = await db.spaces.toArray();
    const inbox = await db.inboxEntries.toArray();
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
  const prefs = useViewPrefs();
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
    const today = lifeDayFor(prefs);
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
  }, [trigger, tick, prefs]);
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

/** Rows feeding the qualitative week strip on the review screen (v1.1). */
export function useWeekStripData(
  days: string[]
): StripEntry[] | undefined {
  const daysKey = days.join(",");
  return useLiveQuery(async () => {
    const list = daysKey ? daysKey.split(",") : [];
    if (list.length === 0) return [] as StripEntry[];
    const plans = await db.dailyPlans.where("date").anyOf(list).toArray();
    if (plans.length === 0) return [] as StripEntry[];
    const planIds = plans.map((p) => p.id);
    const dateByPlanId = new Map(plans.map((p) => [p.id, p.date]));
    const periodRows = await db.dailyPeriods
      .where("dailyPlanId")
      .anyOf(planIds)
      .toArray();
    const orderById = new Map(periodRows.map((p) => [p.id, p.order]));
    const entries = await db.dailyEntries
      .where("dailyPlanId")
      .anyOf(planIds)
      .toArray();
    const out: StripEntry[] = [];
    for (const e of entries) {
      const date = dateByPlanId.get(e.dailyPlanId);
      if (!date) continue;
      out.push({
        date,
        order: e.periodId ? (orderById.get(e.periodId) ?? 0) : 0,
        executionStatus: e.executionStatus,
      });
    }
    return out;
  }, [daysKey]);
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

/* ---------- v1.2: day closure + review insights ---------- */

/** Is the given (life-)day closed with قفلة اليوم? */
export function useDayClosed(date: string | null): boolean | undefined {
  return useLiveQuery(async () => {
    if (!date) return false;
    const plan = await db.dailyPlans.where("date").equals(date).first();
    return typeof plan?.closedAt === "number";
  }, [date]);
}

/** Most recent closed day strictly before `date` (v1.3 — powers the
 *  welcome-back line: a 4+ day gap deserves one warm sentence, not a debt). */
export function useLastClosedDay(before: string): string | null | undefined {
  return useLiveQuery(async () => {
    const rows = await db.dailyPlans
      .filter((p) => typeof p.closedAt === "number" && p.date < before)
      .toArray();
    if (rows.length === 0) return null;
    return rows.reduce((a, b) => (a.date > b.date ? a : b)).date;
  }, [before]);
}

/** The review's three questions, answered from the week's own data (v1.2). */
export function useReviewInsights(
  weekStartDate: string,
  days: string[]
): ReturnType<typeof buildWeekInsights> | undefined {
  const daysKey = days.join(",");
  const prefs = useViewPrefs();
  return useLiveQuery(async () => {
    const list = daysKey ? daysKey.split(",") : [];
    if (list.length === 0) {
      return buildWeekInsights({
        days: [],
        createdCount: 0,
        capturedCount: 0,
        completedCount: 0,
        activityThisWeek: 0,
        activityPrevWeek: 0,
        closedDays: 0,
        absentDays: 0,
        weekComplete: false,
        spaces: [],
      });
    }
    const weekStartMs = localDayStartMs(list[0]);
    const weekEndMs = localDayStartMs(addDays(list[list.length - 1], 1));
    const prevStartMs = localDayStartMs(addDays(weekStartDate, -7));
    const prevEndMs = weekStartMs;

    const [items, inbox, activity, spaces, links] = await Promise.all([
      db.items.toArray(),
      db.inboxEntries.toArray(),
      db.activityHistory.toArray(),
      db.spaces.toArray(),
      db.itemSpaceLinks.toArray(),
    ]);

    const createdCount = items.filter(
      (i) => i.createdAt >= weekStartMs && i.createdAt < weekEndMs
    ).length;
    const capturedCount = inbox.filter(
      (e) => e.createdAt >= weekStartMs && e.createdAt < weekEndMs
    ).length;
    const completedCount = items.filter(
      (i) =>
        typeof i.completedAt === "number" &&
        i.completedAt >= weekStartMs &&
        i.completedAt < weekEndMs
    ).length;

    const activityThisWeek = activity.filter(
      (a) => a.timestamp >= weekStartMs && a.timestamp < weekEndMs
    ).length;
    const activityPrevWeek = activity.filter(
      (a) => a.timestamp >= prevStartMs && a.timestamp < prevEndMs
    ).length;

    const lifeToday = lifeDayFor(prefs);
    const weekComplete = list[list.length - 1] < lifeToday;
    let absentDays = 0;
    for (const day of list) {
      if (day >= lifeToday) break; // only fully-passed days count
      const dayStart = localDayStartMs(day);
      const dayEnd = localDayStartMs(addDays(day, 1));
      const present = activity.some(
        (a) => a.timestamp >= dayStart && a.timestamp < dayEnd
      );
      if (!present) absentDays++;
    }

    const closedPlans = await db.dailyPlans
      .where("date")
      .anyOf(list)
      .toArray();
    const closedDays = closedPlans.filter(
      (p) => typeof p.closedAt === "number"
    ).length;

    // spaces touched this week (items created/completed in the window)
    const weekItemIds = new Set(
      items
        .filter(
          (i) =>
            (i.createdAt >= weekStartMs && i.createdAt < weekEndMs) ||
            (typeof i.completedAt === "number" &&
              i.completedAt >= weekStartMs &&
              i.completedAt < weekEndMs)
        )
        .map((i) => i.id)
    );
    const touchedBySpace = new Map<string, number>();
    for (const link of links) {
      if (weekItemIds.has(link.itemId)) {
        touchedBySpace.set(
          link.spaceId,
          (touchedBySpace.get(link.spaceId) ?? 0) + 1
        );
      }
    }
    const spaceRows = spaces
      .filter((s) => !s.archivedAt)
      .map((s) => ({
        id: s.id,
        name: s.name,
        touched: touchedBySpace.get(s.id) ?? 0,
      }));

    const input: InsightsInput = {
      days: list,
      createdCount,
      capturedCount,
      completedCount,
      activityThisWeek,
      activityPrevWeek,
      closedDays,
      absentDays,
      weekComplete,
      spaces: spaceRows,
    };
    return buildWeekInsights(input);
  }, [daysKey, weekStartDate, prefs]);
}
