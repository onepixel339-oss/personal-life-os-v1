/* Round-trip property test (v1.2) — seeded random data, through a real
   auto-backup → full wipe → restore cycle, must come back identical.
   This kills the entire class of "restore silently loses a store" bugs. */

import { describe, expect, test } from "bun:test";
import { db, setSetting } from "../src/lib/lifeos/db";
import { SETTING_KEYS } from "../src/lib/lifeos/defaults";
import {
  applyRestore,
  createAutoBackup,
  restoreAutoBackup,
} from "../src/lib/lifeos/services/backup-service";
import { ALL_STORES } from "../src/lib/lifeos/db";

/* deterministic PRNG (mulberry32) — same seed, same data, every run */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Gen {
  rnd: () => number;
  int: (lo: number, hi: number) => number;
  pick: <T>(list: T[]) => T;
  id: (prefix: string, i: number) => string;
  title: () => string;
}

const TITLES = [
  "مشروع التقرير الشهري",
  "Sprint planning notes",
  "قراية كتاب الذكاء الاصطناعي",
  "تمرين ٣٠ دقيقة",
  "call the accountant",
  "مذاكرة امتحان الفيزياء",
  "renew domain + mixed عنوان عربي",
];

function makeGen(seed: number): Gen {
  const rnd = mulberry32(seed);
  return {
    rnd,
    int: (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(rnd() * list.length)],
    id: (prefix, i) => `${prefix}-${i}`,
    title: () => TITLES[Math.floor(rnd() * TITLES.length)],
  };
}

async function generateAndSeed(seed: number): Promise<void> {
  const g = makeGen(seed);
  const itemIds: string[] = [];
  const spaceIds: string[] = [];
  const planIds: string[] = [];
  const weekIds: string[] = [];
  const ruleIds: string[] = [];
  const routineIds: string[] = [];

  for (const table of db.tables) await table.clear();

  /* items */
  const items = g.int(5, 25);
  for (let i = 0; i < items; i++) {
    const id = g.id("it", i);
    itemIds.push(id);
    await db.items.add({
      id,
      type: g.pick(["task", "note", "project", "entertainment"]),
      title: g.title(),
      description: g.rnd() < 0.4 ? "وصف مختلط mixed EN" : "",
      status: g.pick(["active", "completed", "active"]),
      createdAt: g.int(1, 1_000_000),
      updatedAt: g.int(1, 1_000_000),
      ...(g.rnd() < 0.3 ? { completedAt: g.int(1, 1_000_000) } : {}),
      ...(g.rnd() < 0.1 ? { archivedAt: g.int(1, 1_000_000) } : {}),
    } as never);
  }

  /* spaces */
  const spaces = g.int(1, 5);
  for (let i = 0; i < spaces; i++) {
    const id = g.id("sp", i);
    spaceIds.push(id);
    await db.spaces.add({
      id,
      name: g.pick(["شغل", "عيلة", "صحة", "قراية", "روحانيات"]),
      description: "مساحة",
      sortOrder: `s${i}`,
      createdAt: 1,
      updatedAt: 1,
    } as never);
  }

  /* links + relationships (unique composite keys — deduplicated) */
  const seenPair = new Set<string>();
  for (let i = 0; i < g.int(0, 12); i++) {
    const itemId = g.pick(itemIds);
    const spaceId = g.pick(spaceIds);
    if (seenPair.has(`L${itemId}|${spaceId}`)) continue;
    seenPair.add(`L${itemId}|${spaceId}`);
    await db.itemSpaceLinks.add({
      id: g.id("lnk", i),
      itemId,
      spaceId,
      sortOrder: `o${i}`,
      createdAt: 1,
    } as never);
  }
  const seenRel = new Set<string>();
  for (let i = 0; i < g.int(0, 6); i++) {
    const sourceItemId = g.pick(itemIds);
    const targetItemId = g.pick(itemIds);
    const relationType = g.pick(["supports", "blocks"]);
    const key = `R${sourceItemId}|${targetItemId}|${relationType}`;
    if (seenRel.has(key)) continue;
    seenRel.add(key);
    await db.itemRelationships.add({
      id: g.id("rel", i),
      sourceItemId,
      targetItemId,
      relationType,
      createdAt: 1,
    } as never);
  }

  /* details (note/project keyed by itemId — a deduplicated pool) */
  const pool = [...itemIds].sort(() => g.rnd() - 0.5);
  const take = (): string | undefined => pool.shift();
  for (let i = 0; i < g.int(0, 6); i++) {
    const itemId = take();
    if (!itemId) break;
    await db.projectDetails.add({ itemId, targetDate: `2026-0${g.int(1, 9)}-15` } as never);
  }
  for (let i = 0; i < g.int(0, 6); i++) {
    const itemId = take();
    if (!itemId) break;
    await db.noteDetails.add({
      itemId,
      content: `محتوى ملاحظة ${i} with some English`,
      noteType: g.pick(["free", "return"]),
      updatedAt: 1,
    } as never);
    await db.returnNoteSettings.add({
      noteItemId: itemId,
      enabled: g.rnd() < 0.5,
      trigger: "on_date",
      repeat: "once",
    } as never);
  }
  for (let i = 0; i < g.int(0, 4); i++) {
    await db.entertainmentDetails.add({
      itemId: g.pick(itemIds),
      mediaType: g.pick(["series", "book", "game"]),
      progressStatus: g.pick(["watching", "done"]),
    } as never);
  }

  /* inbox (itemId is unique — keep draining the pool) */
  for (let i = 0; i < g.int(0, 8); i++) {
    const itemId = take();
    if (!itemId) break;
    await db.inboxEntries.add({
      id: g.id("inb", i),
      itemId,
      sortOrder: `b${i}`,
      createdAt: g.int(1, 1_000_000),
    } as never);
  }

  /* weeks */
  for (let w = 0; w < g.int(1, 3); w++) {
    const weekId = g.id("wk", w);
    weekIds.push(weekId);
    const start = `2026-03-0${w + 1}`;
    await db.weeklyPlans.add({ id: weekId, startDate: start, createdAt: 1 } as never);
    for (let i = 0; i < g.int(0, 6); i++) {
      const itemId = g.pick(itemIds);
      const key = `W${weekId}|${itemId}|undefined`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      await db.weeklyEntries.add({
        id: g.id("we", w * 100 + i),
        weeklyPlanId: weekId,
        itemId,
        sortOrder: `w${i}`,
        createdAt: 1,
      } as never);
    }
    await db.weeklyReviews.add({
      id: g.id("wr", w),
      weeklyPlanId: weekId,
      answers: { accomplished: g.title() },
      createdAt: 1,
      updatedAt: 1,
    } as never);
  }

  /* days */
  for (let d = 0; d < g.int(1, 5); d++) {
    const planId = g.id("dp", d);
    planIds.push(planId);
    await db.dailyPlans.add({
      id: planId,
      date: `2026-03-1${d}`,
      createdAt: 1,
      ...(g.rnd() < 0.5 ? { closedAt: g.int(1, 1_000_000) } : {}),
    } as never);
    const periodIds: string[] = [];
    for (let p = 0; p < g.int(1, 5); p++) {
      const pid = g.id("dper", d * 10 + p);
      periodIds.push(pid);
      await db.dailyPeriods.add({
        id: pid,
        dailyPlanId: planId,
        name: g.pick(["Morning", "Evening", "السحور"]),
        order: p + 1,
        mode: "fixed",
        startTime: "08:00",
        endTime: "10:00",
      } as never);
    }
    for (let i = 0; i < g.int(0, 6); i++) {
      await db.dailyEntries.add({
        id: g.id("de", d * 100 + i),
        dailyPlanId: planId,
        itemId: g.pick(itemIds),
        periodId: g.pick(periodIds),
        executionStatus: g.pick(["pending", "completed", "skipped"]),
        sortOrder: `d${i}`,
        createdAt: 1,
      } as never);
    }
  }

  /* period settings */
  for (let i = 0; i < g.int(1, 5); i++) {
    await db.periodSettings.add({
      id: g.id("ps", i),
      name: g.pick(["Morning", "Night", "Suhoor"]),
      tagline: "A gentle start",
      order: i + 1,
      enabled: g.rnd() < 0.8,
      mode: "fixed",
      startAnchor: { kind: "prayer", prayer: "fajr", offsetMin: 0 },
      endAnchor: { kind: "prayer", prayer: "dhuhr", offsetMin: 0 },
      isDefault: i < 5,
    } as never);
  }

  /* recurrence */
  for (let i = 0; i < g.int(0, 4); i++) {
    const ruleId = g.id("rr", i);
    ruleIds.push(ruleId);
    await db.recurrenceRules.add({
      id: ruleId,
      itemId: g.pick(itemIds),
      pattern: g.pick(["daily", "weekly", "weekdays", "monthly"]),
      interval: g.int(1, 2),
      startDate: "2026-01-05",
      state: g.pick(["active", "paused"]),
      version: 1,
      createdAt: 1,
      updatedAt: 1,
    } as never);
    for (let k = 0; k < g.int(0, 3); k++) {
      await db.occurrenceStates.add({
        id: g.id("os", i * 10 + k),
        ruleId,
        occurrenceKey: `${ruleId}:2026-03-1${k}`,
        originalDate: `2026-03-1${k}`,
        kind: g.pick(["done", "skipped"]),
      } as never);
    }
  }

  /* routines */
  for (let i = 0; i < g.int(0, 3); i++) {
    const routineId = g.id("rt", i);
    routineIds.push(routineId);
    await db.routines.add({
      id: routineId,
      name: `روتين ${i}`,
      sortOrder: `r${i}`,
      createdAt: 1,
    } as never);
    for (let s = 0; s < g.int(1, 4); s++) {
      await db.routineItems.add({
        id: g.id("ri", i * 10 + s),
        routineId,
        title: g.title(),
        sortOrder: `t${s}`,
      } as never);
    }
    const execId = g.id("rx", i);
    await db.routineExecutions.add({
      id: execId,
      routineId,
      date: "2026-03-15",
      startedAt: 1,
      state: g.pick(["running", "done"]),
      titleSnapshot: `روتين ${i}`,
    } as never);
    await db.routineExecutionSteps.add({
      id: g.id("rxs", i),
      executionId: execId,
      titleSnapshot: "خطوة",
      status: "pending",
      sortOrder: "1",
    } as never);
  }

  /* resume + activity */
  for (let i = 0; i < g.int(0, 4); i++) {
    await db.resumeMarkers.add({
      id: g.id("rm", i),
      itemId: g.pick(itemIds),
      reason: "paused",
      createdAt: 1,
    } as never);
    await db.resumeSuggestionStates.add({
      id: g.id("rs", i),
      sourceKind: "note",
      sourceId: g.pick(itemIds),
      presentationKey: `p${i}`,
      state: "dismissed",
    } as never);
  }
  for (let i = 0; i < g.int(0, 15); i++) {
    await db.activityHistory.add({
      id: g.id("ah", i),
      entityType: "item",
      entityId: g.pick(itemIds),
      action: g.pick(["created", "completed", "updated"]),
      timestamp: g.int(1, 1_000_000),
    } as never);
  }

  await setSetting(SETTING_KEYS.userName, "اختبار العودة");
  await setSetting(SETTING_KEYS.firstDayOfWeek, 6);
}

async function snapshotStores(): Promise<{
  rows: Map<string, unknown[]>;
  settings: Map<string, unknown>;
}> {
  const rows = new Map<string, unknown[]>();
  for (const store of ALL_STORES) {
    if (store === "appSettings") continue;
    const list = (await db.table(store).toArray()) as { id?: string }[];
    list.sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
    rows.set(store, list as unknown[]);
  }
  const settings = new Map<string, unknown>();
  for (const row of await db.appSettings.toArray()) {
    settings.set(row.key, row.value);
  }
  return { rows, settings };
}

describe("backup round-trip property (seeded random corpora)", () => {
  for (const seed of [11, 42, 2026]) {
    test(`seed ${seed}: create → wipe → restore → identical`, async () => {
      await generateAndSeed(seed);
      const before = await snapshotStores();

      const created = await createAutoBackup(Date.now());
      expect(created.ok).toBe(true);

      // a full foreign wipe (the worst case: everything replaced)
      const wiped = await applyRestore({ items: [] });
      expect(wiped.ok).toBe(true);
      expect(await db.items.count()).toBe(0);

      const restored = await restoreAutoBackup(created.ok ? created.value.id : "");
      expect(restored.ok).toBe(true);

      const after = await snapshotStores();
      expect(after.rows.size).toBe(before.rows.size);
      for (const [store, expected] of before.rows) {
        const got = after.rows.get(store) ?? [];
        expect(
          JSON.stringify(got),
          `store ${store} differs after restore`
        ).toBe(JSON.stringify(expected));
      }
      // settings compare by key → value (updatedAt is intentionally rewritten)
      for (const [key, value] of before.settings) {
        if (key === SETTING_KEYS.restoreSnapshot) continue;
        expect(after.settings.get(key)).toBe(value);
      }
    });
  }
});
