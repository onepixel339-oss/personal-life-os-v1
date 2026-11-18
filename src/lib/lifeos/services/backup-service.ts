/* BackupService — human-readable JSON export, validated atomic restore (§11).
   checksum = SHA-256 over canonical JSON of `data` (Web Crypto).
   v1.4 — encrypted export: the same payload sealed with AES-GCM, key
   derived from a user password via PBKDF2 (Web Crypto, zero network).
   The plaintext path stays exactly as it was — transparency is a feature. */

import { db, getSetting, setSetting } from "../db";
import { emitChange } from "../events";
import { SETTING_KEYS } from "../defaults";
import { ALL_STORES, type StoreName } from "../db";
import { getVault, setVault } from "../vault-db";
import type { Result } from "../types";
import { err, ok } from "../types";

export const SCHEMA_VERSION = 1;
export const APP_ID = "personal-life-os";
export const APP_VERSION = "1.6.0";

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

/** Read every store + settings once (shared by export & auto-backup). */
async function collectAllStores(includeSettings: boolean): Promise<{
  data: Record<string, unknown[]>;
  counts: Record<string, number>;
  settings?: Record<string, unknown>;
}> {
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
  return { data, counts, settings };
}

export async function exportBackup(
  includeSettings = true
): Promise<Result<{ blob: Blob; filename: string }>> {
  try {
    const payload = await buildBackupPayload(includeSettings);
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const filename = `life-os-backup-${backupStamp(nowFromDate(payload.exportedAt))}.json`;
    await setSetting(SETTING_KEYS.lastBackupAt, Date.now());
    return ok({ blob, filename });
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't build the backup file." });
  }
}

/** Build the full BackupFile payload (shared by export & auto-backup &
    encrypted export). */
async function buildBackupPayload(includeSettings: boolean): Promise<BackupFile> {
  const { data, counts, settings } = await collectAllStores(includeSettings);
  const checksum = await computeChecksum(data);
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    counts,
    checksum,
    data,
    settings,
  };
}

function nowFromDate(iso: string): Date {
  return new Date(iso);
}

function backupStamp(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadBackup(
  includeSettings = true
): Promise<Result<{ filename: string }>> {
  const res = await exportBackup(includeSettings);
  if (!res.ok) return res;
  downloadBlob(res.value.blob, res.value.filename);
  return ok({ filename: res.value.filename });
}

/* ---------- v1.4: encrypted export (AES-GCM + PBKDF2, all local) ----------
   The envelope is JSON so the file stays inspectable about everything
   EXCEPT the data itself; AES-GCM's auth tag makes a wrong password and a
   tampered file fail identically and safely. */

export const ENC_BACKUP_FORMAT = "lifeos-encrypted";
export const ENC_KDF_ITERATIONS = 600_000;
export const ENC_PASSWORD_MIN = 8;

export interface EncryptedBackupFile {
  app: string;
  format: typeof ENC_BACKUP_FORMAT;
  formatVersion: 1;
  appVersion: string;
  exportedAt: string;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  /** base64 of the AES-GCM ciphertext over the plaintext BackupFile JSON */
  data: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`lifeos-backup:${password}`),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}

export async function exportEncryptedBackup(
  password: string,
  includeSettings = true
): Promise<Result<{ blob: Blob; filename: string }>> {
  if (password.length < ENC_PASSWORD_MIN) {
    return err({
      code: "validation",
      message: "The password must be at least 8 characters.",
    });
  }
  try {
    const payload = await buildBackupPayload(includeSettings);
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await deriveAesKey(password, salt, ENC_KDF_ITERATIONS, ["encrypt"]);
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      plaintext
    );
    const envelope: EncryptedBackupFile = {
      app: APP_ID,
      format: ENC_BACKUP_FORMAT,
      formatVersion: 1,
      appVersion: APP_VERSION,
      exportedAt: payload.exportedAt,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: ENC_KDF_ITERATIONS,
        salt: bytesToBase64(salt),
      },
      cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
      data: bytesToBase64(new Uint8Array(sealed)),
    };
    const json = JSON.stringify(envelope, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const filename = `life-os-encrypted-backup-${backupStamp(nowFromDate(payload.exportedAt))}.json`;
    await setSetting(SETTING_KEYS.lastBackupAt, Date.now());
    return ok({ blob, filename });
  } catch (e) {
    console.error("exportEncryptedBackup failed", e);
    return err({ code: "write_failed", message: "Couldn't build the encrypted backup file." });
  }
}

export async function downloadEncryptedBackup(
  password: string,
  includeSettings = true
): Promise<Result<{ filename: string }>> {
  const res = await exportEncryptedBackup(password, includeSettings);
  if (!res.ok) return res;
  downloadBlob(res.value.blob, res.value.filename);
  return ok({ filename: res.value.filename });
}

/** Cheap peek: does this text carry the encrypted envelope? (Never decrypts.) */
export function isEncryptedBackupFile(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as Partial<EncryptedBackupFile>;
    return parsed?.format === ENC_BACKUP_FORMAT;
  } catch {
    return false;
  }
}

/** Decrypt an envelope back into the plaintext BackupFile JSON. A wrong
    password and a tampered file both fail here — AES-GCM authenticates. */
export async function decryptBackupFile(
  text: string,
  password: string
): Promise<Result<string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error(e);
    return err({ code: "backup_invalid", message: "That file isn't valid JSON." });
  }
  const file = parsed as Partial<EncryptedBackupFile>;
  if (
    !file ||
    file.format !== ENC_BACKUP_FORMAT ||
    typeof file.data !== "string" ||
    !file.kdf ||
    typeof file.kdf.salt !== "string" ||
    !file.cipher ||
    typeof file.cipher.iv !== "string"
  ) {
    return err({
      code: "backup_invalid",
      message: "The encrypted backup file is malformed.",
    });
  }
  try {
    const key = await deriveAesKey(
      password,
      base64ToBytes(file.kdf.salt),
      file.kdf.iterations || ENC_KDF_ITERATIONS,
      ["decrypt"]
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(file.cipher.iv) as unknown as BufferSource },
      key,
      base64ToBytes(file.data) as unknown as BufferSource
    );
    return ok(new TextDecoder().decode(plaintext));
  } catch {
    // GCM failure = wrong password or tampered bytes — no way to tell,
    // and no information leaks either way. Keep the message honest & kind.
    return err({
      code: "backup_invalid",
      message: "That password doesn't unlock this file.",
    });
  }
}

/* ---------- v1.3: the weekly backup nudge, decided by data ---------- */

const WEEK_MS = 7 * 86_400_000;

export interface WeeklyNudgeInput {
  now: number;
  /** epoch ms of the last export (backup.lastExportAt), null = never exported */
  lastExportAt: number | null;
  /** epoch ms of the last nudge (backup.weeklyNudge.at), null = never nudged */
  lastNudgeAt: number | null;
  /** at least one قفلة in the last 7 days — a lived week, not a calendar one */
  closedInLast7Days: boolean;
  /** anything worth protecting? */
  itemCount: number;
}

/** One line, at most once a week, never a scolding. Speaks only when the
 *  user actually lived a week in here (≥1 closure), the last export is stale
 *  (>7 days or never), and we haven't already spoken this week. */
export function shouldWeeklyNudge(i: WeeklyNudgeInput): boolean {
  if (i.itemCount <= 0 || !i.closedInLast7Days) return false;
  if (i.lastExportAt !== null && i.now - i.lastExportAt < WEEK_MS) return false;
  if (i.lastNudgeAt !== null && i.now - i.lastNudgeAt < WEEK_MS) return false;
  return true;
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
  lastAutoBackupAt: number | null;
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
  const autos = await getVault<AutoBackup[]>(VAULT_KEY_AUTO, []);
  return {
    usage,
    quota,
    persisted,
    counts,
    lastBackupAt: (lastBackupRow?.value as number) ?? null,
    lastAutoBackupAt: autos[0]?.at ?? null,
  };
}

/* ---------- on-device automatic backups (v1.1) ----------
   A quiet weekly snapshot kept INSIDE the device (vault DB), immune to
   restores and wipes of the main DB. Survives "I lost my export file". */

export const AUTO_BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTO_BACKUP_KEEP = 3;
export const AUTO_BACKUP_MAX_BYTES = 20 * 1024 * 1024;
const VAULT_KEY_AUTO = "autoBackups";

export interface AutoBackup {
  id: string;
  at: number;
  appVersion: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
  settings?: Record<string, unknown>;
}

export interface AutoBackupMeta {
  id: string;
  at: number;
  counts: Record<string, number>;
}

export interface MaybeAutoBackupResult {
  created: boolean;
  reason?: "not-registered" | "too-soon" | "empty" | "too-large" | "error";
}

async function isRegisteredUser(): Promise<boolean> {
  const row = await db.appSettings.get(SETTING_KEYS.userName);
  return typeof row?.value === "string" && (row.value as string).trim() !== "";
}

/** Force-create a snapshot now (used by the Data screen button + tests). */
export async function createAutoBackup(
  nowMs = Date.now()
): Promise<Result<AutoBackupMeta>> {
  try {
    const { data, counts, settings } = await collectAllStores(true);
    if (JSON.stringify(data).length > AUTO_BACKUP_MAX_BYTES) {
      return err({
        code: "write_failed",
        message: "This database became too large for an on-device snapshot.",
      });
    }
    const backup: AutoBackup = {
      id: `auto-${nowMs}`,
      at: nowMs,
      appVersion: APP_VERSION,
      counts,
      data,
      settings,
    };
    const existing = await getVault<AutoBackup[]>(VAULT_KEY_AUTO, []);
    const kept = [backup, ...existing]
      .sort((a, b) => b.at - a.at)
      .slice(0, AUTO_BACKUP_KEEP);
    await setVault(VAULT_KEY_AUTO, kept);
    return ok({ id: backup.id, at: backup.at, counts: backup.counts });
  } catch (e) {
    console.error("createAutoBackup failed", e);
    return err({ code: "write_failed", message: "Couldn't write the auto-backup." });
  }
}

/** User content stores — seeded settings/periods never count as "data". */
const CONTENT_STORES: StoreName[] = [
  "items",
  "spaces",
  "noteDetails",
  "entertainmentDetails",
  "inboxEntries",
  "weeklyEntries",
  "dailyEntries",
  "routines",
];

/** Boot-time check: quietly snapshot at most once a week. Never throws. */
export async function maybeAutoBackup(
  nowMs = Date.now()
): Promise<MaybeAutoBackupResult> {
  try {
    if (!(await isRegisteredUser())) {
      return { created: false, reason: "not-registered" };
    }
    const existing = await getVault<AutoBackup[]>(VAULT_KEY_AUTO, []);
    const latest = existing[0];
    if (latest && nowMs - latest.at < AUTO_BACKUP_INTERVAL_MS) {
      return { created: false, reason: "too-soon" };
    }
    let contentRows = 0;
    for (const store of CONTENT_STORES) {
      contentRows += await db.table(store).count();
    }
    if (contentRows === 0) {
      return { created: false, reason: "empty" };
    }
    const res = await createAutoBackup(nowMs);
    if (!res.ok) return { created: false, reason: "error" };
    return { created: true };
  } catch (e) {
    console.error("maybeAutoBackup failed", e);
    return { created: false, reason: "error" };
  }
}

export async function listAutoBackups(): Promise<AutoBackupMeta[]> {
  const existing = await getVault<AutoBackup[]>(VAULT_KEY_AUTO, []);
  return existing
    .sort((a, b) => b.at - a.at)
    .map(({ id, at, counts }) => ({ id, at, counts }));
}

export async function getAutoBackup(id: string): Promise<AutoBackup | null> {
  const existing = await getVault<AutoBackup[]>(VAULT_KEY_AUTO, []);
  return existing.find((b) => b.id === id) ?? null;
}

/** Restore an on-device snapshot through the same atomic path as files. */
export async function restoreAutoBackup(
  id: string
): Promise<Result<RestoreReport>> {
  const backup = await getAutoBackup(id);
  if (!backup) {
    return err({
      code: "not_found",
      message: "No restore snapshot is available.",
    });
  }
  return applyRestore(backup.data, backup.settings);
}

export type { StoreName };
