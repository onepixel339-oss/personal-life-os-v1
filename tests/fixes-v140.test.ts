/* v1.4.0 fixes & features — the regression locks.
   1. Encrypted backup: AES-GCM envelope round-trips, a wrong password and
      a tampered file both fail, a short password is refused, and the
      plaintext export path is untouched.
   2. PIN hardening: PBKDF2 records (v2), silent upgrade of legacy v1
      records on first successful unlock, and the gentle lockout — five
      wrong tries rest the lock screen, the right PIN is refused while
      resting, and the first success afterwards clears everything.
   3. Activity log cap: the newest rows survive the prune, the oldest go.
   4. Inbox → Today: the period the user picked in the dialog actually
      lands the entry in that period (the silent drop, closed at the
      service layer).
   5. i18n: the new v1.4 keys exist in BOTH dictionaries and the about
      line says 1.4.0. */

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { db, pruneActivityHistory } from "../src/lib/lifeos/db";
import { vaultDb } from "../src/lib/lifeos/vault-db";
import { setVault } from "../src/lib/lifeos/vault-db";
import { todayLocal } from "../src/lib/lifeos/dates";
import {
  decryptBackupFile,
  ENC_PASSWORD_MIN,
  exportBackup,
  exportEncryptedBackup,
  isEncryptedBackupFile,
  validateBackupFile,
} from "../src/lib/lifeos/services/backup-service";
import {
  addInboxItemToToday,
} from "../src/lib/lifeos/services/inbox-service";
import {
  getPinLockState,
  hashPin,
  PIN_HASH_ITERATIONS,
  PIN_LOCK_DELAYS_MS,
  PIN_LOCK_THRESHOLD,
  PIN_LOCK_VAULT_KEY,
  setPin,
  VAULT_KEY_PIN,
  verifyPin,
} from "../src/lib/lifeos/services/pin-service";
import { ar, en } from "../src/lib/lifeos/i18n";

async function freshDb(): Promise<void> {
  await db.delete();
  await db.open();
}

async function clearPinState(): Promise<void> {
  await vaultDb.vault.delete(VAULT_KEY_PIN);
  await vaultDb.vault.delete(PIN_LOCK_VAULT_KEY);
}

function seedItem(id: string, title: string): Promise<unknown> {
  return db.items.add({
    id,
    type: "task",
    title,
    description: "",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  } as never);
}

beforeAll(async () => {
  await freshDb();
});

beforeEach(async () => {
  for (const store of db.tables) await store.clear();
  await clearPinState();
});

/* ---------------- 1: encrypted backup ---------------- */

describe("v1.4 encrypted backup", () => {
  test("round-trips: export → detect → decrypt → validate", async () => {
    await seedItem("e1", "مهمة الاختبار");
    const res = await exportEncryptedBackup("كلمة سر قوية ١٢٣", true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.filename).toContain("life-os-encrypted-backup-");

    const text = await res.value.blob.text();
    expect(isEncryptedBackupFile(text)).toBe(true);

    const right = await decryptBackupFile(text, "كلمة سر قوية ١٢٣");
    expect(right.ok).toBe(true);
    if (!right.ok) return;
    const validated = await validateBackupFile(right.value);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.counts.items).toBe(1);
  });

  test("the envelope hides the data: no plaintext leaks into the file", async () => {
    await seedItem("e2", "سر خاص جداً");
    const res = await exportEncryptedBackup("pass phrase 987", true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const text = await res.value.blob.text();
    expect(text).not.toContain("سر خاص جداً");
    // the envelope is honest about everything except the data itself
    const parsed = JSON.parse(text) as { app: string; format: string; kdf: { iterations: number } };
    expect(parsed.app).toBe("personal-life-os");
    expect(parsed.format).toBe("lifeos-encrypted");
    expect(parsed.kdf.iterations).toBeGreaterThan(100_000);
  });

  test("a wrong password fails kindly; a tampered file fails too", async () => {
    await seedItem("e3", "task");
    const res = await exportEncryptedBackup("the right one", true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const text = await res.value.blob.text();

    const wrong = await decryptBackupFile(text, "the wrong one");
    expect(wrong.ok).toBe(false);

    const envelope = JSON.parse(text) as { data: string };
    const mid = Math.floor(envelope.data.length / 2);
    const flipped =
      envelope.data.slice(0, mid) +
      (envelope.data[mid] === "A" ? "B" : "A") +
      envelope.data.slice(mid + 1);
    const tampered = await decryptBackupFile(
      JSON.stringify({ ...envelope, data: flipped }),
      "the right one"
    );
    expect(tampered.ok).toBe(false);
  });

  test("a short password is refused", async () => {
    const res = await exportEncryptedBackup("short");
    expect(res.ok).toBe(false);
    expect("short".length).toBeLessThan(ENC_PASSWORD_MIN);
  });

  test("the plaintext export path is unchanged and not flagged as encrypted", async () => {
    await seedItem("e4", "plain task");
    const res = await exportBackup(true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const text = await res.value.blob.text();
    expect(isEncryptedBackupFile(text)).toBe(false);
    expect(text).toContain("plain task");
    const validated = await validateBackupFile(text);
    expect(validated.ok).toBe(true);
  });
});

/* ---------------- 2: PIN hardening ---------------- */

describe("v1.4 PIN: PBKDF2 records", () => {
  test("setPin writes a v2 record with real iterations", async () => {
    await setPin("2580");
    const rec = (await vaultDb.vault.get(VAULT_KEY_PIN))?.value as {
      pinHash: string;
      v?: number;
      iterations?: number;
    };
    expect(rec.v).toBe(2);
    expect(rec.iterations).toBe(PIN_HASH_ITERATIONS);
    expect(rec.pinHash).not.toContain("2580");
    expect(await verifyPin("2580")).toBe(true);
    expect(await verifyPin("2581")).toBe(false);
  });

  test("a legacy v1 record still unlocks and upgrades itself in place", async () => {
    const legacyHash = await hashPin("1357", "legacy-salt");
    await setVault(VAULT_KEY_PIN, {
      pinHash: legacyHash,
      salt: "legacy-salt",
      createdAt: 1,
    });
    expect(await verifyPin("1357")).toBe(true);
    const upgraded = (await vaultDb.vault.get(VAULT_KEY_PIN))?.value as {
      pinHash: string;
      v?: number;
      iterations?: number;
    };
    expect(upgraded.v).toBe(2);
    expect(upgraded.pinHash).not.toBe(legacyHash);
    // and it still verifies after the upgrade
    expect(await verifyPin("1357")).toBe(true);
    expect(await verifyPin("0000")).toBe(false);
  });
});

describe("v1.4 PIN: the gentle lockout", () => {
  test("four wrong tries don't lock; the right one resets the count", async () => {
    await setPin("2580");
    for (let i = 0; i < PIN_LOCK_THRESHOLD - 1; i++) {
      expect(await verifyPin("0000")).toBe(false);
    }
    const before = await getPinLockState();
    expect(before.retryAfterMs).toBe(0);
    expect(before.failedAttempts).toBe(PIN_LOCK_THRESHOLD - 1);

    expect(await verifyPin("2580")).toBe(true);
    const after = await getPinLockState();
    expect(after.failedAttempts).toBe(0);
    expect(after.retryAfterMs).toBe(0);
  });

  test("five wrong tries lock; even the right PIN waits its turn", async () => {
    await setPin("2580");
    for (let i = 0; i < PIN_LOCK_THRESHOLD; i++) {
      expect(await verifyPin("9999")).toBe(false);
    }
    const lock = await getPinLockState();
    expect(lock.retryAfterMs).toBeGreaterThan(0);
    expect(lock.retryAfterMs).toBeLessThanOrEqual(PIN_LOCK_DELAYS_MS[0] + 5);

    // the right PIN is politely refused while resting
    expect(await verifyPin("2580")).toBe(false);

    // once the wait has passed (simulated by expiring the lock), it opens
    await setVault(PIN_LOCK_VAULT_KEY, {
      failedAttempts: PIN_LOCK_THRESHOLD,
      lockedUntil: Date.now() - 1,
    });
    expect(await verifyPin("2580")).toBe(true);
    const cleared = await getPinLockState();
    expect(cleared.retryAfterMs).toBe(0);
    expect(cleared.failedAttempts).toBe(0);
  });
});

/* ---------------- 3: the activity log cap ---------------- */

describe("v1.4 activity history cap", () => {
  test("prune keeps the newest rows and drops the oldest", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      id: `a${i}`,
      entityType: "item",
      entityId: "x",
      action: "created",
      timestamp: 1000 + i,
    }));
    await db.activityHistory.bulkAdd(rows as never);

    const removed = await pruneActivityHistory(10);
    expect(removed).toBe(20);
    expect(await db.activityHistory.count()).toBe(10);

    const kept = await db.activityHistory.toArray();
    const timestamps = kept.map((r) => r.timestamp).sort((a, b) => a - b);
    expect(timestamps[0]).toBe(1020); // the newest ten (1020..1029) survive
    expect(timestamps[timestamps.length - 1]).toBe(1029);
  });

  test("prune is a no-op at or under the cap", async () => {
    await db.activityHistory.bulkAdd([
      { id: "solo", entityType: "item", entityId: "x", action: "created", timestamp: 1 },
    ] as never);
    expect(await pruneActivityHistory(5000)).toBe(0);
    expect(await db.activityHistory.count()).toBe(1);
  });
});

/* ---------------- 4: inbox → today keeps the chosen period ---------------- */

describe("v1.4 inbox → today: the period choice lands", () => {
  test("the entry arrives inside the daily period mapped to that setting", async () => {
    await db.periodSettings.bulkAdd([
      { id: "ps-morning", name: "Morning", order: 1, enabled: true },
      { id: "ps-evening", name: "Evening", order: 2, enabled: true },
    ] as never);
    await seedItem("it1", "مهمة وارد");
    await db.inboxEntries.add({
      id: "in1",
      itemId: "it1",
      sortOrder: "a",
      createdAt: 1,
    } as never);

    const res = await addInboxItemToToday("it1", {
      date: todayLocal(),
      periodSettingId: "ps-evening",
      alsoRemoveFromInbox: true,
    });
    expect(res.ok).toBe(true);
    expect(res.ok && res.value.removedFromInbox).toBe(true);

    const entries = await db.dailyEntries.toArray();
    expect(entries.length).toBe(1);
    const periods = await db.dailyPeriods.toArray();
    const target = periods.find((p) => p.id === entries[0].periodId);
    expect(target?.settingId).toBe("ps-evening");
  });
});

/* ---------------- 5: i18n — the new keys exist in both languages ---------------- */

describe("v1.4 i18n", () => {
  const NEW_KEYS = [
    "data.exportEncrypted",
    "data.encTitle",
    "data.encDesc",
    "data.encPassword",
    "data.encConfirm",
    "data.encDo",
    "data.encErrMismatch",
    "data.encErrShort",
    "data.encSavedToast",
    "data.encOpenTitle",
    "data.encOpenDesc",
    "data.encUnlock",
    "data.encWrongPassword",
    "lock.locked",
    "shell.crashTitle",
    "shell.crashBody",
    "shell.crashRetry",
    "shell.crashBackToday",
    "shell.crashAppTitle",
    "shell.crashAppBody",
    "item.openLink",
    "item.removeLink",
  ];

  test("every new key exists in both dictionaries", () => {
    for (const key of NEW_KEYS) {
      expect(en[key], `missing EN key: ${key}`).toBeDefined();
      expect(ar[key], `missing AR key: ${key}`).toBeDefined();
    }
  });

  test("the about line follows the release (1.5.0)", () => {
    expect(en["about.version"]).toContain("1.5.0");
    expect(ar["about.version"]).toContain("1.5.0");
  });

  test("the Arabic lockout message carries the seconds placeholder", () => {
    expect(ar["lock.locked"]).toContain("{seconds}");
    expect(en["lock.locked"]).toContain("{seconds}");
  });
});
