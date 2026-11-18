/* InboxService — fast capture without organizing (§3.4, D5).
   Moving out of Inbox is transactional; item identity never changes [RULE]. */

import { db } from "../db";
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
 *  v1.4: `periodSettingId` (from the add-to-day dialog) maps the entry onto
 *  the day's period snapshot — the silent drop of the user's period choice
 *  is closed at the service layer, where every caller gets it for free. */
export async function addInboxItemToToday(
  itemId: string,
  opts: {
    date: string;
    periodId?: string;
    periodSettingId?: string;
    startTime?: string;
    alsoRemoveFromInbox?: boolean;
  }
): Promise<Result<{ removedFromInbox: boolean }>> {
  const alsoRemove = opts.alsoRemoveFromInbox ?? true;
  const res = await addEntryToDay({
    date: opts.date,
    kind: "item",
    itemId,
    periodId: opts.periodId,
    startTime: opts.startTime,
  });
  if (!res.ok) {
    if (res.error.code === "duplicate") {
      // gentle confirm path is handled by the UI; here it means it's already there
      return res as Result<{ removedFromInbox: boolean }>;
    }
    return res as Result<{ removedFromInbox: boolean }>;
  }
  if (opts.periodSettingId) {
    const { setEntryPeriodBySetting } = await import("./planning-service");
    await setEntryPeriodBySetting(res.value.id, opts.periodSettingId);
  }
  if (alsoRemove) {
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

export async function getInboxCount(): Promise<number> {
  return db.inboxEntries.count();
}
