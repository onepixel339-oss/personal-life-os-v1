/* Dexie / IndexedDB schema — Master Specification §7.
   `&` = unique index; compound indexes use '' (never undefined) for
   optional components (§7 note 2). Services are the only layer importing Dexie. */

import Dexie, { type Table } from "dexie";
import {
  DEFAULT_CALENDAR,
  DEFAULT_PRAYER,
  SETTING_KEYS,
  defaultPeriodSettings,
} from "./defaults";
import type {
  ActivityHistory,
  AppSetting,
  DailyEntry,
  DailyPeriod,
  DailyPlan,
  EntertainmentDetails,
  InboxEntry,
  Item,
  ItemRelationship,
  ItemSpaceLink,
  NoteDetails,
  OccurrenceState,
  PeriodSetting,
  ProjectDetails,
  RecurrenceRule,
  ResumeMarker,
  ResumeSuggestionState,
  ReturnNoteSettings,
  Routine,
  RoutineExecution,
  RoutineExecutionStep,
  RoutineItem,
  Space,
  WeeklyEntry,
  WeeklyPlan,
  WeeklyReview,
} from "./types";

export class LifeOSDB extends Dexie {
  items!: Table<Item, string>;
  spaces!: Table<Space, string>;
  itemSpaceLinks!: Table<ItemSpaceLink, string>;
  itemRelationships!: Table<ItemRelationship, string>;
  projectDetails!: Table<ProjectDetails, string>;
  noteDetails!: Table<NoteDetails, string>;
  returnNoteSettings!: Table<ReturnNoteSettings, string>;
  entertainmentDetails!: Table<EntertainmentDetails, string>;
  inboxEntries!: Table<InboxEntry, string>;
  weeklyPlans!: Table<WeeklyPlan, string>;
  weeklyEntries!: Table<WeeklyEntry, string>;
  dailyPlans!: Table<DailyPlan, string>;
  dailyPeriods!: Table<DailyPeriod, string>;
  dailyEntries!: Table<DailyEntry, string>;
  periodSettings!: Table<PeriodSetting, string>;
  recurrenceRules!: Table<RecurrenceRule, string>;
  occurrenceStates!: Table<OccurrenceState, string>;
  routines!: Table<Routine, string>;
  routineItems!: Table<RoutineItem, string>;
  routineExecutions!: Table<RoutineExecution, string>;
  routineExecutionSteps!: Table<RoutineExecutionStep, string>;
  weeklyReviews!: Table<WeeklyReview, string>;
  resumeMarkers!: Table<ResumeMarker, string>;
  resumeSuggestionStates!: Table<ResumeSuggestionState, string>;
  activityHistory!: Table<ActivityHistory, string>;
  appSettings!: Table<AppSetting, string>;
  searchIndexMeta!: Table<AppSetting, string>;

  constructor() {
    super("personal-life-os");
    this.version(1).stores({
      items: "id, type, status, updatedAt, archivedAt, [type+status], title",
      spaces: "id, sortOrder, archivedAt, name",
      itemSpaceLinks: "id, &[itemId+spaceId], itemId, spaceId",
      itemRelationships:
        "id, &[sourceItemId+targetItemId+relationType], sourceItemId, targetItemId",
      projectDetails: "itemId",
      noteDetails: "itemId, noteType",
      returnNoteSettings: "noteItemId, enabled, trigger, targetId, targetDate",
      entertainmentDetails: "itemId, mediaType, progressStatus",
      inboxEntries: "id, &itemId, sortOrder",
      weeklyPlans: "id, &startDate",
      weeklyEntries:
        "id, weeklyPlanId, itemId, scheduledDate, &[weeklyPlanId+itemId+occurrenceKey]",
      dailyPlans: "id, &date",
      dailyPeriods: "id, dailyPlanId, order",
      dailyEntries:
        "id, dailyPlanId, itemId, routineId, periodId, [dailyPlanId+periodId], executionStatus, occurrenceKey",
      periodSettings: "id, order, enabled",
      recurrenceRules: "id, itemId, routineId, state, startDate",
      occurrenceStates: "id, &[ruleId+occurrenceKey], ruleId, originalDate, overrideDate",
      routines: "id, archivedAt, sortOrder",
      routineItems: "id, routineId, sortOrder",
      routineExecutions: "id, routineId, date, dailyEntryId",
      routineExecutionSteps: "id, executionId",
      weeklyReviews: "id, &weeklyPlanId",
      resumeMarkers: "id, itemId, resumeOn",
      resumeSuggestionStates: "id, [sourceKind+sourceId], presentationKey, until",
      activityHistory: "id, [entityType+entityId], timestamp",
      appSettings: "key",
      searchIndexMeta: "key",
    });
  }
}

export const db = new LifeOSDB();

/* Seeding: nothing is created for the user except the five default period
   settings and default app settings (F1: "nothing is seeded" content-wise). */
db.on("populate", (tx) => {
  const now = Date.now();
  void tx
    .table("periodSettings")
    .bulkAdd(defaultPeriodSettings());
  void tx.table("appSettings").bulkAdd([
    {
      key: SETTING_KEYS.firstDayOfWeek,
      value: DEFAULT_CALENDAR.firstDayOfWeek,
      updatedAt: now,
    },
    {
      key: SETTING_KEYS.dateFormat,
      value: DEFAULT_CALENDAR.dateFormat,
      updatedAt: now,
    },
    {
      key: SETTING_KEYS.timeFormat24,
      value: DEFAULT_CALENDAR.timeFormat24,
      updatedAt: now,
    },
    { key: SETTING_KEYS.todayView, value: "list", updatedAt: now },
    { key: SETTING_KEYS.weeklyView, value: "list", updatedAt: now },
    { key: SETTING_KEYS.prayer, value: DEFAULT_PRAYER, updatedAt: now },
    { key: SETTING_KEYS.inboxBadge, value: true, updatedAt: now },
  ]);
});

export const ALL_STORES = [
  "items",
  "spaces",
  "itemSpaceLinks",
  "itemRelationships",
  "projectDetails",
  "noteDetails",
  "returnNoteSettings",
  "entertainmentDetails",
  "inboxEntries",
  "weeklyPlans",
  "weeklyEntries",
  "dailyPlans",
  "dailyPeriods",
  "dailyEntries",
  "periodSettings",
  "recurrenceRules",
  "occurrenceStates",
  "routines",
  "routineItems",
  "routineExecutions",
  "routineExecutionSteps",
  "weeklyReviews",
  "resumeMarkers",
  "resumeSuggestionStates",
  "activityHistory",
  "appSettings",
] as const;

export type StoreName = (typeof ALL_STORES)[number];

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.appSettings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.appSettings.put({ key, value, updatedAt: Date.now() });
}

/* ---------- v1.4: the activity log grows forever unless someone trims it.
   The log powers review insights ("a lived week") but nothing needs more
   than the most recent slice — a bounded log keeps the review fast and the
   database healthy after months of daily use. ---------- */

export const ACTIVITY_HISTORY_CAP = 5000;

/** Delete the oldest rows beyond `cap` (best-effort, returns rows removed). */
export async function pruneActivityHistory(
  cap: number = ACTIVITY_HISTORY_CAP
): Promise<number> {
  const count = await db.activityHistory.count();
  if (count <= cap) return 0;
  const excess = count - cap;
  const oldest = await db.activityHistory.orderBy("timestamp").limit(excess).toArray();
  await db.activityHistory.bulkDelete(oldest.map((r) => r.id));
  return oldest.length;
}

/* logActivity writes are frequent; pruning on every write would be waste.
   Every 25th write quietly trims — the boot prune (app-shell) closes the
   rest of the gap for users returning after a long time. */
let writesSincePrune = 0;

export async function logActivity(
  entityType: string,
  entityId: string,
  action: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.activityHistory.add({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      entityType,
      entityId,
      action,
      timestamp: Date.now(),
      metadata,
    });
    writesSincePrune += 1;
    if (writesSincePrune >= 25) {
      writesSincePrune = 0;
      try {
        await pruneActivityHistory();
      } catch {
        /* pruning is best-effort — never block the write path */
      }
    }
  } catch (e) {
    // history is best-effort; never block user actions — but a failing
    // IndexedDB write is worth seeing in the console.
    console.error("logActivity failed", e);
  }
}
