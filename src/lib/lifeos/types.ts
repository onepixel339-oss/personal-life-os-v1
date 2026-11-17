/* Personal Life OS — complete data model (Master Specification §6.2). */

export type ItemType =
  | "unsorted"
  | "task"
  | "activity"
  | "event"
  | "idea"
  | "note"
  | "project"
  | "entertainment"
  | "outcome";

export type ItemStatus =
  | "active"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled"
  | "archived";

export type ExecutionStatus = "pending" | "completed" | "skipped" | "partial";

export type PrayerKey =
  | "fajr"
  | "sunrise"
  | "dhuhr"
  | "asr"
  | "maghrib"
  | "isha";

export interface Item {
  id: string;
  type: ItemType;
  title: string; // 1..500 chars, trimmed, required
  description: string;
  status: ItemStatus;
  statusBeforeArchive?: ItemStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  archivedAt?: number;
}

export interface Space {
  id: string;
  name: string;
  description: string;
  icon?: string;
  color?: string; // token key, not raw hex
  sortOrder: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}

export interface ItemSpaceLink {
  id: string;
  itemId: string;
  spaceId: string;
  sortOrder: string;
  createdAt: number;
} // unique(itemId, spaceId)

export type RelationType = "parent" | "related" | "depends_on";

export interface ItemRelationship {
  id: string;
  sourceItemId: string;
  targetItemId: string;
  relationType: RelationType; // 'subtask' accepted on import only (alias of parent, inverted)
  sortOrder?: string;
  createdAt: number;
}

export interface ProjectDetails {
  itemId: string;
  goal?: string;
  startDate?: string;
  targetDate?: string;
}

export interface NoteDetails {
  itemId: string;
  content: string;
  format: "plain" | "markdown";
  noteType: "regular" | "return";
  updatedAt: number;
}

export type ReturnTrigger = "app_open" | "space_open" | "project_open" | "date";
export type RepeatKind = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface ReturnNoteSettings {
  noteItemId: string;
  enabled: boolean;
  trigger: ReturnTrigger;
  targetId?: string; // spaceId OR project itemId depending on trigger
  targetDate?: string; // YYYY-MM-DD
  repeat: RepeatKind;
}

export type MediaType = "movie" | "series" | "anime" | "game";
export type ProgressStatus =
  | "planned"
  | "in_progress"
  | "paused"
  | "completed"
  | "dropped";

export interface EntertainmentDetails {
  itemId: string;
  mediaType: MediaType;
  progressStatus: ProgressStatus;
  currentSeason?: number;
  currentEpisode?: number;
  totalSeasons?: number;
  nextEpisodeDate?: string;
  rating?: number; // 0..10 integer (2 = 1 star, half steps)
}

export interface InboxEntry {
  id: string;
  itemId: string;
  sortOrder: string;
  createdAt: number;
} // unique(itemId) while present

export interface WeeklyPlan {
  id: string;
  startDate: string;
  endDate: string;
  createdAt: number;
} // unique(startDate)

export interface WeeklyEntry {
  id: string;
  weeklyPlanId: string;
  itemId: string;
  role: "regular" | "outcome";
  scheduledDate?: string; // must lie within plan range
  occurrenceKey?: string; // '' for non-recurring (D14 / §7 note 2)
  sortOrder: string;
  createdAt: number;
} // unique(weeklyPlanId, itemId, occurrenceKey)

export interface DailyPlan {
  id: string;
  date: string;
  createdAt: number;
  /** v1.2 "قفلة اليوم" — gentle day closure (non-indexed, no schema bump) */
  closedAt?: number;
} // unique(date)

export interface DailyPeriod {
  id: string;
  dailyPlanId: string;
  settingId?: string; // may dangle if the setting was later deleted — intentional
  name: string;
  tagline?: string;
  mode: "fixed" | "flexible";
  startTime?: string;
  endTime?: string;
  endDayOffset?: 0 | 1;
  durationMinutes?: number;
  order: number;
}

export type DailyEntryKind = "item" | "routine";

export interface DailyEntry {
  id: string;
  dailyPlanId: string;
  kind: DailyEntryKind;
  itemId?: string;
  routineId?: string; // exactly one of itemId/routineId set (D13)
  occurrenceKey?: string;
  periodId?: string; // DailyPeriod.id; undefined = unplaced
  startTime?: string;
  endTime?: string;
  startDayOffset?: 0 | 1;
  durationMinutes?: number;
  executionStatus: ExecutionStatus;
  completedAt?: number;
  sortOrder: string;
  createdAt: number;
  updatedAt: number;
}

export type Anchor =
  | { kind: "clock"; time: string }
  | {
      kind: "prayer";
      prayer: PrayerKey;
      offsetMin: number;
      nextDay?: boolean;
    };

export interface PeriodSetting {
  id: string;
  name: string;
  tagline?: string;
  order: number;
  enabled: boolean;
  mode: "fixed" | "flexible";
  startAnchor?: Anchor;
  endAnchor?: Anchor;
  durationMinutes?: number;
  isDefault: boolean;
}

export type RecurrencePattern = "daily" | "weekdays" | "weekly" | "monthly";

export interface PauseSegment {
  from: string;
  to?: string;
}

export interface RecurrenceRule {
  id: string;
  itemId?: string;
  routineId?: string; // exactly one of itemId/routineId (§8.7)
  state: "active" | "paused" | "disabled";
  pattern: RecurrencePattern;
  interval: number; // >= 1
  byWeekday?: (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
  byMonthDay?: number; // 1..31
  monthDayMode?: "day" | "last";
  weekAnchor: 0 | 1 | 2 | 3 | 4 | 5 | 6; // first day of week captured at rule creation (§8.2)
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  periodSettingId?: string;
  pauseSegments?: PauseSegment[];
  pausedFrom?: string; // derived convenience
  createdAt: number;
  updatedAt: number;
  version: number;
  supersedesRuleId?: string;
}

export type OccurrenceStateKind = "status" | "modified" | "cancelled";

export interface OccurrenceState {
  id: string;
  ruleId: string;
  occurrenceKey: string;
  originalDate: string;
  kind: OccurrenceStateKind;
  executionStatus?: ExecutionStatus;
  completedAt?: number;
  overrideDate?: string;
  overridePeriodSettingId?: string;
  overrideStartTime?: string;
  overrideEndTime?: string;
  overrideDurationMinutes?: number;
  overrideTitle?: string;
  createdAt: number;
  updatedAt: number;
} // unique(ruleId, occurrenceKey)

export interface Routine {
  id: string;
  name: string;
  description?: string;
  recurrenceRuleId?: string;
  archivedAt?: number;
  sortOrder: string;
  createdAt: number;
  updatedAt: number;
}

export interface RoutineItem {
  id: string;
  routineId: string;
  title: string;
  durationMinutes?: number;
  itemId?: string; // optional reference, never auto-completed
  sortOrder: string;
}

export interface RoutineExecution {
  id: string;
  routineId: string;
  dailyEntryId?: string;
  date: string;
  startedAt: number;
  endedAt?: number;
  state: "in_progress" | "ended";
  titleSnapshot: string;
}

export interface RoutineExecutionStep {
  id: string;
  executionId: string;
  routineItemId?: string;
  titleSnapshot: string;
  durationSnapshot?: number;
  status: "pending" | "done" | "skipped";
  updatedAt: number;
  sortOrder: string;
}

export interface WeeklyReviewAnswers {
  accomplished?: string;
  incomplete?: string;
  changed?: string;
  carry?: string;
  ideas?: string;
}

export interface WeeklyReview {
  id: string;
  weeklyPlanId: string;
  answers: WeeklyReviewAnswers;
  createdAt: number;
  updatedAt: number;
} // unique(weeklyPlanId)

export interface ResumeMarker {
  id: string;
  itemId: string;
  resumeOn?: string;
  reason: "kept" | "postponed";
  createdAt: number;
}

export interface ResumeSuggestionState {
  id: string;
  sourceKind: "return_note" | "marker" | "dated_item";
  sourceId: string;
  presentationKey: string;
  state: "dismissed" | "later";
  until?: number;
  createdAt: number;
}

export interface ActivityHistory {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: number;
}

/* ---- resolved / view models ---- */

export interface ResolvedPeriod {
  id: string; // DailyPeriod.id when materialized, or `virtual:<settingId>` otherwise
  settingId?: string;
  name: string;
  tagline?: string;
  mode: "fixed" | "flexible";
  startTime?: string;
  endTime?: string;
  endDayOffset?: 0 | 1;
  durationMinutes?: number;
  order: number;
}

export interface Occurrence {
  occurrenceKey: string; // ruleRootId + ':' + originalDate
  ruleId: string;
  itemId?: string;
  routineId?: string;
  originalDate: string;
  date: string; // possibly overridden
  title: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  periodSettingId?: string;
  executionStatus: ExecutionStatus;
  cancelled: boolean;
  materialized: boolean; // a DailyEntry with this occurrenceKey exists
}

export type AppError =
  | { code: "not_found"; message: string }
  | { code: "validation"; message: string }
  | { code: "duplicate"; message: string }
  | { code: "cycle"; message: string }
  | { code: "write_failed"; message: string }
  | { code: "backup_invalid"; message: string }
  | { code: "db_error"; message: string }
  | { code: "unknown"; message: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = (error: AppError): Result<never> => ({ ok: false, error });

/* Valid item statuses per type (§5.1) */
export const VALID_STATUS_BY_TYPE: Record<ItemType, ItemStatus[]> = {
  unsorted: ["active", "archived"],
  task: ["active", "in_progress", "paused", "completed", "cancelled", "archived"],
  activity: ["active", "in_progress", "paused", "completed", "cancelled", "archived"],
  event: ["active", "completed", "cancelled", "archived"],
  idea: ["active", "paused", "archived"],
  note: ["active", "archived"],
  project: ["active", "in_progress", "paused", "completed", "cancelled", "archived"],
  entertainment: ["active", "in_progress", "paused", "completed", "cancelled", "archived"], // derived from progressStatus (D8)
  outcome: ["active", "in_progress", "paused", "completed", "cancelled", "archived"],
};

/* Entertainment progress → item status map (D8) */
export const ENT_STATUS_MAP: Record<ProgressStatus, ItemStatus> = {
  planned: "active",
  in_progress: "in_progress",
  paused: "paused",
  completed: "completed",
  dropped: "cancelled",
};

export const TYPE_LABELS: Record<ItemType, string> = {
  unsorted: "Unsorted",
  task: "Task",
  activity: "Activity",
  event: "Event",
  idea: "Idea",
  note: "Note",
  project: "Project",
  entertainment: "Entertainment",
  outcome: "Outcome",
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  active: "Active",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

export const EXECUTION_LABELS: Record<ExecutionStatus, string> = {
  pending: "Pending",
  completed: "Done",
  skipped: "Skipped",
  partial: "Partial",
};
