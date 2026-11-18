/* PlanningService — DailyPlan/DailyEntry and WeeklyPlan/WeeklyEntry (§3.1, §3.2, §9).
   Rules honored here: no auto-transfers (P4), execution ≠ item status (P7),
   remove-from-plan removes only the entry, lazy plan creation (D15),
   duplicate prevention (D17), period snapshots with prayer anchors (D16). */

import { db, logActivity } from "../db";
import { emitChange } from "../events";
import { keyAfter, keyBetween } from "../fractional";
import { uid } from "../ids";
import { isValidTimeString, timeToMinutes, todayLocal, weekStart } from "../dates";
import { resolvePrayerTimes, type PrayerSettings } from "../prayer";
import type { Anchor, DailyEntry, DailyPeriod, DailyPlan, ExecutionStatus, Item, PeriodSetting, ResolvedPeriod, Result, WeeklyEntry, WeeklyPlan } from "../types";
import { err, ok } from "../types";
import type { Undoable } from "./history-service";
import { DEFAULT_PRAYER } from "../defaults";
import { SETTING_KEYS } from "../defaults";

/* ---------- anchor & period resolution (D16) ---------- */

export function resolveAnchor(
  anchor: Anchor | undefined,
  prayerTimes: Record<string, string>
): { time?: string; dayOffset: 0 | 1 } {
  if (!anchor) return { dayOffset: 0 };
  if (anchor.kind === "clock") {
    return isValidTimeString(anchor.time)
      ? { time: anchor.time, dayOffset: 0 }
      : { dayOffset: 0 };
  }
  const base = prayerTimes[anchor.prayer];
  if (!base) return { dayOffset: 0 };
  const total = timeToMinutes(base) + anchor.offsetMin;
  const dayOffset: 0 | 1 = anchor.nextDay || total >= 1440 ? 1 : 0;
  const clamped = Math.max(0, Math.min(1439, total));
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, dayOffset };
}

/** Resolve the enabled periods of a date from settings (virtual, not persisted). */
export function resolvePeriodsForDate(
  date: string,
  settings: PeriodSetting[],
  prayer: PrayerSettings
): ResolvedPeriod[] {
  const { times } = resolvePrayerTimes(date, prayer);
  return settings
    .filter((s) => s.enabled)
    .map((s) => {
      const start = resolveAnchor(s.startAnchor, times);
      const end = resolveAnchor(s.endAnchor, times);
      return {
        id: `virtual:${s.id}`,
        settingId: s.id,
        name: s.name,
        tagline: s.tagline,
        mode: s.mode,
        startTime: start.time,
        endTime: end.time,
        endDayOffset: end.dayOffset,
        durationMinutes: s.durationMinutes,
        order: s.order,
      } satisfies ResolvedPeriod;
    })
    .sort((a, b) => a.order - b.order);
}

/* ---------- daily plan ---------- */

async function getPrayerInTx(): Promise<PrayerSettings> {
  const row = await db.appSettings.get(SETTING_KEYS.prayer);
  return (row?.value as PrayerSettings) ?? DEFAULT_PRAYER;
}

/** Create the DailyPlan + period snapshot if missing, inside the current transaction (D15). */
export async function ensurePlanTx(
  date: string
): Promise<{ plan: DailyPlan; periods: DailyPeriod[] }> {
  let plan = await db.dailyPlans.where("date").equals(date).first();
  if (!plan) {
    plan = { id: uid(), date, createdAt: Date.now() };
    await db.dailyPlans.add(plan);
    const settings = await db.periodSettings.orderBy("order").toArray();
    const prayer = await getPrayerInTx();
    const { times } = resolvePrayerTimes(date, prayer);
    const planId = plan.id;
    const rows: DailyPeriod[] = settings
      .filter((s) => s.enabled)
      .map((s) => {
        const start = resolveAnchor(s.startAnchor, times);
        const end = resolveAnchor(s.endAnchor, times);
        return {
          id: uid(),
          dailyPlanId: planId,
          settingId: s.id,
          name: s.name,
          tagline: s.tagline,
          mode: s.mode,
          startTime: start.time,
          endTime: end.time,
          endDayOffset: end.dayOffset,
          durationMinutes: s.durationMinutes,
          order: s.order,
        };
      });
    if (rows.length) await db.dailyPeriods.bulkAdd(rows);
  }
  const periods = await db.dailyPeriods
    .where("dailyPlanId")
    .equals(plan.id)
    .toArray();
  periods.sort((a, b) => a.order - b.order);
  return { plan, periods };
}

export async function ensurePlan(date: string): Promise<DailyPlan> {
  const res = await db.transaction(
    "rw",
    [db.dailyPlans, db.dailyPeriods, db.periodSettings, db.appSettings],
    async () => {
      const { plan } = await ensurePlanTx(date);
      return plan;
    }
  );
  emitChange(["dailyPlans", "dailyPeriods"]);
  return res;
}

/** "Use today's new setup for this day" — explicit, never automatic (D15). */
export async function reSnapshotPeriods(
  date: string
): Promise<Result<void>> {
  try {
    await db.transaction(
      "rw",
      [db.dailyPlans, db.dailyPeriods, db.dailyEntries, db.periodSettings, db.appSettings],
      async () => {
        const { plan, periods } = await ensurePlanTx(date);
        const settings = await db.periodSettings.orderBy("order").toArray();
        const prayer = await getPrayerInTx();
        const { times } = resolvePrayerTimes(date, prayer);
        const fresh = settings.filter((s) => s.enabled);
        const keptIds = new Set<string>();
        for (const s of fresh) {
          const existing = periods.find((p) => p.settingId === s.id);
          const start = resolveAnchor(s.startAnchor, times);
          const end = resolveAnchor(s.endAnchor, times);
          if (existing) {
            keptIds.add(existing.id);
            await db.dailyPeriods.update(existing.id, {
              name: s.name,
              tagline: s.tagline,
              mode: s.mode,
              startTime: start.time,
              endTime: end.time,
              endDayOffset: end.dayOffset,
              durationMinutes: s.durationMinutes,
              order: s.order,
            });
          } else {
            const row: DailyPeriod = {
              id: uid(),
              dailyPlanId: plan.id,
              settingId: s.id,
              name: s.name,
              tagline: s.tagline,
              mode: s.mode,
              startTime: start.time,
              endTime: end.time,
              endDayOffset: end.dayOffset,
              durationMinutes: s.durationMinutes,
              order: s.order,
            };
            keptIds.add(row.id);
            await db.dailyPeriods.add(row);
          }
        }
        const removed = periods.filter((p) => !keptIds.has(p.id));
        if (removed.length) {
          const removedIds = new Set(removed.map((p) => p.id));
          const entries = await db.dailyEntries
            .where("dailyPlanId")
            .equals(plan.id)
            .toArray();
          for (const e of entries) {
            if (e.periodId && removedIds.has(e.periodId)) {
              await db.dailyEntries.update(e.id, {
                periodId: undefined,
                updatedAt: Date.now(),
              });
            }
          }
          await db.dailyPeriods.bulkDelete(removed.map((p) => p.id));
        }
      }
    );
    emitChange(["dailyPeriods", "dailyEntries"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "db_error", message: "Couldn't refresh this day's setup." });
  }
}

/** Propose the period containing a time (§9.1 — propose, never force). */
export function proposePeriodSettingId(
  periods: (Pick<ResolvedPeriod, "settingId" | "startTime" | "endTime" | "endDayOffset"> & { id: string })[],
  time: string
): string | null {
  const t = timeToMinutes(time);
  for (const p of periods) {
    if (!p.startTime) continue;
    const start = timeToMinutes(p.startTime);
    const end = p.endTime
      ? timeToMinutes(p.endTime) + (p.endDayOffset ?? 0) * 1440
      : start + 60;
    if (t >= start && t < end) return p.settingId ?? p.id;
  }
  return null;
}

/* ---------- daily entries ---------- */

export interface AddDailyEntryInput {
  date: string;
  kind: "item" | "routine";
  itemId?: string;
  routineId?: string;
  occurrenceKey?: string;
  periodId?: string;
  /** v1.5: the stable way to place — resolved onto the day's period snapshot
   *  (virtual ids on a fresh day are remapped, stale ids never dangle). */
  periodSettingId?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  allowMultiple?: boolean; // explicit multi-session adds (entertainment…)
}

/** Map a period reference onto THIS day's real period snapshot ids.
 *  Virtual ids (fresh day) are remapped by setting id; a raw id that belongs
 *  to no period of this day is dropped rather than stored dangling. */
function resolvePeriodId(
  input: Pick<AddDailyEntryInput, "periodId" | "periodSettingId">,
  periods: DailyPeriod[]
): string | undefined {
  let periodId = input.periodId;
  if (input.periodSettingId) {
    const bySetting = periods.find(
      (p) => p.settingId === input.periodSettingId
    )?.id;
    if (bySetting) periodId = bySetting;
  }
  if (!periodId) return undefined;
  if (periodId.startsWith("virtual:")) {
    const sid = periodId.slice("virtual:".length);
    return periods.find((p) => p.settingId === sid)?.id;
  }
  return periods.some((p) => p.id === periodId) ? periodId : undefined;
}

function validateEntryTimes(input: AddDailyEntryInput): string | null {
  if (input.startTime && !isValidTimeString(input.startTime))
    return "Start time should look like 09:30.";
  if (input.endTime && !isValidTimeString(input.endTime))
    return "End time should look like 10:30.";
  if (input.startTime && input.endTime && input.endTime < input.startTime)
    return "End time should be at or after the start time.";
  if (
    input.durationMinutes !== undefined &&
    (input.durationMinutes < 1 || input.durationMinutes > 1440)
  )
    return "Duration should be between 1 minute and 24 hours.";
  return null;
}

export async function addEntryToDay(
  input: AddDailyEntryInput
): Promise<Result<DailyEntry & Undoable & { alreadyPlaced?: boolean }>> {
  if (input.kind === "item" && !input.itemId)
    return err({ code: "validation", message: "An item is needed." });
  if (input.kind === "routine" && !input.routineId)
    return err({ code: "validation", message: "A routine is needed." });
  if (input.kind === "routine" && input.itemId)
    return err({ code: "validation", message: "A routine entry can't also carry an item." });
  const timeError = validateEntryTimes(input);
  if (timeError) return err({ code: "validation", message: timeError });
  try {
    const created = await db.transaction(
      "rw",
      [db.dailyPlans, db.dailyPeriods, db.dailyEntries, db.periodSettings, db.appSettings, db.items, db.routines, db.activityHistory],
      async () => {
        const { plan, periods } = await ensurePlanTx(input.date);
        const periodId = resolvePeriodId(input, periods);
        // duplicate prevention (D17) — items and routines, one gentle rule:
        // re-adding with a period in hand HONORS the placement (the entry
        // moves there) instead of bouncing the user off with an error.
        if (input.itemId || input.routineId) {
          const existing = (
            await db.dailyEntries
              .where("dailyPlanId")
              .equals(plan.id)
              .toArray()
          ).filter(
            (e) =>
              (input.itemId ? e.itemId === input.itemId : false) ||
              (input.routineId ? e.routineId === input.routineId : false)
          );
          const sameOccurrence = existing.filter(
            (e) => (e.occurrenceKey ?? "") === (input.occurrenceKey ?? "")
          );
          if (sameOccurrence.length && !input.allowMultiple) {
            // v1.5 (review N2): the user's period AND time both land — a
            // fresh choice is honored, never silently dropped.
            if (periodId || input.startTime) {
              const existingEntry = sameOccurrence[0];
              const prevPeriodId = existingEntry.periodId;
              const prevStartTime = existingEntry.startTime;
              const patch: Partial<DailyEntry> = { updatedAt: Date.now() };
              if (periodId) patch.periodId = periodId;
              if (input.startTime) patch.startTime = input.startTime;
              await db.dailyEntries.update(existingEntry.id, patch);
              return {
                entry: { ...existingEntry, ...patch },
                alreadyPlaced: true as const,
                prevPeriodId,
                prevStartTime,
              };
            }
            const title = input.itemId
              ? (await db.items.get(input.itemId))?.title ?? "This item"
              : (await db.routines.get(input.routineId!))?.name ?? "This routine";
            return {
              duplicate: true as const,
              message: `“${title}” is already on this day.`,
            };
          }
        }
        const siblings = await db.dailyEntries
          .where("dailyPlanId")
          .equals(plan.id)
          .filter((e) => (e.periodId ?? "") === (periodId ?? ""))
          .toArray();
        const now = Date.now();
        const entry: DailyEntry = {
          id: uid(),
          dailyPlanId: plan.id,
          kind: input.kind,
          itemId: input.itemId,
          routineId: input.routineId,
          occurrenceKey: input.occurrenceKey,
          periodId,
          startTime: input.startTime,
          endTime: input.endTime,
          durationMinutes: input.durationMinutes,
          executionStatus: "pending",
          sortOrder: keyAfter(siblings.map((e) => e.sortOrder)),
          createdAt: now,
          updatedAt: now,
        };
        await db.dailyEntries.add(entry);
        // must be awaited: an un-awaited write inside a transaction can be
        // dropped when the transaction commits first (real IndexedDB)
        await logActivity("dailyEntry", entry.id, "add", { date: input.date });
        return { entry };
      }
    );
    if ("duplicate" in created && created.duplicate)
      return err({ code: "duplicate", message: created.message });
    const entry = created.entry;
    emitChange(["dailyEntries", "dailyPlans"]);
    if ("alreadyPlaced" in created && created.alreadyPlaced) {
      // v1.5: the entry existed; the user's fresh period/time choice just
      // moved it — undo returns it to exactly where it was, never deletes.
      const prevPeriodId = created.prevPeriodId;
      const prevStartTime = created.prevStartTime;
      return ok({
        ...entry,
        alreadyPlaced: true,
        undo: {
          label: "Back to its place on the day",
          undo: async () => {
            await db.dailyEntries.update(entry.id, {
              periodId: prevPeriodId,
              startTime: prevStartTime,
              updatedAt: Date.now(),
            });
            emitChange(["dailyEntries"]);
          },
        },
      });
    }
    return ok({
      ...entry,
      undo: {
        label: "Removed from the day",
        undo: async () => {
          await db.dailyEntries.delete(entry.id);
          emitChange(["dailyEntries"]);
        },
      },
    });
  } catch (e) {
    console.error(e);
    return err({
      code: "write_failed",
      message: "Couldn't save that. Nothing was changed.",
    });
  }
}

export async function updateEntryTimes(
  entryId: string,
  patch: {
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    periodId?: string | null;
  }
): Promise<Result<void>> {
  const entry = await db.dailyEntries.get(entryId);
  if (!entry) return err({ code: "not_found", message: "That entry is gone." });
  const next = {
    startTime: patch.startTime !== undefined ? patch.startTime : entry.startTime,
    endTime: patch.endTime !== undefined ? patch.endTime : entry.endTime,
    durationMinutes:
      patch.durationMinutes !== undefined ? patch.durationMinutes : entry.durationMinutes,
  };
  if (next.startTime && !isValidTimeString(next.startTime))
    return err({ code: "validation", message: "Start time should look like 09:30." });
  if (next.endTime && !isValidTimeString(next.endTime))
    return err({ code: "validation", message: "End time should look like 10:30." });
  if (next.startTime && next.endTime && next.endTime < next.startTime)
    return err({ code: "validation", message: "End time should be at or after the start time." });
  if (
    next.durationMinutes !== undefined &&
    next.durationMinutes !== null &&
    (next.durationMinutes < 1 || next.durationMinutes > 1440)
  )
    return err({ code: "validation", message: "Duration should be 1–1440 minutes." });
  try {
    await db.transaction("rw", db.dailyEntries, async () => {
      const patchUpdate: Partial<DailyEntry> = { updatedAt: Date.now() };
      if (patch.startTime !== undefined) patchUpdate.startTime = patch.startTime || undefined;
      if (patch.endTime !== undefined) patchUpdate.endTime = patch.endTime || undefined;
      if (patch.durationMinutes !== undefined)
        patchUpdate.durationMinutes = patch.durationMinutes || undefined;
      if (patch.periodId !== undefined)
        patchUpdate.periodId = patch.periodId || undefined;
      await db.dailyEntries.update(entryId, patchUpdate);
    });
    emitChange(["dailyEntries"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that. Nothing was changed." });
  }
}

/** Move an entry between periods (same day), by setting id (materializes the plan). */
export async function setEntryPeriodBySetting(
  entryId: string,
  settingId: string | null
): Promise<Result<void>> {
  const entry = await db.dailyEntries.get(entryId);
  if (!entry) return err({ code: "not_found", message: "That entry is gone." });
  try {
    await db.transaction(
      "rw",
      [db.dailyPlans, db.dailyPeriods, db.dailyEntries, db.periodSettings, db.appSettings],
      async () => {
        const plan = await db.dailyPlans.get(entry.dailyPlanId);
        if (!plan) return;
        const { periods } = await ensurePlanTx(plan.date);
        const target = settingId
          ? periods.find((p) => p.settingId === settingId)
          : null;
        await db.dailyEntries.update(entryId, {
          periodId: target?.id,
          updatedAt: Date.now(),
        });
      }
    );
    emitChange(["dailyEntries", "dailyPlans"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't move that." });
  }
}

/** Move to another day (identity stable, §9.2). */
export async function moveEntryToDay(
  entryId: string,
  targetDate: string
): Promise<Result<void>> {
  const entry = await db.dailyEntries.get(entryId);
  if (!entry) return err({ code: "not_found", message: "That entry is gone." });
  try {
    await db.transaction(
      "rw",
      [db.dailyPlans, db.dailyPeriods, db.dailyEntries, db.periodSettings, db.appSettings],
      async () => {
        const { plan, periods } = await ensurePlanTx(targetDate);
        // v1.5: the period follows the move — same time of day, new day's
        // snapshot. It used to be wiped silently; now only a period that has
        // no twin on the target day lets go.
        let nextPeriodId: string | undefined;
        if (entry.periodId) {
          const oldPeriods = await db.dailyPeriods
            .where("dailyPlanId")
            .equals(entry.dailyPlanId)
            .toArray();
          const settingId = oldPeriods.find(
            (p) => p.id === entry.periodId
          )?.settingId;
          nextPeriodId = settingId
            ? periods.find((p) => p.settingId === settingId)?.id
            : undefined;
        }
        await db.dailyEntries.update(entryId, {
          dailyPlanId: plan.id,
          periodId: nextPeriodId,
          updatedAt: Date.now(),
        });
      }
    );
    emitChange(["dailyEntries", "dailyPlans"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't move that." });
  }
}

/** Remove from Today — deletes only this entry, never the Item [RULE]. */
export async function removeEntryFromDay(
  entryId: string
): Promise<Result<DailyEntry & Undoable>> {
  const entry = await db.dailyEntries.get(entryId);
  if (!entry) return err({ code: "not_found", message: "That entry is gone." });
  try {
    await db.transaction("rw", db.dailyEntries, db.routineExecutions, async () => {
      await db.dailyEntries.delete(entryId);
      // keep routine execution history (dailyEntryId dangles to null)
      await db.routineExecutions
        .where("dailyEntryId")
        .equals(entryId)
        .modify({ dailyEntryId: undefined });
    });
    logActivity("dailyEntry", entryId, "remove");
    emitChange(["dailyEntries", "routineExecutions"]);
    return ok({
      ...entry,
      undo: {
        label: "Back on the day",
        undo: async () => {
          const { ...clone } = entry;
          await db.dailyEntries.put(clone);
          emitChange(["dailyEntries"]);
        },
      },
    });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't remove that. Nothing changed." });
  }
}

/** Execution status — separate machine; never touches Item.status [RULE §5.3]. */
export async function setExecutionStatus(
  entryId: string,
  status: ExecutionStatus
): Promise<Result<DailyEntry & Undoable>> {
  const entry = await db.dailyEntries.get(entryId);
  if (!entry) return err({ code: "not_found", message: "That entry is gone." });
  const previous = entry.executionStatus;
  const now = Date.now();
  try {
    await db.transaction("rw", db.dailyEntries, async () => {
      await db.dailyEntries.update(entryId, {
        executionStatus: status,
        completedAt: status === "completed" ? now : undefined,
        updatedAt: now,
      });
    });
    emitChange(["dailyEntries"]);
    return ok({
      ...entry,
      executionStatus: status,
      undo: {
        label: `Back to ${previous}`,
        undo: async () => {
          await setExecutionStatus(entryId, previous);
        },
      },
    });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that. Nothing was changed." });
  }
}

/** Reorder within a day+period group. Pass targetKey from dnd, or dir. */
export async function reorderEntry(
  entryId: string,
  target: { key: string } | { dir: "up" | "down" }
): Promise<Result<void>> {
  const entry = await db.dailyEntries.get(entryId);
  if (!entry) return err({ code: "not_found", message: "That entry is gone." });
  const siblings = (
    await db.dailyEntries.where("dailyPlanId").equals(entry.dailyPlanId).toArray()
  )
    .filter((e) => (e.periodId ?? "") === (entry.periodId ?? ""))
    .sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0));
  const idx = siblings.findIndex((e) => e.id === entryId);
  let key: string | null = null;
  if ("key" in target) {
    key = target.key;
  } else if (target.dir === "up" && idx > 0) {
    const before = siblings[idx - 1];
    const prevPrev = siblings[idx - 2];
    key = keyBetween(prevPrev?.sortOrder ?? null, before.sortOrder);
  } else if (target.dir === "down" && idx < siblings.length - 1) {
    const after = siblings[idx + 1];
    const nextNext = siblings[idx + 2];
    key = keyBetween(after.sortOrder, nextNext?.sortOrder ?? null);
  }
  if (!key) return ok(undefined);
  try {
    await db.dailyEntries.update(entryId, { sortOrder: key, updatedAt: Date.now() });
    emitChange(["dailyEntries"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't reorder that." });
  }
}

/** Key for dropping between two siblings (dnd). */
export async function reorderKeyFor(
  entryId: string,
  beforeId: string | null,
  afterId: string | null
): Promise<string> {
  const entry = await db.dailyEntries.get(entryId);
  if (!entry) return keyAfter([]);
  const siblings = (
    await db.dailyEntries.where("dailyPlanId").equals(entry.dailyPlanId).toArray()
  ).filter((e) => (e.periodId ?? "") === (entry.periodId ?? ""));
  const before = beforeId ? siblings.find((e) => e.id === beforeId)?.sortOrder ?? null : null;
  const after = afterId ? siblings.find((e) => e.id === afterId)?.sortOrder ?? null : null;
  return keyBetween(before, after);
}

/* ---------- weekly ---------- */

export async function ensureWeekTx(
  startDate: string
): Promise<WeeklyPlan> {
  let plan = await db.weeklyPlans.where("startDate").equals(startDate).first();
  if (!plan) {
    const endDate = addDaysLocal(startDate, 6);
    plan = { id: uid(), startDate, endDate, createdAt: Date.now() };
    await db.weeklyPlans.add(plan);
  }
  return plan;
}

function addDaysLocal(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

export async function ensureWeek(startDate: string): Promise<WeeklyPlan> {
  const plan = await db.transaction("rw", db.weeklyPlans, async () => {
    return ensureWeekTx(startDate);
  });
  emitChange(["weeklyPlans"]);
  return plan;
}

export interface AddWeeklyEntryInput {
  weekStartDate: string;
  itemId: string;
  role?: "regular" | "outcome";
  scheduledDate?: string;
  occurrenceKey?: string;
}

export async function addEntryToWeek(
  input: AddWeeklyEntryInput
): Promise<Result<WeeklyEntry & Undoable>> {
  try {
    const created = await db.transaction(
      "rw",
      [db.weeklyPlans, db.weeklyEntries],
      async () => {
        const plan = await ensureWeekTx(input.weekStartDate);
        const occ = input.occurrenceKey ?? "";
        const dup = await db.weeklyEntries
          .where("[weeklyPlanId+itemId+occurrenceKey]")
          .equals([plan.id, input.itemId, occ])
          .first();
        if (dup) return { duplicate: true as const };
        const siblings = await db.weeklyEntries
          .where("weeklyPlanId")
          .equals(plan.id)
          .toArray();
        const entry: WeeklyEntry = {
          id: uid(),
          weeklyPlanId: plan.id,
          itemId: input.itemId,
          role: input.role ?? "regular",
          scheduledDate:
            input.scheduledDate &&
            input.scheduledDate >= plan.startDate &&
            input.scheduledDate <= plan.endDate
              ? input.scheduledDate
              : undefined,
          occurrenceKey: occ || undefined,
          sortOrder: keyAfter(siblings.map((e) => e.sortOrder)),
          createdAt: Date.now(),
        };
        await db.weeklyEntries.add(entry);
        return { entry };
      }
    );
    if ("duplicate" in created && created.duplicate) {
      return err({
        code: "duplicate",
        message: "Already part of this week.",
      });
    }
    const entry = created.entry;
    emitChange(["weeklyEntries", "weeklyPlans"]);
    return ok({
      ...entry,
      undo: {
        label: "Removed from the week",
        undo: async () => {
          await db.weeklyEntries.delete(entry.id);
          emitChange(["weeklyEntries"]);
        },
      },
    });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't add that to the week." });
  }
}

/** Assign a weekly entry to a day of its week (no DailyEntry is created) [RULE]. */
export async function setWeekEntryDay(
  entryId: string,
  date: string | null
): Promise<Result<void>> {
  const entry = await db.weeklyEntries.get(entryId);
  if (!entry) return err({ code: "not_found", message: "That entry is gone." });
  const plan = await db.weeklyPlans.get(entry.weeklyPlanId);
  if (!plan) return err({ code: "not_found", message: "That week is gone." });
  if (
    date &&
    (date < plan.startDate || date > plan.endDate)
  )
    return err({ code: "validation", message: "That day isn't in this week." });
  try {
    await db.weeklyEntries.update(entryId, { scheduledDate: date ?? undefined });
    emitChange(["weeklyEntries"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't assign that day." });
  }
}

export async function removeEntryFromWeek(
  entryId: string
): Promise<Result<WeeklyEntry & Undoable>> {
  const entry = await db.weeklyEntries.get(entryId);
  if (!entry) return err({ code: "not_found", message: "That entry is gone." });
  try {
    await db.weeklyEntries.delete(entryId);
    emitChange(["weeklyEntries"]);
    return ok({
      ...entry,
      undo: {
        label: "Back in the week",
        undo: async () => {
          await db.weeklyEntries.put(entry);
          emitChange(["weeklyEntries"]);
        },
      },
    });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't remove that. Nothing changed." });
  }
}

export async function getTodayStr(): Promise<string> {
  return todayLocal();
}

/* ---------- v1.5: the week → day bridge (P4 intact) ---------- */

export interface WeekBridgeRow {
  entry: WeeklyEntry;
  item: Item;
}

/** What the current week's plan assigned to THIS date, still not on the
 *  day's page. This is the honest bridge the weekly view always lacked:
 *  nothing ever moves by itself — the Today page simply shows what the
 *  week intends for this date, and one gentle button per row brings it over
 *  (a manual placement, exactly like any other). */
export async function getWeekBridgeItems(
  date: string,
  firstDay: number
): Promise<WeekBridgeRow[]> {
  const ws = weekStart(date, firstDay);
  const plan = await db.weeklyPlans.where("startDate").equals(ws).first();
  if (!plan) return [];
  const entries = (
    await db.weeklyEntries.where("weeklyPlanId").equals(plan.id).toArray()
  )
    .filter((e) => e.scheduledDate === date)
    .sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : 1));
  const dayPlan = await db.dailyPlans.where("date").equals(date).first();
  const onDay = new Set<string>();
  if (dayPlan) {
    const dayEntries = await db.dailyEntries
      .where("dailyPlanId")
      .equals(dayPlan.id)
      .toArray();
    for (const e of dayEntries) if (e.itemId) onDay.add(e.itemId);
  }
  const out: WeekBridgeRow[] = [];
  for (const e of entries) {
    if (!e.itemId || onDay.has(e.itemId)) continue;
    const item = await db.items.get(e.itemId);
    if (!item) continue;
    if (
      item.status === "completed" ||
      item.status === "cancelled" ||
      item.status === "archived"
    )
      continue;
    out.push({ entry: e, item });
  }
  return out;
}
