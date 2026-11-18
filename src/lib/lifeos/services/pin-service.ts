/* PinService — optional device lock (privacy screen, not authentication).
   The PIN lives only in the vault DB as salt + stretched hash; it is never
   written to the main database and never included in any backup file.
   Threat model: casual snooping on a shared device — not a determined
   attacker with devtools access. Forgetting the PIN means a full local
   reset (there is no account to recover through, by design).

   v1.4 hardening:
   - The hash is now PBKDF2-HMAC-SHA256 (600,000 iterations, OWASP 2023)
     instead of a single SHA-256 pass — a stolen vault file no longer
     cracks a 4-digit PIN in under a second. Existing records upgrade
     silently to the new format on the next successful unlock.
   - Gentle lockout: after 5 wrong tries the lock screen rests for 30s,
     doubling up to a 15-minute cap. Honest tone, no punishment theater —
     and the forgot-PIN reset stays available at the bottom the whole time. */

import { db } from "../db";
import { getVault, setVault, wipeVault } from "../vault-db";
import type { Result } from "../types";
import { err, ok } from "../types";
import { LANG_STORAGE_KEY } from "../i18n";

export const VAULT_KEY_PIN = "pin";
export const PIN_MIN = 4;
export const PIN_MAX = 8;

/** OWASP 2023 for PBKDF2-HMAC-SHA256 password storage. */
export const PIN_HASH_ITERATIONS = 600_000;

/** Lockout: 5 wrong tries → rest, doubling, capped. Gentle by design. */
export const PIN_LOCK_THRESHOLD = 5;
export const PIN_LOCK_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000, 900_000];

export interface PinRecord {
  pinHash: string;
  salt: string;
  createdAt: number;
  /** v1.4 format marker; absent = legacy single SHA-256. */
  v?: 2;
  iterations?: number;
}

export interface PinLockState {
  failedAttempts: number;
  /** epoch ms; 0 = not locked */
  lockedUntil: number;
}

const VAULT_KEY_PIN_LOCK = "pinLock";
/** Vault key for the lockout state (exported for tests + diagnostics). */
export const PIN_LOCK_VAULT_KEY = VAULT_KEY_PIN_LOCK;

/* ---------- hashing ---------- */

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Legacy single SHA-256 pass — kept only to verify (and upgrade) old records. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const buffer = new TextEncoder().encode(`lifeos:${salt}:${pin}`);
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return bufferToHex(digest);
  }
  // deterministic test/browser fallback (Web Crypto is available in all
  // supported targets; this keeps the function total)
  let h = 0;
  const s = `lifeos:${salt}:${pin}`;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `weak:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/** v1.4: PBKDF2 key derivation — hex of 256 derived bits. */
export async function derivePinKey(
  pin: string,
  salt: string,
  iterations: number = PIN_HASH_ITERATIONS
): Promise<string> {
  if (!crypto?.subtle) {
    // total-function fallback for exotic environments
    return hashPin(pin, salt);
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`lifeos:${pin}`),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return bufferToHex(bits);
}

function randomSalt(): string {
  return (
    crypto.randomUUID?.().replace(/-/g, "").slice(0, 32) ??
    `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
  );
}

/* ---------- lock state ---------- */

async function readLock(): Promise<PinLockState> {
  const state = await getVault<PinLockState | null>(VAULT_KEY_PIN_LOCK, null);
  return { failedAttempts: 0, lockedUntil: 0, ...state };
}

async function writeLock(state: PinLockState): Promise<void> {
  try {
    await setVault(VAULT_KEY_PIN_LOCK, state);
  } catch (e) {
    // the lock is a courtesy, not a vault — never let it break unlocking
    console.error("pin lock state write failed", e);
  }
}

/** Current lock state for the UI (retryAfterMs = 0 when open). */
export async function getPinLockState(
  nowMs: number = Date.now()
): Promise<PinLockState & { retryAfterMs: number }> {
  const state = await readLock();
  return {
    ...state,
    retryAfterMs: Math.max(0, state.lockedUntil - nowMs),
  };
}

async function clearLock(): Promise<void> {
  await writeLock({ failedAttempts: 0, lockedUntil: 0 });
}

/* ---------- lifecycle ---------- */

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

export async function hasPin(): Promise<boolean> {
  const record = await getVault<PinRecord | null>(VAULT_KEY_PIN, null);
  return !!record?.pinHash;
}

export async function setPin(pin: string): Promise<Result<void>> {
  if (!isValidPinFormat(pin)) {
    return err({
      code: "validation",
      message: `The PIN must be ${PIN_MIN} to ${PIN_MAX} digits.`,
    });
  }
  const salt = randomSalt();
  const pinHash = await derivePinKey(pin, salt);
  await setVault(VAULT_KEY_PIN, {
    pinHash,
    salt,
    v: 2,
    iterations: PIN_HASH_ITERATIONS,
    createdAt: Date.now(),
  } satisfies PinRecord);
  await clearLock();
  return ok(undefined);
}

/** Verify the PIN against the vault, honoring the gentle lockout.
    Returns false while locked — even for the right PIN; the lock screen
    shows the honest wait time via getPinLockState(). */
export async function verifyPin(pin: string): Promise<boolean> {
  const record = await getVault<PinRecord | null>(VAULT_KEY_PIN, null);
  if (!record?.pinHash) return false;

  const now = Date.now();
  const lock = await readLock();
  if (lock.lockedUntil > now) return false;

  let match: boolean;
  if (record.v === 2) {
    const iterations = record.iterations ?? PIN_HASH_ITERATIONS;
    const candidate = await derivePinKey(pin, record.salt, iterations);
    match = candidate === record.pinHash;
  } else {
    // legacy single-SHA-256 record: verify, then upgrade in place
    const candidate = await hashPin(pin, record.salt);
    match = candidate === record.pinHash;
    if (match) {
      try {
        const pinHash = await derivePinKey(pin, record.salt);
        await setVault(VAULT_KEY_PIN, {
          pinHash,
          salt: record.salt,
          v: 2,
          iterations: PIN_HASH_ITERATIONS,
          createdAt: record.createdAt,
        } satisfies PinRecord);
      } catch (e) {
        console.error("pin record upgrade failed", e);
      }
    }
  }

  if (match) {
    if (lock.failedAttempts > 0 || lock.lockedUntil > 0) await clearLock();
    return true;
  }

  const failedAttempts = lock.failedAttempts + 1;
  if (failedAttempts < PIN_LOCK_THRESHOLD) {
    await writeLock({ ...lock, failedAttempts });
  } else {
    const level = Math.min(
      failedAttempts - PIN_LOCK_THRESHOLD,
      PIN_LOCK_DELAYS_MS.length - 1
    );
    const delay = PIN_LOCK_DELAYS_MS[level];
    await writeLock({
      failedAttempts,
      lockedUntil: now + delay,
    });
  }
  return false;
}

export async function changePin(
  current: string,
  next: string
): Promise<Result<void>> {
  if (!(await verifyPin(current))) {
    return err({ code: "validation", message: "The current PIN is wrong." });
  }
  return setPin(next);
}

export async function removePin(current: string): Promise<Result<void>> {
  if (!(await verifyPin(current))) {
    return err({ code: "validation", message: "The current PIN is wrong." });
  }
  const { deleteVaultKey } = await import("../vault-db");
  await deleteVaultKey(VAULT_KEY_PIN);
  await clearLock();
  return ok(undefined);
}

/** Forgot-PIN destructive reset: erase the main DB, the vault (PIN + auto
    backups + lock state) and any local UI state, then let the caller reload. */
export async function wipeEverything(): Promise<void> {
  try {
    await db.delete();
  } catch (e) {
    console.error("main DB wipe failed", e);
  }
  await wipeVault();
  try {
    localStorage.removeItem(LANG_STORAGE_KEY);
    sessionStorage.clear();
  } catch {
    /* storage may be unavailable — the reload still lands on the gate */
  }
}
