/* Vault — a tiny second Dexie database for things that must survive a
   full restore/wipe of the main DB and must never leak into backup files:
   the optional PIN lock and the on-device auto-backup snapshots.
   Keep this file small and dependency-free (db.ts never imports it). */

import Dexie, { type Table } from "dexie";

export interface VaultRow {
  key: string;
  value: unknown;
  updatedAt: number;
}

class VaultDB extends Dexie {
  vault!: Table<VaultRow, string>;

  constructor() {
    super("lifeos-vault");
    this.version(1).stores({
      vault: "key",
    });
  }
}

export const vaultDb = new VaultDB();

export async function getVault<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await vaultDb.vault.get(key);
    return row === undefined ? fallback : (row.value as T);
  } catch (e) {
    console.error("vault read failed", key, e);
    return fallback;
  }
}

export async function setVault(key: string, value: unknown): Promise<void> {
  await vaultDb.vault.put({ key, value, updatedAt: Date.now() });
}

export async function deleteVaultKey(key: string): Promise<void> {
  await vaultDb.vault.delete(key);
}

/** Nuke the whole vault (forgot-PIN destructive reset). Never throws. */
export async function wipeVault(): Promise<void> {
  try {
    await vaultDb.delete();
  } catch (e) {
    console.error("vault wipe failed", e);
  }
}
