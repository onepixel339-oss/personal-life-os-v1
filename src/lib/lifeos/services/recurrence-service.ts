/* RecurrenceService — rules, not rows; virtual occurrences; sparse state (§8).
   occurrenceKey = ruleRootId + ':' + originalDate; stable across
   "this and future" splits; history is never silently lost. */

import { db } from "../db";
import { emitChange } from "../events";
import {
  addDays,
  compareDates,
  dayOfWeek,
  isValidDateString,
  todayLocal,
  weekStart,
} from "../dates";
import { uid } from "../ids";
import type {
  ExecutionStatus,
  Item,
  Occurrence,
  OccurrenceState,
  RecurrencePattern,
  RecurrenceRule,
  Result,
} from "../types";
import { err, ok } from "../types";

/* ---------- pure date generation (memoized per rule+version+window) ---------- */

const memo = new Map<string, string[]>();

function monthLastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateParts(s: string): [number, number, number] {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m, d];
}

/** Candidate original dates of `rule` inside [from, to] (pattern + pause segments applied). */
export function generateDates(
  rule: RecurrenceRule,
  from: string,
  to: string
): string[] {
  const key = `${rule.id}|${rule.version}|${from}|${to}`;
  const cached = memo.get(key);
  if (cached) return cached;

  const out: string[] = [];
  const windowStart = compareDates(from, rule.startDate) >= 0 ? from : rule.startDate;
  const windowEnd =
    rule.endDate && compareDates(to, rule.endDate) > 0 ? rule.endDate : to;
  if (compareDates(windowStart, windowEnd) > 0 || rule.state === "disabled") {
    memo.set(key, out);
    return out;
  }

  const interval = Math.max(1, rule.interval);
  const pattern: RecurrencePattern = rule.pattern;

  if (pattern === "daily") {
    let cursor = rule.startDate;
    // jump close to the window
    if (compareDates(cursor, windowStart) < 0) {
      const daysBehind = Math.round(
        (Date.parse(windowStart) - Date.parse(cursor)) / 86_400_000
      );
      const jumps = Math.floor(daysBehind / interval);
      if (jumps > 0) cursor = addDays(cursor, jumps * interval);
    }
    for (
      ;
      compareDates(cursor, windowEnd) <= 0;
      cursor = addDays(cursor, interval)
    ) {
      if (compareDates(cursor, windowStart) >= 0) out.push(cursor);
    }
  } else if (pattern === "weekly") {
    const anchor = rule.weekAnchor;
    const startWeek = weekStart(rule.startDate, anchor);
    const firstWeek = weekStart(windowStart, anchor);
    const weeksBehind = Math.round(
      (Date.parse(firstWeek) - Date.parse(startWeek)) / (7 * 86_400_000)
    );
    let weekIndex = Math.max(
      0,
      Math.ceil(weeksBehind / interval) * interval
    );
    if (weekIndex < 0) weekIndex = 0;
    for (;; weekIndex += interval) {
      const week = addDays(startWeek, weekIndex * 7);
      if (compareDates(week, windowEnd) > 0) break;
      const target = addDays(week, dayOfWeek(rule.startDate));
      if (compareDates(target, rule.startDate) < 0) continue;
      if (compareDates(target, windowStart) >= 0 && compareDates(target, windowEnd) <= 0)
        out.push(target);
    }
  } else if (pattern === "weekdays") {
    const days = new Set(rule.byWeekday ?? []);
    const anchor = rule.weekAnchor;
    const startWeek = weekStart(rule.startDate, anchor);
    const firstWeek = weekStart(windowStart, anchor);
    const weeksBehind = Math.round(
      (Date.parse(firstWeek) - Date.parse(startWeek)) / (7 * 86_400_000)
    );
    let weekIndex = Math.max(0, Math.ceil(weeksBehind / interval) * interval);
    for (;; weekIndex += interval) {
      const week = addDays(startWeek, weekIndex * 7);
      if (compareDates(week, windowEnd) > 0) break;
      for (const dow of days) {
        const target = addDays(week, dow);
        if (compareDates(target, rule.startDate) < 0) continue;
        if (compareDates(target, windowStart) >= 0 && compareDates(target, windowEnd) <= 0)
          out.push(target);
      }
    }
  } else {
    // monthly
    const [sy, sm] = dateParts(rule.startDate);
    const [wy, wm] = dateParts(windowStart);
    const monthsBehind = (wy - sy) * 12 + (wm - sm);
    let monthIndex = Math.max(0, Math.ceil(monthsBehind / interval) * interval);
    for (;; monthIndex += interval) {
      const totalMonths = (sm - 1) + monthIndex;
      const y = sy + Math.floor(totalMonths / 12);
      const m = (totalMonths % 12) + 1;
      const targetDay =
        rule.monthDayMode === "last"
          ? monthLastDay(y, m)
          : Math.min(rule.byMonthDay ?? 1, monthLastDay(y, m));
      const target = `${y}-${String(m).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
      if (compareDates(target, windowEnd) > 0) break;
      if (
        compareDates(target, rule.startDate) >= 0 &&
        compareDates(target, windowStart) >= 0
      )
        out.push(target);
    }
  }

  // pause segments exclude dates (no catch-up pressure, §8.5)
  const filtered =
    rule.pauseSegments?.length
      ? out.filter(
          (d) =>
            !rule.pauseSegments!.some(
              (seg) =>
                compareDates(d, seg.from) >= 0 &&
                (!seg.to || compareDates(d, seg.to) <= 0)
            )
        )
      : out;

  memo.set(key, filtered);
  if (memo.size > 600) {
    const firstKey = memo.keys().next().value;
    if (firstKey) memo.delete(firstKey);
  }
  return filtered;
}

/** Walk the supersedesRuleId chain to the root rule id (stable occurrence keys). */
export function ruleRootId(
  ruleId: string,
  rulesById: Map<string, RecurrenceRule>
): string {
  let current = rulesById.get(ruleId);
  const seen = new Set<string>([ruleId]);
  while (current?.supersedesRuleId && !seen.has(current.supersedesRuleId)) {
    seen.add(current.supersedesRuleId);
    const next = rulesById.get(current.supersedesRuleId);
    if (!next) break;
    current = next;
  }
  return current?.id ?? ruleId;
}

/**
 * Expand a rule into occurrences for [from, to], merging sparse state.
 * `statesByKey` maps occurrenceKey → OccurrenceState for this rule chain.
 */
export function expand(
  rule: RecurrenceRule,
  from: string,
  to: string,
  statesByKey: Map<string, OccurrenceState>,
  rulesById: Map<string, RecurrenceRule>
): Occurrence[] {
  if (rule.state === "disabled") return historicalOnly(rule, from, to, statesByKey);
  const root = ruleRootId(rule.id, rulesById);
  const dates = generateDates(rule, from, to);
  const out: Occurrence[] = [];
  const generated = new Set<string>();
  for (const originalDate of dates) {
    const occurrenceKey = `${root}:${originalDate}`;
    generated.add(occurrenceKey);
    const state = statesByKey.get(occurrenceKey);
    if (state?.kind === "cancelled") continue;
    const date = state?.overrideDate ?? originalDate;
    if (compareDates(date, from) < 0 || compareDates(date, to) > 0) continue;
    out.push({
      occurrenceKey,
      ruleId: rule.id,
      itemId: rule.itemId,
      routineId: rule.routineId,
      originalDate,
      date,
      title: state?.overrideTitle ?? "",
      startTime: state?.overrideStartTime ?? rule.startTime,
      endTime: state?.overrideEndTime ?? rule.endTime,
      durationMinutes: state?.overrideDurationMinutes,
      periodSettingId:
        state?.overridePeriodSettingId ?? rule.periodSettingId,
      executionStatus:
        state?.kind === "status" || state?.executionStatus
          ? state?.executionStatus ?? "pending"
          : "pending",
      cancelled: false,
      materialized: false,
    });
  }
  // historical records: states with real execution that no longer generate (§8.4 entire-rule)
  const extra = historicalOnly(rule, from, to, statesByKey).filter(
    (o) => !generated.has(o.occurrenceKey)
  );
  out.push(...extra);
  return out;
}

function historicalOnly(
  rule: RecurrenceRule,
  from: string,
  to: string,
  statesByKey: Map<string, OccurrenceState>
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const state of statesByKey.values()) {
    if (state.ruleId !== rule.id) continue;
    if (state.kind !== "status" && state.kind !== "modified") continue;
    if (
      state.executionStatus !== "completed" &&
      state.executionStatus !== "skipped" &&
      state.executionStatus !== "partial"
    )
      continue;
    const date = state.overrideDate ?? state.originalDate;
    if (compareDates(date, from) < 0 || compareDates(date, to) > 0) continue;
    out.push({
      occurrenceKey: state.occurrenceKey,
      ruleId: rule.id,
      itemId: rule.itemId,
      routineId: rule.routineId,
      originalDate: state.originalDate,
      date,
      title: state.overrideTitle ?? "",
      startTime: state.overrideStartTime ?? rule.startTime,
      endTime: state.overrideEndTime ?? rule.endTime,
      durationMinutes: state.overrideDurationMinutes,
      periodSettingId:
        state.overridePeriodSettingId ?? rule.periodSettingId,
      executionStatus: state.executionStatus ?? "pending",
      cancelled: false,
      materialized: false,
    });
  }
  return out;
}

/* ---------- rule CRUD ---------- */

export interface RuleInput {
  itemId?: string;
  routineId?: string;
  pattern: RecurrencePattern;
  interval: number;
  byWeekday?: (0 | 1 | 2 | 3 | 4 | 5 | 6)[];
  byMonthDay?: number;
  monthDayMode?: "day" | "last";
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  periodSettingId?: string;
  weekAnchor: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

function validateRuleInput(input: RuleInput): string | null {
  if (!input.itemId && !input.routineId)
    return "A rule needs an item or a routine.";
  if (input.itemId && input.routineId)
    return "A rule can't have both an item and a routine.";
  if (!isValidDateString(input.startDate))
    return "The start date should look like 2026-11-13.";
  if (input.endDate) {
    if (!isValidDateString(input.endDate))
      return "The end date should look like 2026-12-31.";
    if (compareDates(input.endDate, input.startDate) < 0)
      return "The end date should be after the start date.";
  }
  if (!Number.isInteger(input.interval) || input.interval < 1)
    return "The interval should be at least 1.";
  if (input.pattern === "weekdays" && (!input.byWeekday || input.byWeekday.length === 0))
    return "Pick at least one weekday.";
  if (input.pattern === "monthly") {
    if (input.monthDayMode !== "last" && (!input.byMonthDay || input.byMonthDay < 1 || input.byMonthDay > 31))
      return "Pick a day of the month (1–31) or “last”.";
  }
  return null;
}

export async function createRule(
  input: RuleInput
): Promise<Result<RecurrenceRule>> {
  const problem = validateRuleInput(input);
  if (problem) return err({ code: "validation", message: problem });
  const now = Date.now();
  const rule: RecurrenceRule = {
    id: uid(),
    itemId: input.itemId,
    routineId: input.routineId,
    state: "active",
    pattern: input.pattern,
    interval: input.interval,
    byWeekday: input.byWeekday,
    byMonthDay: input.byMonthDay,
    monthDayMode: input.monthDayMode ?? "day",
    weekAnchor: input.weekAnchor,
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
    periodSettingId: input.periodSettingId,
    pauseSegments: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  try {
    await db.recurrenceRules.add(rule);
    emitChange(["recurrenceRules"]);
    return ok(rule);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that repeat." });
  }
}

/** Entire rule edit: update in place, version++ (§8.4). */
export async function updateRule(
  ruleId: string,
  patch: Partial<RuleInput>
): Promise<Result<void>> {
  const rule = await db.recurrenceRules.get(ruleId);
  if (!rule) return err({ code: "not_found", message: "That repeat is gone." });
  const merged: RuleInput = {
    itemId: rule.itemId,
    routineId: rule.routineId,
    pattern: patch.pattern ?? rule.pattern,
    interval: patch.interval ?? rule.interval,
    byWeekday: patch.byWeekday ?? rule.byWeekday,
    byMonthDay: patch.byMonthDay ?? rule.byMonthDay,
    monthDayMode: patch.monthDayMode ?? rule.monthDayMode,
    startDate: patch.startDate ?? rule.startDate,
    endDate: patch.endDate ?? rule.endDate,
    startTime: patch.startTime ?? rule.startTime,
    endTime: patch.endTime ?? rule.endTime,
    periodSettingId: patch.periodSettingId ?? rule.periodSettingId,
    weekAnchor: rule.weekAnchor,
  };
  const problem = validateRuleInput(merged);
  if (problem) return err({ code: "validation", message: problem });
  try {
    await db.recurrenceRules.update(ruleId, {
      ...merged,
      version: rule.version + 1,
      updatedAt: Date.now(),
    });
    emitChange(["recurrenceRules"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that repeat." });
  }
}

/* ---------- pause / resume / disable (§8.5) ---------- */

export async function pauseRule(ruleId: string): Promise<Result<void>> {
  const rule = await db.recurrenceRules.get(ruleId);
  if (!rule) return err({ code: "not_found", message: "That repeat is gone." });
  if (rule.state !== "active") return ok(undefined);
  const today = todayLocal();
  const segments = [...(rule.pauseSegments ?? [])];
  if (!segments.some((s) => !s.to)) segments.push({ from: today });
  try {
    // version++ invalidates the generateDates memo — pauseSegments change
    // which dates the rule produces, so stale cache must not survive.
    await db.recurrenceRules.update(ruleId, {
      state: "paused",
      pausedFrom: today,
      pauseSegments: segments,
      version: rule.version + 1,
      updatedAt: Date.now(),
    });
    emitChange(["recurrenceRules"]);
    return ok(undefined);
  } catch (e) {
    console.error("pauseRule failed", e);
    return err({ code: "write_failed", message: "Couldn't pause that." });
  }
}

export async function resumeRule(ruleId: string): Promise<Result<void>> {
  const rule = await db.recurrenceRules.get(ruleId);
  if (!rule) return err({ code: "not_found", message: "That repeat is gone." });
  if (rule.state !== "paused") return ok(undefined);
  const today = todayLocal();
  const segments = (rule.pauseSegments ?? []).map((s) =>
    !s.to ? { ...s, to: addDays(today, -1) } : s
  );
  try {
    // version++ invalidates the generateDates memo (see pauseRule).
    await db.recurrenceRules.update(ruleId, {
      state: "active",
      pausedFrom: undefined,
      pauseSegments: segments,
      version: rule.version + 1,
      updatedAt: Date.now(),
    });
    emitChange(["recurrenceRules"]);
    return ok(undefined);
  } catch (e) {
    console.error("resumeRule failed", e);
    return err({ code: "write_failed", message: "Couldn't resume that." });
  }
}

export async function disableRule(ruleId: string): Promise<Result<void>> {
  const rule = await db.recurrenceRules.get(ruleId);
  if (!rule) return err({ code: "not_found", message: "That repeat is gone." });
  try {
    // version++ invalidates the generateDates memo (state=disabled yields []).
    await db.recurrenceRules.update(ruleId, {
      state: "disabled",
      version: rule.version + 1,
      updatedAt: Date.now(),
    });
    emitChange(["recurrenceRules"]);
    return ok(undefined);
  } catch (e) {
    console.error("disableRule failed", e);
    return err({ code: "write_failed", message: "Couldn't stop that repeat." });
  }
}

export async function enableRule(ruleId: string): Promise<Result<void>> {
  const rule = await db.recurrenceRules.get(ruleId);
  if (!rule) return err({ code: "not_found", message: "That repeat is gone." });
  try {
    // version++ invalidates the generateDates memo (state=active yields dates).
    await db.recurrenceRules.update(ruleId, {
      state: "active",
      version: rule.version + 1,
      updatedAt: Date.now(),
    });
    emitChange(["recurrenceRules"]);
    return ok(undefined);
  } catch (e) {
    console.error("enableRule failed", e);
    return err({ code: "write_failed", message: "Couldn't re-enable that." });
  }
}

/** End the rule before a date ("cancel this and future"). */
export async function endRuleBefore(
  ruleId: string,
  originalDate: string
): Promise<Result<void>> {
  const rule = await db.recurrenceRules.get(ruleId);
  if (!rule) return err({ code: "not_found", message: "That repeat is gone." });
  try {
    // version++ invalidates the generateDates memo (endDate clamps the window).
    await db.recurrenceRules.update(ruleId, {
      endDate: addDays(originalDate, -1),
      version: rule.version + 1,
      updatedAt: Date.now(),
    });
    emitChange(["recurrenceRules"]);
    return ok(undefined);
  } catch (e) {
    console.error("endRuleBefore failed", e);
    return err({ code: "write_failed", message: "Couldn't update that repeat." });
  }
}

/* ---------- occurrence-level actions (sparse state) ---------- */

async function upsertOccurrenceState(
  ruleId: string,
  occurrenceKey: string,
  originalDate: string,
  mutate: (existing: OccurrenceState) => OccurrenceState
): Promise<Result<void>> {
  try {
    await db.transaction("rw", [db.occurrenceStates, db.recurrenceRules], async () => {
      const existing = await db.occurrenceStates
        .where("[ruleId+occurrenceKey]")
        .equals([ruleId, occurrenceKey])
        .first();
      const now = Date.now();
      const base: OccurrenceState = existing ?? {
        id: uid(),
        ruleId,
        occurrenceKey,
        originalDate,
        kind: "modified",
        createdAt: now,
        updatedAt: now,
      };
      await db.occurrenceStates.put(mutate(base));
    });
    emitChange(["occurrenceStates"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that." });
  }
}

export async function setOccurrenceExecution(
  ruleId: string,
  occurrenceKey: string,
  originalDate: string,
  status: ExecutionStatus
): Promise<Result<void>> {
  return upsertOccurrenceState(ruleId, occurrenceKey, originalDate, (s) => ({
    ...s,
    kind: s.kind === "cancelled" ? "modified" : s.kind,
    executionStatus: status,
    completedAt: status === "completed" ? Date.now() : undefined,
    updatedAt: Date.now(),
  }));
}

export async function modifyOccurrence(
  ruleId: string,
  occurrenceKey: string,
  originalDate: string,
  overrides: Partial<Pick<OccurrenceState, "overrideDate" | "overrideTitle" | "overrideStartTime" | "overrideEndTime" | "overrideDurationMinutes" | "overridePeriodSettingId">>
): Promise<Result<void>> {
  return upsertOccurrenceState(ruleId, occurrenceKey, originalDate, (s) => ({
    ...s,
    kind: "modified",
    ...overrides,
    updatedAt: Date.now(),
  }));
}

export async function cancelOccurrence(
  ruleId: string,
  occurrenceKey: string,
  originalDate: string
): Promise<Result<void>> {
  return upsertOccurrenceState(ruleId, occurrenceKey, originalDate, (s) => ({
    ...s,
    kind: "cancelled",
    updatedAt: Date.now(),
  }));
}

export async function restoreOccurrence(
  ruleId: string,
  occurrenceKey: string
): Promise<Result<void>> {
  return upsertOccurrenceState(ruleId, occurrenceKey, "", (s) => ({
    ...s,
    kind: "modified",
    updatedAt: Date.now(),
  }));
}

/* ---------- "this and future" split (§8.4) ---------- */

export async function editThisAndFuture(
  ruleId: string,
  originalDate: string,
  patch: Partial<RuleInput>
): Promise<Result<void>> {
  const rule = await db.recurrenceRules.get(ruleId);
  if (!rule) return err({ code: "not_found", message: "That repeat is gone." });
  if (compareDates(originalDate, rule.startDate) <= 0) {
    // splitting at the first occurrence equals editing the entire rule
    return updateRule(ruleId, patch);
  }
  const newRuleInput: RuleInput = {
    itemId: rule.itemId,
    routineId: rule.routineId,
    pattern: patch.pattern ?? rule.pattern,
    interval: patch.interval ?? rule.interval,
    byWeekday: patch.byWeekday ?? rule.byWeekday,
    byMonthDay: patch.byMonthDay ?? rule.byMonthDay,
    monthDayMode: patch.monthDayMode ?? rule.monthDayMode,
    startDate: originalDate,
    endDate: patch.endDate ?? rule.endDate,
    startTime: patch.startTime ?? rule.startTime,
    endTime: patch.endTime ?? rule.endTime,
    periodSettingId: patch.periodSettingId ?? rule.periodSettingId,
    weekAnchor: rule.weekAnchor,
  };
  const problem = validateRuleInput(newRuleInput);
  if (problem) return err({ code: "validation", message: problem });
  const now = Date.now();
  const newRule: RecurrenceRule = {
    id: uid(),
    ...newRuleInput,
    itemId: rule.itemId,
    routineId: rule.routineId,
    state: rule.state,
    pauseSegments: [],
    createdAt: now,
    updatedAt: now,
    version: rule.version + 1,
    supersedesRuleId: rule.id,
  };
  try {
    await db.transaction(
      "rw",
      [db.recurrenceRules, db.occurrenceStates],
      async () => {
        await db.recurrenceRules.update(rule.id, {
          endDate: addDays(originalDate, -1),
          updatedAt: now,
        });
        await db.recurrenceRules.add(newRule);
        // future states re-point to the new rule; keys unchanged (shared root)
        const states = await db.occurrenceStates
          .where("ruleId")
          .equals(rule.id)
          .toArray();
        for (const s of states) {
          if (compareDates(s.originalDate, originalDate) >= 0) {
            await db.occurrenceStates.update(s.id, { ruleId: newRule.id });
          }
        }
      }
    );
    emitChange(["recurrenceRules", "occurrenceStates"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't update that repeat." });
  }
}

/* ---------- helpers for UI ---------- */

export async function getRulesForItem(itemId: string): Promise<RecurrenceRule[]> {
  return db.recurrenceRules.where("itemId").equals(itemId).toArray();
}

export async function getRulesForRoutine(
  routineId: string
): Promise<RecurrenceRule[]> {
  return db.recurrenceRules.where("routineId").equals(routineId).toArray();
}

export function buildStatesByKey(
  states: OccurrenceState[]
): Map<string, OccurrenceState> {
  const map = new Map<string, OccurrenceState>();
  for (const s of states) map.set(s.occurrenceKey, s);
  return map;
}

export function buildRulesById(
  rules: RecurrenceRule[]
): Map<string, RecurrenceRule> {
  return new Map(rules.map((r) => [r.id, r]));
}

export async function resolveItemTitles(
  occurrences: Occurrence[],
  itemsById: Map<string, Item>
): Promise<Occurrence[]> {
  return occurrences.map((o) => ({
    ...o,
    title: o.title || (o.itemId ? itemsById.get(o.itemId)?.title ?? "" : ""),
  }));
}

export const PATTERN_LABELS: Record<RecurrencePattern, string> = {
  daily: "Every day",
  weekdays: "Selected weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};
