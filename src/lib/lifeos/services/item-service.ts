/* ItemService — central item model, status/type lifecycle, relationships,
   space links, resume markers, permanent delete cascade (§3.5, §5, §6.4). */

import { db, logActivity } from "../db";
import { emitChange } from "../events";
import type { Undoable } from "./history-service";
import { keyAfter } from "../fractional";
import { uid } from "../ids";
import type {
  Item,
  ItemRelationship,
  ItemSpaceLink,
  ItemStatus,
  ItemType,
  RelationType,
  Result,
  Space,
} from "../types";
import { err, ok } from "../types";
import { VALID_STATUS_BY_TYPE } from "../types";

export interface CreateItemInput {
  type?: ItemType;
  title: string;
  description?: string;
}

export async function createItem(
  input: CreateItemInput
): Promise<Result<Item>> {
  const title = input.title.trim();
  if (!title) return err({ code: "validation", message: "A title is needed." });
  if (title.length > 500)
    return err({ code: "validation", message: "Title is too long (500 max)." });
  const description = (input.description ?? "").slice(0, 20000);
  const now = Date.now();
  const item: Item = {
    id: uid(),
    type: input.type ?? "unsorted",
    title,
    description,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.items.add(item);
    logActivity("item", item.id, "create");
    emitChange(["items"]);
    return ok(item);
  } catch (e) {
    return dbError(e);
  }
}

export async function updateItem(
  id: string,
  patch: { title?: string; description?: string }
): Promise<Result<Item>> {
  const item = await db.items.get(id);
  if (!item) return err({ code: "not_found", message: "Item not found." });
  const next: Partial<Item> = { updatedAt: Date.now() };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title || title.length > 500)
      return err({ code: "validation", message: "A title is needed." });
    next.title = title;
  }
  if (patch.description !== undefined) {
    if (patch.description.length > 20000)
      return err({ code: "validation", message: "Description is too long." });
    next.description = patch.description;
  }
  try {
    await db.items.update(id, next);
    emitChange(["items"]);
    return ok({ ...item, ...next } as Item);
  } catch (e) {
    return dbError(e);
  }
}

/** Status change — free transitions within the type's allowed set (§5.2). */
export async function setItemStatus(
  id: string,
  status: ItemStatus
): Promise<Result<Item & Undoable>> {
  const item = await db.items.get(id);
  if (!item) return err({ code: "not_found", message: "Item not found." });
  const previous = item.status;
  if (previous === status) return ok({ ...item });
  const allowed = VALID_STATUS_BY_TYPE[item.type];
  if (item.type === "entertainment") {
    return err({
      code: "validation",
      message:
        "Entertainment status follows its watching/playing progress. Edit it from its entertainment details.",
    });
  }
  if (!allowed.includes(status)) {
    return err({
      code: "validation",
      message: `A ${item.type} can't be set to ${status}.`,
    });
  }
  const now = Date.now();
  const patch: Partial<Item> = { status, updatedAt: now };
  if (status === "completed") patch.completedAt = now;
  if (previous === "completed" && status !== "completed")
    patch.completedAt = undefined;
  if (status === "archived") {
    patch.archivedAt = now;
    patch.statusBeforeArchive = previous;
  }
  if (previous === "archived" && status !== "archived")
    patch.archivedAt = undefined;
  try {
    await db.items.update(id, patch);
    logActivity("item", id, `status:${previous}->${status}`);
    emitChange(["items"]);
    return ok({
      ...item,
      ...patch,
      undo: {
        label: `Status back to ${previous}`,
        undo: async () => {
          await setItemStatus(id, previous);
        },
      },
    });
  } catch (e) {
    return dbError(e);
  }
}

/** Archive: status archived + archivedAt; previous status remembered (D18/§3.5). */
export async function archiveItem(
  id: string
): Promise<Result<Item & Undoable>> {
  const item = await db.items.get(id);
  if (!item) return err({ code: "not_found", message: "Item not found." });
  if (item.status === "archived") return ok({ ...item });
  const previous = item.status;
  const now = Date.now();
  try {
    await db.items.update(id, {
      status: "archived",
      archivedAt: now,
      statusBeforeArchive: previous,
      updatedAt: now,
    });
    logActivity("item", id, "archive");
    emitChange(["items"]);
    return ok({
      ...item,
      status: "archived",
      undo: {
        label: `Restore “${item.title}”`,
        undo: async () => {
          await restoreItem(id);
        },
      },
    });
  } catch (e) {
    return dbError(e);
  }
}

export async function restoreItem(
  id: string
): Promise<Result<Item & Undoable>> {
  const item = await db.items.get(id);
  if (!item) return err({ code: "not_found", message: "Item not found." });
  if (item.status !== "archived") return ok({ ...item });
  const backTo: ItemStatus =
    item.statusBeforeArchive && item.statusBeforeArchive !== "archived"
      ? item.statusBeforeArchive
      : "active";
  const now = Date.now();
  try {
    await db.items.update(id, {
      status: backTo,
      archivedAt: undefined,
      statusBeforeArchive: undefined,
      updatedAt: now,
    });
    emitChange(["items"]);
    return ok({
      ...item,
      status: backTo,
      undo: {
        label: `Archive “${item.title}” again`,
        undo: async () => {
          await archiveItem(id);
        },
      },
    });
  } catch (e) {
    return dbError(e);
  }
}

/** Type change preserves identity and keeps type-specific details (D20). */
export async function changeItemType(
  id: string,
  type: ItemType
): Promise<Result<Item & Undoable>> {
  const item = await db.items.get(id);
  if (!item) return err({ code: "not_found", message: "Item not found." });
  if (item.type === type) return ok({ ...item });
  const previousType = item.type;
  let nextStatus = item.status;
  if (!VALID_STATUS_BY_TYPE[type].includes(nextStatus)) nextStatus = "active";
  try {
    await db.transaction("rw", db.items, async () => {
      await db.items.update(id, {
        type,
        status: nextStatus,
        updatedAt: Date.now(),
      });
    });
    logActivity("item", id, `type:${previousType}->${type}`);
    emitChange(["items"]);
    return ok({
      ...item,
      type,
      status: nextStatus,
      undo: {
        label: `Back to ${previousType}`,
        undo: async () => {
          await changeItemType(id, previousType);
        },
      },
    });
  } catch (e) {
    return dbError(e);
  }
}

export interface DeleteImpact {
  item: Item;
  spaces: string[];
  onToday: string[];
  onWeekly: string[];
  inInbox: boolean;
  relatedItems: number;
  dailyEntryCount: number;
}

/** Everything a permanent-delete confirmation must list (D19). */
export async function getDeleteImpact(id: string): Promise<DeleteImpact | null> {
  const item = await db.items.get(id);
  if (!item) return null;
  const links = await db.itemSpaceLinks.where("itemId").equals(id).toArray();
  const spaces = await Promise.all(
    links.map((l) => db.spaces.get(l.spaceId))
  );
  const dailyEntries = await db.dailyEntries.where("itemId").equals(id).toArray();
  const dailyPlans = await db.dailyPlans.bulkGet(
    Array.from(new Set(dailyEntries.map((e) => e.dailyPlanId)))
  );
  const planDates = new Map(dailyPlans.filter(Boolean).map((p) => [p!.id, p!.date]));
  const weeklyEntries = await db.weeklyEntries.where("itemId").equals(id).toArray();
  const weeklyPlans = await db.weeklyPlans.bulkGet(
    Array.from(new Set(weeklyEntries.map((e) => e.weeklyPlanId)))
  );
  const weeks = new Map(
    weeklyPlans.filter(Boolean).map((p) => [p!.id, p!.startDate])
  );
  const inbox = await db.inboxEntries.where("itemId").equals(id).first();
  const rels = await db.itemRelationships
    .filter((r) => r.sourceItemId === id || r.targetItemId === id)
    .toArray();
  return {
    item,
    spaces: spaces.filter(Boolean).map((s) => s!.name),
    onToday: dailyEntries
      .map((e) => planDates.get(e.dailyPlanId))
      .filter((d): d is string => !!d),
    onWeekly: weeklyEntries
      .map((e) => weeks.get(e.weeklyPlanId))
      .filter((w): w is string => !!w),
    inInbox: !!inbox,
    relatedItems: rels.length,
    dailyEntryCount: dailyEntries.length,
  };
}

/** Permanent delete — cascades to every dependent in one transaction (§6.4). */
export async function deleteItemPermanently(
  id: string
): Promise<Result<{ title: string }>> {
  const item = await db.items.get(id);
  if (!item) return err({ code: "not_found", message: "Item not found." });
  try {
    await db.transaction(
      "rw",
      [
        db.items,
        db.itemSpaceLinks,
        db.itemRelationships,
        db.inboxEntries,
        db.weeklyEntries,
        db.dailyEntries,
        db.projectDetails,
        db.noteDetails,
        db.returnNoteSettings,
        db.entertainmentDetails,
        db.recurrenceRules,
        db.occurrenceStates,
        db.resumeMarkers,
        db.resumeSuggestionStates,
        db.routineItems,
        db.activityHistory,
      ],
      async () => {
        await db.items.delete(id);
        await db.itemSpaceLinks.where("itemId").equals(id).delete();
        await db.itemRelationships
          .filter((r) => r.sourceItemId === id || r.targetItemId === id)
          .delete();
        await db.inboxEntries.where("itemId").equals(id).delete();
        await db.weeklyEntries.where("itemId").equals(id).delete();
        await db.dailyEntries.where("itemId").equals(id).delete();
        await db.projectDetails.delete(id);
        await db.noteDetails.delete(id);
        await db.returnNoteSettings.delete(id);
        await db.entertainmentDetails.delete(id);
        const rules = await db.recurrenceRules.where("itemId").equals(id).toArray();
        for (const rule of rules) {
          await db.occurrenceStates.where("ruleId").equals(rule.id).delete();
        }
        await db.recurrenceRules.where("itemId").equals(id).delete();
        await db.resumeMarkers.where("itemId").equals(id).delete();
        await db.resumeSuggestionStates
          .filter((s) => s.sourceId === id)
          .delete();
        // routine references are kept, item link cleared
        await db.routineItems
          .filter((ri) => ri.itemId === id)
          .modify({ itemId: undefined });
        await logActivity("item", id, "permanentDelete", {
          titleSnapshot: item.title,
        });
      }
    );
    emitChange([
      "items",
      "itemSpaceLinks",
      "itemRelationships",
      "inboxEntries",
      "weeklyEntries",
      "dailyEntries",
      "recurrenceRules",
    ]);
    return ok({ title: item.title });
  } catch (e) {
    return dbError(e);
  }
}

/* ---------- space links (P3: a link, never a copy) ---------- */

export async function addItemToSpace(
  itemId: string,
  spaceId: string
): Promise<Result<ItemSpaceLink & Undoable>> {
  const item = await db.items.get(itemId);
  const space = await db.spaces.get(spaceId);
  if (!item || !space)
    return err({ code: "not_found", message: "Item or space not found." });
  const existing = await db.itemSpaceLinks
    .where("[itemId+spaceId]")
    .equals([itemId, spaceId])
    .first();
  if (existing) return ok(existing);
  const others = await db.itemSpaceLinks
    .where("spaceId")
    .equals(spaceId)
    .toArray();
  const link: ItemSpaceLink = {
    id: uid(),
    itemId,
    spaceId,
    sortOrder: keyAfter(others.map((l) => l.sortOrder)),
    createdAt: Date.now(),
  };
  try {
    await db.itemSpaceLinks.add(link);
    emitChange(["itemSpaceLinks"]);
    return ok({
      ...link,
      undo: {
        label: `Removed from ${space.name}`,
        undo: async () => {
          await removeSpaceLink(link.id);
        },
      },
    });
  } catch (e) {
    return dbError(e);
  }
}

export async function removeSpaceLink(
  linkId: string
): Promise<Result<ItemSpaceLink & Undoable>> {
  const link = await db.itemSpaceLinks.get(linkId);
  if (!link) return err({ code: "not_found", message: "Link not found." });
  try {
    await db.itemSpaceLinks.delete(linkId);
    emitChange(["itemSpaceLinks"]);
    return ok({
      ...link,
      undo: {
        label: "Back in its space",
        undo: async () => {
          await addItemToSpace(link.itemId, link.spaceId);
        },
      },
    });
  } catch (e) {
    return dbError(e);
  }
}

/* ---------- relationships (D6) ---------- */

async function wouldCreateCycle(
  source: string,
  target: string,
  type: RelationType
): Promise<boolean> {
  if (source === target) return true;
  if (type === "related") return false;
  // walk up the graph following edges in the "depends/blocks" direction
  // parent: source is child, target is parent -> cycle if target (as child) reaches source
  // depends_on: source depends on target -> cycle if target transitively depends on source
  const seen = new Set<string>();
  const frontier = [target];
  // relationType has no standalone index (only the compound key) — filter
  // over the table instead of .where() which would throw SchemaError.
  const edges = await db.itemRelationships
    .filter((r) => r.relationType === type)
    .toArray();
  while (frontier.length) {
    const current = frontier.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const e of edges) {
      if (e.sourceItemId === current) frontier.push(e.targetItemId);
    }
  }
  return false;
}

export async function addRelationship(
  source: string,
  target: string,
  relationType: RelationType
): Promise<Result<ItemRelationship>> {
  if (source === target)
    return err({ code: "validation", message: "An item can't relate to itself." });
  try {
    const a = await db.items.get(source);
    const b = await db.items.get(target);
    if (!a || !b) return err({ code: "not_found", message: "Item not found." });
    let s = source;
    let t = target;
    if (relationType === "related") {
      // symmetric — store once with sorted ids
      [s, t] = [source, target].sort();
    }
    const existing = await db.itemRelationships
      .where("[sourceItemId+targetItemId+relationType]")
      .equals([s, t, relationType])
      .first();
    if (existing) return ok(existing);
    if (relationType === "parent" || relationType === "depends_on") {
      if (await wouldCreateCycle(s, t, relationType))
        return err({
          code: "cycle",
          message: "That would create a circular relationship.",
        });
    }
    const rel: ItemRelationship = {
      id: uid(),
      sourceItemId: s,
      targetItemId: t,
      relationType,
      createdAt: Date.now(),
    };
    await db.itemRelationships.add(rel);
    emitChange(["itemRelationships"]);
    return ok(rel);
  } catch (e) {
    console.error("addRelationship failed", e);
    return dbError(e);
  }
}

export async function removeRelationship(id: string): Promise<Result<void>> {
  try {
    await db.itemRelationships.delete(id);
    emitChange(["itemRelationships"]);
    return ok(undefined);
  } catch (e) {
    return dbError(e);
  }
}

/* ---------- resume markers (D11, D12) ---------- */

export async function keepForLater(
  itemId: string
): Promise<Result<void>> {
  try {
    const existing = await db.resumeMarkers
      .where("itemId")
      .equals(itemId)
      .filter((m) => m.reason === "kept")
      .first();
    if (existing) return ok(undefined);
    await db.resumeMarkers.add({
      id: uid(),
      itemId,
      reason: "kept",
      createdAt: Date.now(),
    });
    emitChange(["resumeMarkers"]);
    return ok(undefined);
  } catch (e) {
    return dbError(e);
  }
}

/** Postpone = optional future date; never changes status or plans (D12). */
export async function postponeItem(
  itemId: string,
  resumeOn?: string
): Promise<Result<void>> {
  try {
    await db.resumeMarkers
      .where("itemId")
      .equals(itemId)
      .filter((m) => m.reason === "postponed")
      .delete();
    await db.resumeMarkers.add({
      id: uid(),
      itemId,
      reason: "postponed",
      resumeOn,
      createdAt: Date.now(),
    });
    emitChange(["resumeMarkers"]);
    return ok(undefined);
  } catch (e) {
    return dbError(e);
  }
}

export async function clearResumeMarkers(itemId: string): Promise<void> {
  await db.resumeMarkers.where("itemId").equals(itemId).delete();
  emitChange(["resumeMarkers"]);
}

/* ---------- appearance summary (P3) ---------- */

export interface Appearances {
  spaces: Space[];
  onToday: { date: string; entryId: string }[];
  onWeekly: { weekStart: string; entryId: string }[];
  inInbox: boolean;
}

export async function getAppearances(itemId: string): Promise<Appearances> {
  const links = await db.itemSpaceLinks.where("itemId").equals(itemId).toArray();
  const spaces = (
    await db.spaces.bulkGet(links.map((l) => l.spaceId))
  ).filter((s): s is Space => !!s);
  const dailyEntries = await db.dailyEntries
    .where("itemId")
    .equals(itemId)
    .toArray();
  const dailyPlans = await db.dailyPlans.bulkGet(
    Array.from(new Set(dailyEntries.map((e) => e.dailyPlanId)))
  );
  const dateByPlan = new Map(
    dailyPlans.filter(Boolean).map((p) => [p!.id, p!.date])
  );
  const weeklyEntries = await db.weeklyEntries
    .where("itemId")
    .equals(itemId)
    .toArray();
  const weeklyPlans = await db.weeklyPlans.bulkGet(
    Array.from(new Set(weeklyEntries.map((e) => e.weeklyPlanId)))
  );
  const startByPlan = new Map(
    weeklyPlans.filter(Boolean).map((p) => [p!.id, p!.startDate])
  );
  const inbox = await db.inboxEntries.where("itemId").equals(itemId).first();
  return {
    spaces,
    onToday: dailyEntries
      .map((e) => ({
        date: dateByPlan.get(e.dailyPlanId) ?? "",
        entryId: e.id,
      }))
      .filter((x) => x.date),
    onWeekly: weeklyEntries
      .map((e) => ({
        weekStart: startByPlan.get(e.weeklyPlanId) ?? "",
        entryId: e.id,
      }))
      .filter((x) => x.weekStart),
    inInbox: !!inbox,
  };
}

/* ---------- misc helpers ---------- */

export async function getItemsByIds(ids: string[]): Promise<Map<string, Item>> {
  const items = await db.items.bulkGet(ids);
  return new Map(
    items
      .filter((i): i is Item => !!i)
      .map((i) => [i.id, i])
  );
}

function dbError(e: unknown): Result<never> {
  console.error(e);
  return err({
    code: "db_error",
    message: "Couldn't save that. Nothing was changed.",
  });
}
