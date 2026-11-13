/* ReviewService — optional weekly reflection (§3.14, D10, D23). */

import { db } from "../db";
import { emitChange } from "../events";
import { uid } from "../ids";
import type { Result, WeeklyReview, WeeklyReviewAnswers } from "../types";
import { err, ok } from "../types";
import { ensureWeekTx } from "./planning-service";

export async function saveReview(
  weekStartDate: string,
  answers: WeeklyReviewAnswers
): Promise<Result<void>> {
  try {
    await db.transaction("rw", [db.weeklyPlans, db.weeklyReviews], async () => {
      const plan = await ensureWeekTx(weekStartDate);
      const existing = await db.weeklyReviews.where("weeklyPlanId").equals(plan.id).first();
      const now = Date.now();
      if (existing) {
        await db.weeklyReviews.update(existing.id, {
          answers,
          updatedAt: now,
        });
      } else {
        const review: WeeklyReview = {
          id: uid(),
          weeklyPlanId: plan.id,
          answers,
          createdAt: now,
          updatedAt: now,
        };
        await db.weeklyReviews.add(review);
      }
    });
    emitChange(["weeklyReviews", "weeklyPlans"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save this review." });
  }
}

export async function getReviewForWeek(
  weekStartDate: string
): Promise<WeeklyReview | undefined> {
  const plan = await db.weeklyPlans.where("startDate").equals(weekStartDate).first();
  if (!plan) return undefined;
  return db.weeklyReviews.where("weeklyPlanId").equals(plan.id).first();
}

export async function listReviews(): Promise<WeeklyReview[]> {
  const reviews = await db.weeklyReviews.toArray();
  return reviews.sort((a, b) => b.updatedAt - a.updatedAt);
}
