/* Regression tests — the four production bugs found in the review, at the
   service layer (Dexie over fake-indexeddb).

   BUG 1  removeEntryFromDay: the transaction must include routineExecutions,
          otherwise the write throws and "remove from today" always fails.
   BUG 2  wouldCreateCycle: queried relationType without an index
          (SchemaError -> silent failure of subtasks/dependencies).
   BUG 3  applyRestore: the pre-restore snapshot must be written AFTER the
          replacing transaction (which clears appSettings too), otherwise
          "undo restore" can never work.
   BUG 4  pauseRule & friends must bump rule.version (generateDates memo). */

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "../src/lib/lifeos/db";
import { addDays, todayLocal } from "../src/lib/lifeos/dates";
import {
  addEntryToDay,
  removeEntryFromDay,
} from "../src/lib/lifeos/services/planning-service";
import { addRelationship, createItem } from "../src/lib/lifeos/services/item-service";
import {
  applyRestore,
  undoRestore,
} from "../src/lib/lifeos/services/backup-service";
import {
  createRule,
  generateDates,
  pauseRule,
} from "../src/lib/lifeos/services/recurrence-service";
import { SETTING_KEYS } from "../src/lib/lifeos/defaults";
import { getRulesForItem } from "../src/lib/lifeos/services/recurrence-service";

async function freshDb(): Promise<void> {
  await db.delete();
  await db.open();
}

function itemId(res: { ok: boolean; value?: { id: string } }): string {
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("seed failed");
  return res.value!.id;
}

beforeAll(async () => {
  await freshDb();
});

beforeEach(async () => {
  // wipe all data but keep it a single Dexie instance per file
  for (const store of db.tables) await store.clear();
});

/* ---------------- BUG 1 ---------------- */

describe("BUG 1 — removeEntryFromDay transaction covers routineExecutions", () => {
  test("removing an entry detaches its routine executions (history kept)", async () => {
    const item = itemId(
      await createItem({ title: "Study", type: "task" })
    );
    const added = await addEntryToDay({
      date: "2026-11-14",
      kind: "item",
      itemId: item,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const entryId = added.value.id;

    // a routine execution linked to that entry (started from Today)
    await db.routineExecutions.add({
      id: "exec-1",
      routineId: "routine-1",
      dailyEntryId: entryId,
      date: "2026-11-14",
      startedAt: Date.now(),
      state: "ended",
      titleSnapshot: "Evening routine",
    });

    // before the fix this threw (IncompatiblePromise) and returned err
    const res = await removeEntryFromDay(entryId);
    expect(res.ok).toBe(true);

    // the entry is gone
    expect(await db.dailyEntries.get(entryId)).toBeUndefined();
    // the execution history survives, detached
    const exec = await db.routineExecutions.get("exec-1");
    expect(exec).toBeDefined();
    expect(exec?.dailyEntryId).toBeUndefined();
  });

  test("removing a plain item entry works and returns an undo", async () => {
    const item = itemId(
      await createItem({ title: "Read", type: "activity" })
    );
    const added = await addEntryToDay({
      date: "2026-11-14",
      kind: "item",
      itemId: item,
    });
    if (!added.ok) return;
    const res = await removeEntryFromDay(added.value.id);
    expect(res.ok).toBe(true);
    if (res.ok) expect(typeof res.value.undo?.undo).toBe("function");
  });
});

/* ---------------- BUG 2 ---------------- */

describe("BUG 2 — relationships: no SchemaError, cycles rejected", () => {
  let a: string;
  let b: string;
  let c: string;

  beforeEach(async () => {
    a = itemId(await createItem({ title: "A", type: "task" }));
    b = itemId(await createItem({ title: "B", type: "task" }));
    c = itemId(await createItem({ title: "C", type: "task" }));
  });

  test("subtask (parent) relationships work — no SchemaError", async () => {
    // before the fix this threw SchemaError silently inside wouldCreateCycle
    const res = await addRelationship(a, b, "parent");
    expect(res.ok).toBe(true);
  });

  test("direct parent cycle is rejected", async () => {
    await addRelationship(a, b, "parent"); // A child of B
    const back = await addRelationship(b, a, "parent"); // B child of A?
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.error.code).toBe("cycle");
  });

  test("transitive parent cycle is rejected (A->B->C, then C->A)", async () => {
    await addRelationship(a, b, "parent");
    await addRelationship(b, c, "parent");
    const cycle = await addRelationship(c, a, "parent");
    expect(cycle.ok).toBe(false);
    if (!cycle.ok) expect(cycle.error.code).toBe("cycle");
  });

  test("depends_on cycles are rejected too", async () => {
    await addRelationship(a, b, "depends_on");
    await addRelationship(b, c, "depends_on");
    const cycle = await addRelationship(c, a, "depends_on");
    expect(cycle.ok).toBe(false);
  });

  test("self-relationship is rejected before any write", async () => {
    const res = await addRelationship(a, a, "parent");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("validation");
  });

  test('"related" is symmetric and stored once (sorted ids)', async () => {
    const first = await addRelationship(a, b, "related");
    const second = await addRelationship(b, a, "related");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.id).toBe(first.value.id); // deduped
    }
    const rows = await db.itemRelationships.toArray();
    expect(rows.filter((r) => r.relationType === "related")).toHaveLength(1);
  });

  test("deep chain (5 levels) cycle is detected", async () => {
    const d = itemId(await createItem({ title: "D", type: "task" }));
    const e = itemId(await createItem({ title: "E", type: "task" }));
    await addRelationship(a, b, "parent");
    await addRelationship(b, c, "parent");
    await addRelationship(c, d, "parent");
    await addRelationship(d, e, "parent");
    const cycle = await addRelationship(e, a, "parent");
    expect(cycle.ok).toBe(false);
  });
});

/* ---------------- BUG 3 ---------------- */

describe("BUG 3 — restore snapshot survives the restore itself", () => {
  test("applyRestore takes a snapshot, undoRestore brings the old data back", async () => {
    const item = itemId(
      await createItem({ title: "Before restore", type: "task" })
    );
    const before = await db.items.toArray();
    expect(before.length).toBeGreaterThanOrEqual(1);

    // restore a payload that does NOT contain that item
    const restoreRes = await applyRestore(
      {
        items: [
          {
            id: "restored-1",
            type: "note",
            title: "After restore",
            description: "",
            status: "active",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      },
      undefined
    );
    expect(restoreRes.ok).toBe(true);
    if (restoreRes.ok) expect(restoreRes.value.snapshotTaken).toBe(true);

    // current data is the restored one
    const nowItems = await db.items.toArray();
    expect(nowItems.map((i) => i.id)).toEqual(["restored-1"]);

    // the snapshot was written AFTER the replace — it must still exist
    const snapRow = await db.appSettings.get(SETTING_KEYS.restoreSnapshot);
    expect(snapRow?.value).toBeTruthy();

    // undo brings the pre-restore world back
    const undoRes = await undoRestore();
    expect(undoRes.ok).toBe(true);
    const after = await db.items.toArray();
    expect(after.map((i) => i.id)).toContain(item);
    expect(after.length).toBe(before.length);

    // the snapshot is consumed
    const consumed = await db.appSettings.get(SETTING_KEYS.restoreSnapshot);
    expect(consumed?.value ?? null).toBeNull();
  });

  test("undoRestore without a snapshot errors (not throws)", async () => {
    const res = await undoRestore();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_found");
  });
});

/* ---------------- BUG 4 (service level) ---------------- */

describe("BUG 4 — pauseRule bumps version so the memo refreshes", () => {
  test("pause excludes today onward and bumps version", async () => {
    const created = await createRule({
      itemId: "item-pause",
      pattern: "daily",
      interval: 1,
      startDate: addDays(todayLocal(), -5),
      weekAnchor: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;

    const from = addDays(todayLocal(), -3);
    const to = addDays(todayLocal(), 3);
    const before = generateDates(created.value, from, to);
    expect(before.length).toBeGreaterThanOrEqual(6);

    const res = await pauseRule(id);
    expect(res.ok).toBe(true);

    const rules = await getRulesForItem("item-pause");
    expect(rules).toHaveLength(1);
    const paused = rules[0];
    expect(paused.state).toBe("paused");
    expect(paused.version).toBe(created.value.version + 1);
    expect(paused.pauseSegments?.length).toBeGreaterThanOrEqual(1);

    // generateDates must NOT serve the stale memo — dates from today on vanish
    const after = generateDates(paused, from, to);
    expect(after.length).toBeLessThan(before.length);
    for (const d of after) {
      expect(d < todayLocal()).toBe(true);
    }
  });
});

/* ---------------- duplicate prevention (D17) ---------------- */

describe("addEntryToDay duplicate prevention", () => {
  test("same item on the same day is a duplicate", async () => {
    const item = itemId(
      await createItem({ title: "Once only", type: "task" })
    );
    const first = await addEntryToDay({
      date: "2026-11-14",
      kind: "item",
      itemId: item,
    });
    expect(first.ok).toBe(true);
    const second = await addEntryToDay({
      date: "2026-11-14",
      kind: "item",
      itemId: item,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("duplicate");
  });

  test("same item on another day is fine", async () => {
    const item = itemId(
      await createItem({ title: "Twice ok", type: "task" })
    );
    const first = await addEntryToDay({
      date: "2026-11-14",
      kind: "item",
      itemId: item,
    });
    const second = await addEntryToDay({
      date: "2026-11-15",
      kind: "item",
      itemId: item,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });
});

/* ---------------- activity history logging ---------------- */

describe("addEntryToDay writes activity history inside its transaction", () => {
  test("the add is recorded in activityHistory (no ambient-transaction NotFoundError)", async () => {
    const item = itemId(
      await createItem({ title: "Logged add", type: "task" })
    );
    const added = await addEntryToDay({
      date: "2026-11-14",
      kind: "item",
      itemId: item,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    // logActivity runs INSIDE the addEntryToDay transaction — the table
    // must be listed there, otherwise the ambient transaction throws
    // NotFoundError and the activity row never lands (found in E2E).
    const rows = await db.activityHistory
      .where("[entityType+entityId]")
      .equals(["dailyEntry", added.value.id])
      .toArray();
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe("add");
  });
});
