/* Day closure (v1.2) — "قفلة اليوم": one gentle tap that ends the day.
   Closure, never a streak: an unclosed day simply passes with the night and
   nothing ever mentions it. The flag lives on the daily plan as a
   NON-indexed field, so no schema bump is needed. */

import { db } from "../db";
import { emitChange } from "../events";
import { ensurePlan } from "./planning-service";
import type { Result } from "../types";
import { ok } from "../types";

export async function closeDay(date: string): Promise<Result<void>> {
  const plan = await ensurePlan(date);
  await db.dailyPlans.update(plan.id, { closedAt: Date.now() });
  emitChange(["dailyPlans"]);
  return ok(undefined);
}

/** Undo a mis-tap (never advertised — just a quiet safety net). */
export async function reopenDay(date: string): Promise<Result<void>> {
  const plan = await db.dailyPlans.where("date").equals(date).first();
  if (plan && typeof plan.closedAt === "number") {
    await db.dailyPlans.update(plan.id, { closedAt: undefined });
    emitChange(["dailyPlans"]);
  }
  return ok(undefined);
}

/** date -> closedAt for the given days (absent = not closed). */
export async function getClosedMap(
  days: string[]
): Promise<Map<string, number>> {
  if (days.length === 0) return new Map();
  const plans = await db.dailyPlans.where("date").anyOf(days).toArray();
  const map = new Map<string, number>();
  for (const p of plans) {
    if (typeof p.closedAt === "number") map.set(p.date, p.closedAt);
  }
  return map;
}
