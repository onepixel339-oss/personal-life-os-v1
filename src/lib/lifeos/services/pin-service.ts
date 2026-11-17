/* PinService — optional device lock (privacy screen, not authentication).
   The PIN lives only in the vault DB as salt + SHA-256 hash; it is never
   written to the main database and never included in any backup file.
   Threat model: casual snooping on a shared device — not a determined
   attacker with devtools access. Forgetting the PIN means a full local
   reset (there is no account to recover through, by design). */

import { db } from "../db";
import { getVault, setVault, wipeVault } from "../vault-db";
import type { Result } from "../types";
import { err, ok } from "../types";
import { LANG_STORAGE_KEY } from "../i18n";

export const VAULT_KEY_PIN = "pin";
export const PIN_MIN = 4;
export const PIN_MAX = 8;

export interface PinRecord {
  pinHash: string;
  salt: string;
  createdAt: number;
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const buffer = new TextEncoder().encode(`lifeos:${salt}:${pin}`);
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
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
  const salt =
    crypto.randomUUID?.().replace(/-/g, "").slice(0, 32) ??
    `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const pinHash = await hashPin(pin, salt);
  await setVault(VAULT_KEY_PIN, {
    pinHash,
    salt,
    createdAt: Date.now(),
  } satisfies PinRecord);
  return ok(undefined);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const record = await getVault<PinRecord | null>(VAULT_KEY_PIN, null);
  if (!record?.pinHash) return false;
  const candidate = await hashPin(pin, record.salt);
  return candidate === record.pinHash;
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
  return ok(undefined);
}

/** Forgot-PIN destructive reset: erase the main DB, the vault (PIN + auto
    backups) and any local UI state, then let the caller reload. */
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
