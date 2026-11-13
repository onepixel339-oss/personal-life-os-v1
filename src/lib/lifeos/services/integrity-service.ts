/* IntegrityService — finds and repairs dangling dependents (§6.3 rule 9-10).
   Repairs only dangling references (deletes them); never alters user content. */

import { db, ALL_STORES } from "../db";
import { emitChange } from "../events";

export interface IntegrityIssue {
  store: string;
  count: number;
  description: string;
}

export interface IntegrityReport {
  issues: IntegrityIssue[];
  repaired: boolean;
}

export async function checkIntegrity(repair = false): Promise<IntegrityReport> {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const store of ALL_STORES) {
    data[store] = await db.table(store).toArray();
  }
  const ids = (store: string) =>
    new Set(data[store].map((r) => r.id as string).filter(Boolean));
  const itemIds = ids("items");
  const spaceIds = ids("spaces");
  const planIds = ids("dailyPlans");
  const weekIds = ids("weeklyPlans");
  const ruleIds = ids("recurrenceRules");
  const routineIds = ids("routines");
  const noteItemIds = new Set(data.noteDetails.map((r) => r.itemId as string));

  const toDelete: Record<string, string[]> = {};
  const track = (store: string, id: unknown) => {
    if (typeof id !== "string") return;
    (toDelete[store] ??= []).push(id);
  };

  for (const row of data.itemSpaceLinks) {
    if (!itemIds.has(row.itemId as string) || !spaceIds.has(row.spaceId as string))
      track("itemSpaceLinks", row.id);
  }
  for (const row of data.itemRelationships) {
    if (
      !itemIds.has(row.sourceItemId as string) ||
      !itemIds.has(row.targetItemId as string)
    )
      track("itemRelationships", row.id);
  }
  for (const row of data.inboxEntries) {
    if (!itemIds.has(row.itemId as string)) track("inboxEntries", row.id);
  }
  for (const row of data.weeklyEntries) {
    if (
      !itemIds.has(row.itemId as string) ||
      !weekIds.has(row.weeklyPlanId as string)
    )
      track("weeklyEntries", row.id);
  }
  for (const row of data.dailyPeriods) {
    if (!planIds.has(row.dailyPlanId as string)) track("dailyPeriods", row.id);
  }
  for (const row of data.dailyEntries) {
    const itemMissing = row.itemId !== undefined && !itemIds.has(row.itemId as string);
    const routineMissing =
      row.routineId !== undefined && !routineIds.has(row.routineId as string);
    const noRef = row.itemId === undefined && row.routineId === undefined;
    const planMissing = !planIds.has(row.dailyPlanId as string);
    if (itemMissing || routineMissing || noRef || planMissing)
      track("dailyEntries", row.id);
  }
  for (const row of data.projectDetails) {
    if (!itemIds.has(row.itemId as string)) track("projectDetails", row.itemId);
  }
  for (const row of data.entertainmentDetails) {
    if (!itemIds.has(row.itemId as string))
      track("entertainmentDetails", row.itemId);
  }
  for (const row of data.returnNoteSettings) {
    if (!noteItemIds.has(row.noteItemId as string))
      track("returnNoteSettings", row.noteItemId);
  }
  for (const row of data.occurrenceStates) {
    if (!ruleIds.has(row.ruleId as string)) track("occurrenceStates", row.id);
  }
  for (const row of data.recurrenceRules) {
    const itemMissing = row.itemId !== undefined && !itemIds.has(row.itemId as string);
    const routineMissing =
      row.routineId !== undefined && !routineIds.has(row.routineId as string);
    const noRef = row.itemId === undefined && row.routineId === undefined;
    if (itemMissing || routineMissing || noRef) track("recurrenceRules", row.id);
  }
  for (const row of data.routineItems) {
    if (!routineIds.has(row.routineId as string)) track("routineItems", row.id);
  }
  for (const row of data.routineExecutions) {
    if (!routineIds.has(row.routineId as string))
      track("routineExecutions", row.id);
  }
  for (const row of data.weeklyReviews) {
    if (!weekIds.has(row.weeklyPlanId as string)) track("weeklyReviews", row.id);
  }
  for (const row of data.resumeMarkers) {
    if (!itemIds.has(row.itemId as string)) track("resumeMarkers", row.id);
  }

  const issues: IntegrityIssue[] = Object.entries(toDelete).map(([store, ids2]) => ({
    store,
    count: ids2.length,
    description: `${ids2.length} dangling row${ids2.length === 1 ? "" : "s"} in ${store}`,
  }));

  if (repair && issues.length) {
    await db.transaction(
      "rw",
      ALL_STORES.map((s) => db.table(s)),
      async () => {
        for (const [store, ids2] of Object.entries(toDelete)) {
          await db.table(store).bulkDelete(ids2);
        }
      }
    );
    emitChange([...Object.keys(toDelete)]);
  }

  return { issues, repaired: repair && issues.length > 0 };
}
