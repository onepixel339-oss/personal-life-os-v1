/* PinService tests (v1.1) — vault-backed optional lock.
   Covers: format validation, set/verify/change/remove, re-salting on
   reset (same PIN -> different hash), and that the PIN never lands in
   the main appSettings table (backup files must stay PIN-free). */

import { describe, expect, test, beforeEach } from "bun:test";
import { db } from "../src/lib/lifeos/db";
import { vaultDb } from "../src/lib/lifeos/vault-db";
import {
  VAULT_KEY_PIN,
  changePin,
  hasPin,
  hashPin,
  isValidPinFormat,
  removePin,
  setPin,
  verifyPin,
} from "../src/lib/lifeos/services/pin-service";

async function clearPinState(): Promise<void> {
  await vaultDb.vault.delete(VAULT_KEY_PIN);
}

describe("pin format", () => {
  test("accepts 4-8 digits", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("12345678")).toBe(true);
  });

  test("rejects short, long, and non-digit input", () => {
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("123456789")).toBe(false);
    expect(isValidPinFormat("12a4")).toBe(false);
    expect(isValidPinFormat("")).toBe(false);
  });
});

describe("pin lifecycle", () => {
  beforeEach(async () => {
    await clearPinState();
  });

  test("no PIN by default", async () => {
    expect(await hasPin()).toBe(false);
    expect(await verifyPin("1234")).toBe(false);
  });

  test("setPin then verify accepts the right PIN only", async () => {
    const res = await setPin("2580");
    expect(res.ok).toBe(true);
    expect(await hasPin()).toBe(true);
    expect(await verifyPin("2580")).toBe(true);
    expect(await verifyPin("2581")).toBe(false);
  });

  test("setPin rejects a bad format", async () => {
    const res = await setPin("12");
    expect(res.ok).toBe(false);
    expect(await hasPin()).toBe(false);
  });

  test("hashing is salted: same PIN, different salts -> different hashes", async () => {
    const a = await hashPin("2580", "salt-one");
    const b = await hashPin("2580", "salt-two");
    expect(a).not.toBe(b);
    expect(a).not.toContain("2580");
  });

  test("resetting the PIN re-salts it", async () => {
    await setPin("2580");
    const before = (await vaultDb.vault.get(VAULT_KEY_PIN))?.value as {
      pinHash: string;
      salt: string;
    };
    await setPin("2580");
    const after = (await vaultDb.vault.get(VAULT_KEY_PIN))?.value as {
      pinHash: string;
      salt: string;
    };
    expect(after.salt).not.toBe(before.salt);
    expect(after.pinHash).not.toBe(before.pinHash);
    expect(await verifyPin("2580")).toBe(true);
  });

  test("changePin requires the correct current PIN", async () => {
    await setPin("2580");
    const bad = await changePin("0000", "9999");
    expect(bad.ok).toBe(false);
    expect(await verifyPin("2580")).toBe(true);

    const good = await changePin("2580", "9999");
    expect(good.ok).toBe(true);
    expect(await verifyPin("9999")).toBe(true);
    expect(await verifyPin("2580")).toBe(false);
  });

  test("removePin requires the correct current PIN and clears the vault", async () => {
    await setPin("2580");
    const bad = await removePin("1111");
    expect(bad.ok).toBe(false);
    expect(await hasPin()).toBe(true);

    const good = await removePin("2580");
    expect(good.ok).toBe(true);
    expect(await hasPin()).toBe(false);
    expect(await verifyPin("2580")).toBe(false);
  });

  test("the PIN never leaks into the main database settings", async () => {
    await setPin("2580");
    const rows = await db.appSettings.toArray();
    const leaked = rows.some((row) =>
      JSON.stringify(row.value ?? "").includes("2580")
    );
    expect(leaked).toBe(false);
  });
});
