/* BackupService — human-readable JSON export, validated atomic restore (§11).
   checksum = SHA-256 over canonical JSON of `data` (Web Crypto). */

import { db, getSetting, setSetting } from "../db";
import { emitChange } from "../events";
import { SETTING_KEYS } from "../defaults";
import { ALL_STORES, type StoreName } from "../db";
import type { Result } from "../types";
import { err, ok } from "../types";

export const SCHEMA_VERSION = 1;
export const APP_ID = "personal-life-os";
export const APP_VERSION = "1.0.0";

export interface BackupFile {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  counts: Record<string, number>;
  checksum: string;
  data: Record<string, unknown[]>;
  settings?: Record<string, unknown>;
}

function canonicalJson(value: unknown): string {
  const sortValue = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortValue);
    if (v && typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const out: Record<string, unknown> = {};
      for (const [k, val] of entries) out[k] = sortValue(val);
      return out;
    }
    return v;
  };
  return JSON.stringify(sortValue(value));
}

export async function computeChecksum(data: unknown): Promise<string> {
  const canonical = canonicalJson(data);
  const buffer = new TextEncoder().encode(canonical);
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return (
      "sha256:" +
      Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }
  return "sha256:unavailable";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export async function exportBackup(
  includeSettings = true
): Promise<Result<{ blob: Blob; filename: string }>> {
  try {
    const data: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const store of ALL_STORES) {
      const rows = await db.table(store).toArray();
      data[store] = rows;
      counts[store] = rows.length;
    }
    let settings: Record<string, unknown> | undefined;
    if (includeSettings) {
      const rows = await db.appSettings.toArray();
      settings = {};
      for (const row of rows) settings[row.key] = row.value;
    }
    const checksum = await computeChecksum(data);
    const now = new Date();
    const payload: BackupFile = {
      app: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      appVersion: APP_VERSION,
      counts,
      checksum,
      data,
      settings,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const filename = `life-os-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
    await setSetting(SETTING_KEYS.lastBackupAt, now.getTime());
    return ok({ blob, filename });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't build the backup file." });
  }
}

export async function downloadBackup(
  includeSettings = true
): Promise<Result<{ filename: string }>> {
  const res = await exportBackup(includeSettings);
  if (!res.ok) return res;
  const url = URL.createObjectURL(res.value.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.value.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return ok({ filename: res.value.filename });
}

/* ---------- validation ---------- */

const REQUIRED_BY_STORE: Record<string, string[]> = {
  items: ["id", "type", "title", "status", "createdAt", "updatedAt"],
  spaces: ["id", "name", "sortOrder", "createdAt"],
  itemSpaceLinks: ["id", "itemId", "spaceId", "sortOrder", "createdAt"],
  itemRelationships: ["id", "sourceItemId", "targetItemId", "relationType", "createdAt"],
  projectDetails: ["itemId"],
  noteDetails: ["itemId", "content", "noteType", "updatedAt"],
  returnNoteSettings: ["noteItemId", "enabled", "trigger", "repeat"],
  entertainmentDetails: ["itemId", "mediaType", "progressStatus"],
  inboxEntries: ["id", "itemId", "sortOrder", "createdAt"],
  weeklyPlans: ["id", "startDate", "endDate", "createdAt"],
  weeklyEntries: ["id", "weeklyPlanId", "itemId", "sortOrder", "createdAt"],
  dailyPlans: ["id", "date", "createdAt"],
  dailyPeriods: ["id", "dailyPlanId", "name", "order"],
  dailyEntries: ["id", "dailyPlanId", "executionStatus", "sortOrder", "createdAt"],
  periodSettings: ["id", "name", "order"],
  recurrenceRules: ["id", "pattern", "interval", "startDate", "createdAt", "updatedAt"],
  occurrenceStates: ["id", "ruleId", "occurrenceKey", "originalDate", "kind"],
  routines: ["id", "name", "sortOrder", "createdAt"],
  routineItems: ["id", "routineId", "title", "sortOrder"],
  routineExecutions: ["id", "routineId", "date", "startedAt", "state", "titleSnapshot"],
  routineExecutionSteps: ["id", "executionId", "titleSnapshot", "status", "sortOrder"],
  weeklyReviews: ["id", "weeklyPlanId", "answers", "createdAt", "updatedAt"],
  resumeMarkers: ["id", "itemId", "reason", "createdAt"],
  resumeSuggestionStates: ["id", "sourceKind", "sourceId", "presentationKey", "state"],
  activityHistory: ["id", "entityType", "entityId", "action", "timestamp"],
  appSettings: ["key", "value"],
};

export interface ValidationSummary {
  counts: Record<string, number>;
  issues: string[];
  hasSettings: boolean;
  valid: boolean;
  message: string;
}

function validateRows(store: string, rows: unknown[]): string[] {
  const issues: string[] = [];
  const required = REQUIRED_BY_STORE[store];
  if (!required) return issues;
  if (!Array.isArray(rows)) {
    issues.push(`${store}: expected a list of rows.`);
    return issues;
  }
  rows.forEach((row, i) => {
    if (!row || typeof row !== "object") {
      issues.push(`${store} row ${i + 1}: not an object.`);
      return;
    }
    for (const field of required) {
      if ((row as Record<string, unknown>)[field] === undefined) {
        issues.push(`${store} row ${i + 1}: missing “${field}”.`);
        break;
      }
    }
  });
  return issues;
}

function referentialCheck(data: Record<string, unknown[]>): string[] {
  const issues: string[] = [];
  const ids = (store: string) =>
    new Set(
      (data[store] as { id?: string }[] | undefined)?.map((r) => r.id as string) ?? []
    );
  const itemIds = ids("items");
  const spaceIds = ids("spaces");
  const planIds = ids("dailyPlans");
  const weekIds = ids("weeklyPlans");
  const ruleIds = ids("recurrenceRules");
  const routineIds = ids("routines");
  const rows = (store: string) =>
    (data[store] as Record<string, unknown>[] | undefined) ?? [];
  const dangling = (
    store: string,
    field: string,
    valid: Set<string>,
    label: string
  ) => {
    for (const row of rows(store)) {
      const ref = row[field] as string | undefined;
      if (ref !== undefined && !valid.has(ref))
        issues.push(`${store}: a row points to a missing ${label}.`);
    }
  };
  dangling("itemSpaceLinks", "itemId", itemIds, "item");
  dangling("itemSpaceLinks", "spaceId", spaceIds, "space");
  dangling("itemRelationships", "sourceItemId", itemIds, "item");
  dangling("itemRelationships", "targetItemId", itemIds, "item");
  dangling("inboxEntries", "itemId", itemIds, "item");
  dangling("weeklyEntries", "itemId", itemIds, "item");
  dangling("weeklyEntries", "weeklyPlanId", weekIds, "week");
  dangling("dailyEntries", "dailyPlanId", planIds, "day plan");
  dangling("dailyEntries", "itemId", itemIds, "item");
  dangling("dailyPeriods", "dailyPlanId", planIds, "day plan");
  dangling("occurrenceStates", "ruleId", ruleIds, "repeat rule");
  dangling("routineItems", "routineId", routineIds, "routine");
  dangling("routineExecutions", "routineId", routineIds, "routine");
  for (const row of rows("dailyEntries")) {
    if (row.itemId === undefined && row.routineId === undefined)
      issues.push("dailyEntries: a row has neither an item nor a routine.");
  }
  return issues;
}

export async function validateBackupFile(
  text: string
): Promise<Result<ValidationSummary & { data: Record<string, unknown[]>; settings?: Record<string, unknown> }>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error(e);
    return err({ code: "backup_invalid", message: "That file isn't valid JSON." });
  }
  const file = parsed as Partial<BackupFile>;
  if (!file || typeof file !== "object" || file.app !== APP_ID) {
    return err({
      code: "backup_invalid",
      message: "That file doesn't look like a Life OS backup.",
    });
  }
  if (typeof file.schemaVersion !== "number") {
    return err({ code: "backup_invalid", message: "The backup has no schema version." });
  }
  if (file.schemaVersion > SCHEMA_VERSION) {
    return err({
      code: "backup_invalid",
      message: "This backup is from a newer version of Life OS.",
    });
  }
  if (!file.data || typeof file.data !== "object") {
    return err({ code: "backup_invalid", message: "The backup has no data." });
  }
  const checksum = await computeChecksum(file.data);
  if (file.checksum && file.checksum !== "sha256:unavailable" && file.checksum !== checksum) {
    return err({
      code: "backup_invalid",
      message: "The backup file is corrupted (checksum mismatch).",
    });
  }
  const issues: string[] = [];
  const counts: Record<string, number> = {};
  for (const store of ALL_STORES) {
    const rows = (file.data as Record<string, unknown[]>)[store] ?? [];
    issues.push(...validateRows(store, rows).slice(0, 5));
    counts[store] = rows.length;
  }
  issues.push(...referentialCheck(file.data as Record<string, unknown[]>).slice(0, 5));
  return ok({
    counts,
    issues,
    hasSettings: !!file.settings,
    valid: true,
    message: "Backup looks good.",
    data: file.data as Record<string, unknown[]>,
    settings: file.settings,
  });
}

export interface RestoreReport {
  counts: Record<string, number>;
  snapshotTaken: boolean;
}

/** Replace everything atomically; any failure rolls back (§11.2 step 6). */
export async function applyRestore(
  data: Record<string, unknown[]>,
  settings?: Record<string, unknown>
): Promise<Result<RestoreReport>> {
  try {
    const currentCounts: Record<string, number> = {};
    for (const store of ALL_STORES) {
      currentCounts[store] = await db.table(store).count();
    }
    // take the pre-restore snapshot into memory first — it must be written
    // AFTER the replace transaction, because that transaction clears
    // appSettings too and would wipe a snapshot written before it.
    let snapshotTaken = false;
    const currentData: Record<string, unknown[]> = {};
    for (const store of ALL_STORES) currentData[store] = await db.table(store).toArray();
    const size = JSON.stringify(currentData).length;
    const snapshot =
      size < 50 * 1024 * 1024
        ? ({ at: Date.now(), data: currentData } as const)
        : null;
    await db.transaction(
      "rw",
      ALL_STORES.map((s) => db.table(s)),
      async () => {
        for (const store of ALL_STORES) {
          await db.table(store).clear();
          const rows = data[store] ?? [];
          if (rows.length) await db.table(store).bulkAdd(rows);
        }
        if (settings) {
          const rows = Object.entries(settings).map(([key, value]) => ({
            key,
            value,
            updatedAt: Date.now(),
          }));
          await db.appSettings.bulkPut(rows);
        }
      }
    );
    // replace succeeded — now the safety snapshot can survive (single-row
    // write; if it fails the restore is still good, just without undo).
    if (snapshot) {
      try {
        await setSetting(SETTING_KEYS.restoreSnapshot, snapshot);
        snapshotTaken = true;
      } catch (e) {
        console.error("restore snapshot write failed", e);
      }
    }
    emitChange([...ALL_STORES]);
    const counts: Record<string, number> = {};
    for (const store of ALL_STORES) {
      counts[store] = (data[store] ?? []).length;
    }
    return ok({ counts, snapshotTaken });
  } catch (e) {
    console.error("applyRestore failed", e);
    return err({
      code: "write_failed",
      message: "Restore failed. Your current data was not changed.",
    });
  }
}

export async function undoRestore(): Promise<Result<void>> {
  const snapshot = await getSetting<{ at: number; data: Record<string, unknown[]> } | null>(
    SETTING_KEYS.restoreSnapshot,
    null
  );
  if (!snapshot?.data) {
    return err({ code: "not_found", message: "No restore snapshot is available." });
  }
  const res = await applyRestore(snapshot.data, undefined);
  if (!res.ok) return res as Result<void>;
  await setSetting(SETTING_KEYS.restoreSnapshot, null);
  return ok(undefined);
}

export interface StorageInfo {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
  counts: Record<string, number>;
  lastBackupAt: number | null;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    usage = estimate?.usage ?? null;
    quota = estimate?.quota ?? null;
  } catch {
    /* not available */
  }
  let persisted: boolean | null = null;
  try {
    persisted = navigator.storage?.persisted
      ? await navigator.storage.persisted()
      : null;
  } catch {
    persisted = null;
  }
  const counts: Record<string, number> = {};
  for (const store of ALL_STORES) {
    counts[store] = await db.table(store).count();
  }
  const lastBackupRow = await db.appSettings.get(SETTING_KEYS.lastBackupAt);
  return {
    usage,
    quota,
    persisted,
    counts,
    lastBackupAt: (lastBackupRow?.value as number) ?? null,
  };
}

export type { StoreName };
