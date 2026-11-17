/* Auto-backup tests (v1.1) — the quiet weekly on-device snapshot.
   Covers: gating (not-registered / empty / too-soon), retention (keep 3),
   survive-restore semantics, and restore round-trip. Time is injected. */

import { describe, expect, test, beforeEach } from "bun:test";
import { db, setSetting } from "../src/lib/lifeos/db";
import { SETTING_KEYS } from "../src/lib/lifeos/defaults";
import { vaultDb } from "../src/lib/lifeos/vault-db";
import {
  AUTO_BACKUP_INTERVAL_MS,
  applyRestore,
  createAutoBackup,
  getAutoBackup,
  listAutoBackups,
  maybeAutoBackup,
  restoreAutoBackup,
} from "../src/lib/lifeos/services/backup-service";

const DAY = 24 * 60 * 60 * 1000;

async function resetState(): Promise<void> {
  for (const table of db.tables) {
    await table.clear();
  }
  await vaultDb.vault.clear();
}

async function registerUser(): Promise<void> {
  await setSetting(SETTING_KEYS.userName, "فاحص النسخ");
}

async function seedItem(title: string): Promise<void> {
  await db.items.add({
    id: `item-${title}`,
    type: "task",
    title,
    description: "",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  } as never);
}

describe("maybeAutoBackup — gating", () => {
  beforeEach(async () => {
    await resetState();
  });

  test("skips when nobody registered", async () => {
    const res = await maybeAutoBackup(1000);
    expect(res.created).toBe(false);
    expect(res.reason).toBe("not-registered");
    expect(await listAutoBackups()).toEqual([]);
  });

  test("skips when there is no data at all", async () => {
    await registerUser();
    const res = await maybeAutoBackup(1000);
    expect(res.created).toBe(false);
    expect(res.reason).toBe("empty");
  });

  test("creates when registered with data", async () => {
    await registerUser();
    await seedItem("مهمة أولى");
    const res = await maybeAutoBackup(1000);
    expect(res.created).toBe(true);
    const list = await listAutoBackups();
    expect(list.length).toBe(1);
  });

  test("does not create again within the week", async () => {
    await registerUser();
    await seedItem("مهمة أولى");
    expect((await maybeAutoBackup(1000)).created).toBe(true);
    const res = await maybeAutoBackup(1000 + 6 * DAY);
    expect(res.created).toBe(false);
    expect(res.reason).toBe("too-soon");
    expect((await listAutoBackups()).length).toBe(1);
  });

  test("creates again after the week passes", async () => {
    await registerUser();
    await seedItem("مهمة أولى");
    expect((await maybeAutoBackup(1000)).created).toBe(true);
    const res = await maybeAutoBackup(1000 + AUTO_BACKUP_INTERVAL_MS + 1);
    expect(res.created).toBe(true);
    expect((await listAutoBackups()).length).toBe(2);
  });
});

describe("auto-backup retention & restore", () => {
  beforeEach(async () => {
    await resetState();
    await registerUser();
    await seedItem("أ");
  });

  test("keeps only the three newest snapshots", async () => {
    await createAutoBackup(1000);
    await createAutoBackup(2000);
    await createAutoBackup(3000);
    await createAutoBackup(4000);
    const list = await listAutoBackups();
    expect(list.length).toBe(3);
    expect(list.map((b) => b.at)).toEqual([4000, 3000, 2000]);
  });

  test("auto-backups survive a full restore of the main DB", async () => {
    await createAutoBackup(1000);
    // a foreign restore replaces the main DB completely
    const res = await applyRestore(
      { items: [] },
      { "user.name": "someone-else" }
    );
    expect(res.ok).toBe(true);
    const list = await listAutoBackups();
    expect(list.length).toBe(1);
    expect(list[0].at).toBe(1000);
  });

  test("restoreAutoBackup round-trips the data", async () => {
    await seedItem("ب");
    const created = await createAutoBackup(1000);
    expect(created.ok).toBe(true);
    // wipe the main data (foreign restore with nothing)
    await applyRestore({ items: [] });
    expect(await db.items.count()).toBe(0);

    const backup = created.ok ? created.value.id : "";
    const restored = await restoreAutoBackup(backup);
    expect(restored.ok).toBe(true);
    expect(await db.items.count()).toBe(2);
    const titles = (await db.items.toArray()).map((i) => i.title).sort();
    expect(titles).toEqual(["أ", "ب"]);
  });

  test("restoreAutoBackup with an unknown id fails cleanly", async () => {
    const res = await restoreAutoBackup("auto-does-not-exist");
    expect(res.ok).toBe(false);
  });

  test("getAutoBackup returns the stored snapshot with settings", async () => {
    await createAutoBackup(1000);
    const got = await getAutoBackup("auto-1000");
    expect(got).not.toBe(null);
    expect(got?.settings?.[SETTING_KEYS.userName]).toBe("فاحص النسخ");
  });
});
