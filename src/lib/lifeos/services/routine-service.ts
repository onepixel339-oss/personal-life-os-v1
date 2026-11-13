/* RoutineService — flexible templates + snapshotted executions (§8.7, F10).
   Partial completion is normal; no scores, no streaks. */

import { db, logActivity } from "../db";
import { emitChange } from "../events";
import { keyAfter, keyBetween } from "../fractional";
import { uid } from "../ids";
import type {
  Result,
  Routine,
  RoutineExecution,
  RoutineExecutionStep,
  RoutineItem,
} from "../types";
import { err, ok } from "../types";
import { addEntryToDay } from "./planning-service";

export async function createRoutine(input: {
  name: string;
  description?: string;
}): Promise<Result<Routine>> {
  const name = input.name.trim();
  if (!name || name.length > 200)
    return err({ code: "validation", message: "A routine name is needed." });
  const all = await db.routines.toArray();
  const routine: Routine = {
    id: uid(),
    name,
    description: (input.description ?? "").slice(0, 2000),
    sortOrder: keyAfter(all.filter((r) => !r.archivedAt).map((r) => r.sortOrder)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  try {
    await db.routines.add(routine);
    emitChange(["routines"]);
    return ok(routine);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't create that routine." });
  }
}

export async function updateRoutine(
  id: string,
  patch: { name?: string; description?: string }
): Promise<Result<void>> {
  const routine = await db.routines.get(id);
  if (!routine) return err({ code: "not_found", message: "Routine not found." });
  const next: Partial<Routine> = { updatedAt: Date.now() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name || name.length > 200)
      return err({ code: "validation", message: "A routine name is needed." });
    next.name = name;
  }
  if (patch.description !== undefined)
    next.description = patch.description.slice(0, 2000);
  try {
    await db.routines.update(id, next);
    emitChange(["routines"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that." });
  }
}

export async function archiveRoutine(id: string): Promise<Result<void>> {
  try {
    await db.routines.update(id, { archivedAt: Date.now(), updatedAt: Date.now() });
    emitChange(["routines"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't archive that routine." });
  }
}

export async function restoreRoutine(id: string): Promise<Result<void>> {
  try {
    await db.routines.update(id, { archivedAt: undefined, updatedAt: Date.now() });
    emitChange(["routines"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't restore that routine." });
  }
}

export async function addRoutineItem(
  routineId: string,
  input: { title: string; durationMinutes?: number; itemId?: string }
): Promise<Result<RoutineItem>> {
  const title = input.title.trim();
  if (!title || title.length > 500)
    return err({ code: "validation", message: "A title is needed." });
  if (
    input.durationMinutes !== undefined &&
    (input.durationMinutes < 1 || input.durationMinutes > 1440)
  )
    return err({ code: "validation", message: "Duration should be 1–1440 minutes." });
  const siblings = await db.routineItems.where("routineId").equals(routineId).toArray();
  const item: RoutineItem = {
    id: uid(),
    routineId,
    title,
    durationMinutes: input.durationMinutes,
    itemId: input.itemId,
    sortOrder: keyAfter(siblings.map((s) => s.sortOrder)),
  };
  try {
    await db.routineItems.add(item);
    emitChange(["routineItems"]);
    return ok(item);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't add that step." });
  }
}

export async function updateRoutineItem(
  id: string,
  patch: { title?: string; durationMinutes?: number; itemId?: string | null }
): Promise<Result<void>> {
  const existing = await db.routineItems.get(id);
  if (!existing) return err({ code: "not_found", message: "That step is gone." });
  const next: Partial<RoutineItem> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return err({ code: "validation", message: "A title is needed." });
    next.title = title;
  }
  if (patch.durationMinutes !== undefined)
    next.durationMinutes =
      patch.durationMinutes === null ? undefined : patch.durationMinutes;
  if (patch.itemId !== undefined)
    next.itemId = patch.itemId === null ? undefined : patch.itemId;
  try {
    await db.routineItems.update(id, next);
    emitChange(["routineItems"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that step." });
  }
}

export async function removeRoutineItem(id: string): Promise<Result<void>> {
  try {
    await db.routineItems.delete(id);
    emitChange(["routineItems"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't remove that step." });
  }
}

export async function moveRoutineItem(
  id: string,
  beforeId: string | null,
  afterId: string | null
): Promise<Result<void>> {
  const existing = await db.routineItems.get(id);
  if (!existing) return err({ code: "not_found", message: "That step is gone." });
  const siblings = await db.routineItems
    .where("routineId")
    .equals(existing.routineId)
    .toArray();
  const before = beforeId
    ? siblings.find((s) => s.id === beforeId)?.sortOrder ?? null
    : null;
  const after = afterId
    ? siblings.find((s) => s.id === afterId)?.sortOrder ?? null
    : null;
  try {
    await db.routineItems.update(id, { sortOrder: keyBetween(before, after) });
    emitChange(["routineItems"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't move that step." });
  }
}

/** "Add routine to Today" — one DailyEntry of kind routine (F10). */
export async function addRoutineToToday(
  routineId: string,
  date: string,
  periodId?: string,
  startTime?: string
): Promise<Result<{ dailyEntryId: string }>> {
  const routine = await db.routines.get(routineId);
  if (!routine) return err({ code: "not_found", message: "Routine not found." });
  const res = await addEntryToDay({
    date,
    kind: "routine",
    routineId,
    periodId,
    startTime,
  });
  if (!res.ok) return res as Result<{ dailyEntryId: string }>;
  return ok({ dailyEntryId: res.value.id });
}

/** Start: snapshotted steps so later edits don't rewrite history [RULE]. */
export async function startRoutine(
  routineId: string,
  date: string,
  dailyEntryId?: string
): Promise<Result<RoutineExecution>> {
  const routine = await db.routines.get(routineId);
  if (!routine) return err({ code: "not_found", message: "Routine not found." });
  const steps = (
    await db.routineItems.where("routineId").equals(routineId).toArray()
  ).sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : 1));
  const execution: RoutineExecution = {
    id: uid(),
    routineId,
    dailyEntryId,
    date,
    startedAt: Date.now(),
    state: "in_progress",
    titleSnapshot: routine.name,
  };
  const stepRows: RoutineExecutionStep[] = steps.map((s) => ({
    id: uid(),
    executionId: execution.id,
    routineItemId: s.id,
    titleSnapshot: s.title,
    durationSnapshot: s.durationMinutes,
    status: "pending",
    updatedAt: Date.now(),
    sortOrder: s.sortOrder,
  }));
  try {
    await db.transaction("rw", [db.routineExecutions, db.routineExecutionSteps], async () => {
      await db.routineExecutions.add(execution);
      if (stepRows.length) await db.routineExecutionSteps.bulkAdd(stepRows);
    });
    logActivity("routineExecution", execution.id, "start");
    emitChange(["routineExecutions", "routineExecutionSteps"]);
    return ok(execution);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't start that routine." });
  }
}

export async function setStepStatus(
  stepId: string,
  status: "pending" | "done" | "skipped"
): Promise<Result<void>> {
  try {
    await db.routineExecutionSteps.update(stepId, {
      status,
      updatedAt: Date.now(),
    });
    emitChange(["routineExecutionSteps"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that step." });
  }
}

/** Ending with pending steps is normal — no "incomplete" label (§8.7). */
export async function endRoutine(executionId: string): Promise<Result<void>> {
  try {
    await db.routineExecutions.update(executionId, {
      state: "ended",
      endedAt: Date.now(),
    });
    emitChange(["routineExecutions"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't end that routine." });
  }
}

export async function getExecutionSteps(
  executionId: string
): Promise<RoutineExecutionStep[]> {
  const steps = await db.routineExecutionSteps
    .where("executionId")
    .equals(executionId)
    .toArray();
  return steps.sort((a, b) =>
    a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0
  );
}

export async function getActiveExecution(
  routineId: string
): Promise<RoutineExecution | undefined> {
  return db.routineExecutions
    .where("routineId")
    .equals(routineId)
    .filter((e) => e.state === "in_progress")
    .last();
}

export async function getRecentExecutions(limit = 10): Promise<RoutineExecution[]> {
  const all = await db.routineExecutions.toArray();
  return all.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}
