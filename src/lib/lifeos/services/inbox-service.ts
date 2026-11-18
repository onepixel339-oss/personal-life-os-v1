/* InboxService — fast capture without organizing (§3.4, D5).
   Moving out of Inbox is transactional; item identity never changes [RULE]. */

import { db, logActivity } from "../db";
import { emitChange } from "../events";
import { keyAfter } from "../fractional";
import { uid } from "../ids";
import type { InboxEntry, Item, Result } from "../types";
import { err, ok } from "../types";
import type { Undoable } from "./history-service";
import { createItem } from "./item-service";
import { addEntryToDay, addEntryToWeek } from "./planning-service";

/** Capture: title only is valid; type stays 'unsorted' until the user chooses. */
export async function capture(
  title: string,
  description?: string
): Promise<Result<Item & Undoable>> {
  const res = await createItem({ title, description });
  if (!res.ok) return res;
  const item = res.value;
  const entry: InboxEntry = {
    id: uid(),
    itemId: item.id,
    sortOrder: keyAfter((await db.inboxEntries.toArray()).map((e) => e.sortOrder)),
    createdAt: Date.now(),
  };
  try {
    await db.inboxEntries.add(entry);
    emitChange(["inboxEntries"]);
    return ok({
      ...item,
      undo: {
        label: `Removed “${item.title}”`,
        undo: async () => {
          await db.transaction("rw", [db.items, db.inboxEntries], async () => {
            await db.inboxEntries.delete(entry.id);
            await db.items.delete(item.id);
          });
          emitChange(["items", "inboxEntries"]);
        },
      },
    });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that. Nothing was changed." });
  }
}

/** Move Inbox → Space: remove InboxEntry + add link in one transaction (D5). */
export async function moveInboxItemToSpace(
  itemId: string,
  spaceId: string,
  alsoRemoveFromInbox = true
): Promise<Result<{ removedFromInbox: boolean }>> {
  const item = await db.items.get(itemId);
  if (!item) return err({ code: "not_found", message: "Item not found." });
  try {
    const removed = await db.transaction(
      "rw",
      [db.items, db.inboxEntries, db.itemSpaceLinks, db.spaces],
      async () => {
        let removedFromInbox = false;
        if (alsoRemoveFromInbox) {
          const entries = await db.inboxEntries.where("itemId").equals(itemId).toArray();
          if (entries.length) {
            await db.inboxEntries.bulkDelete(entries.map((e) => e.id));
            removedFromInbox = true;
          }
        }
        const existing = await db.itemSpaceLinks
          .where("[itemId+spaceId]")
          .equals([itemId, spaceId])
          .first();
        if (!existing) {
          const others = await db.itemSpaceLinks
            .where("spaceId")
            .equals(spaceId)
            .toArray();
          await db.itemSpaceLinks.add({
            id: uid(),
            itemId,
            spaceId,
            sortOrder: keyAfter(others.map((l) => l.sortOrder)),
            createdAt: Date.now(),
          });
        }
        return removedFromInbox;
      }
    );
    emitChange(["inboxEntries", "itemSpaceLinks"]);
    return ok({ removedFromInbox: removed });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't move that. Nothing was changed." });
  }
}

/** Inbox → Today: DailyEntry + optional inbox removal, one transaction (§3.4).
 *  v1.4: `periodSettingId` maps the entry onto the day's period snapshot.
 *  v1.5: it rides inside addEntryToDay itself — which also honors it on the
 *  duplicate branch (re-add moves the existing entry instead of erroring). */
export async function addInboxItemToToday(
  itemId: string,
  opts: {
    date: string;
    periodSettingId?: string;
    startTime?: string;
    alsoRemoveFromInbox?: boolean;
  }
): Promise<
  Result<{ removedFromInbox: boolean; alreadyPlaced?: boolean } & Undoable>
> {
  const alsoRemove = opts.alsoRemoveFromInbox ?? true;
  const res = await addEntryToDay({
    date: opts.date,
    kind: "item",
    itemId,
    periodSettingId: opts.periodSettingId,
    startTime: opts.startTime,
  });
  if (!res.ok) return res as never;
  const alreadyPlaced = res.value.alreadyPlaced;
  const entryUndo = res.value.undo;
  if (alsoRemove) {
    try {
      await db.transaction("rw", db.inboxEntries, async () => {
        await db.inboxEntries.where("itemId").equals(itemId).delete();
      });
      emitChange(["inboxEntries"]);
      return ok({
        removedFromInbox: true,
        alreadyPlaced,
        ...(entryUndo ? { undo: entryUndo } : {}),
      });
    } catch {
      return ok({ removedFromInbox: false, alreadyPlaced });
    }
  }
  return ok({ removedFromInbox: false, alreadyPlaced });
}

/** Inbox → Weekly: WeeklyEntry + optional inbox removal. */
export async function addInboxItemToWeek(
  itemId: string,
  weekStartDate: string,
  alsoRemoveFromInbox = true
): Promise<Result<{ removedFromInbox: boolean }>> {
  const res = await addEntryToWeek({ weekStartDate, itemId });
  if (!res.ok) return res as Result<{ removedFromInbox: boolean }>;
  if (alsoRemoveFromInbox) {
    try {
      await db.transaction("rw", db.inboxEntries, async () => {
        await db.inboxEntries.where("itemId").equals(itemId).delete();
      });
      emitChange(["inboxEntries"]);
      return ok({ removedFromInbox: true });
    } catch {
      return ok({ removedFromInbox: false });
    }
  }
  return ok({ removedFromInbox: false });
}

/** v1.5: archive straight from the Inbox — the item is archived AND its
 *  inbox entry leaves with it, in one transaction (the entry used to linger
 *  as a ghost row until permanent delete). Undo brings both back. */
export async function archiveInboxItem(
  itemId: string
): Promise<Result<Item & Undoable>> {
  const item = await db.items.get(itemId);
  if (!item) return err({ code: "not_found", message: "Item not found." });
  const previous = item.status;
  const entries = await db.inboxEntries.where("itemId").equals(itemId).toArray();
  const now = Date.now();
  try {
    await db.transaction("rw", [db.items, db.inboxEntries], async () => {
      if (previous !== "archived") {
        await db.items.update(itemId, {
          status: "archived",
          archivedAt: now,
          statusBeforeArchive: previous,
          updatedAt: now,
        });
      }
      if (entries.length) {
        await db.inboxEntries.bulkDelete(entries.map((e) => e.id));
      }
    });
    logActivity("item", itemId, "archive");
    emitChange(["items", "inboxEntries"]);
    return ok({
      ...item,
      status: "archived",
      undo: {
        label: `Restore “${item.title}”`,
        undo: async () => {
          await db.transaction("rw", [db.items, db.inboxEntries], async () => {
            await db.items.update(itemId, {
              status: previous,
              archivedAt: undefined,
              statusBeforeArchive: undefined,
              updatedAt: Date.now(),
            });
            if (entries.length) await db.inboxEntries.bulkAdd(entries);
          });
          emitChange(["items", "inboxEntries"]);
        },
      },
    });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that. Nothing was changed." });
  }
}

/** Return to Inbox (used by end-of-week and item actions). */
export async function returnItemToInbox(
  itemId: string
): Promise<Result<void>> {
  try {
    await db.transaction("rw", db.inboxEntries, async () => {
      const existing = await db.inboxEntries.where("itemId").equals(itemId).first();
      if (existing) return;
      const all = await db.inboxEntries.toArray();
      await db.inboxEntries.add({
        id: uid(),
        itemId,
        sortOrder: keyAfter(all.map((e) => e.sortOrder)),
        createdAt: Date.now(),
      });
    });
    emitChange(["inboxEntries"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't return that to Inbox." });
  }
}
