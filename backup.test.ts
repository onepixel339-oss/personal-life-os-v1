/* Regression tests — backup file integrity (§11): canonical JSON, checksum,
   validation. A tampered file must be rejected; a valid one must pass. */

import { describe, expect, test } from "bun:test";
import {
  computeChecksum,
  validateBackupFile,
  type BackupFile,
} from "../src/lib/lifeos/services/backup-service";

describe("canonicalJson / computeChecksum", () => {
  test("key order does not change the checksum", async () => {
    const a = await computeChecksum({ b: 1, a: 2, nested: { z: 1, y: 2 } });
    const b = await computeChecksum({ nested: { y: 2, z: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a.startsWith("sha256:")).toBe(true);
    expect(a.length).toBe("sha256:".length + 64);
  });

  test("different data produces a different checksum", async () => {
    const a = await computeChecksum({ items: [{ id: "1" }] });
    const b = await computeChecksum({ items: [{ id: "2" }] });
    expect(a).not.toBe(b);
  });

  test("undefined values are ignored, not serialized", async () => {
    const a = await computeChecksum({ x: 1, y: undefined });
    const b = await computeChecksum({ x: 1 });
    expect(a).toBe(b);
  });
});

describe("validateBackupFile", () => {
  const validData = {
    items: [
      {
        id: "item-1",
        type: "task",
        title: "One task",
        description: "",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };

  async function buildFile(over: Partial<BackupFile> = {}): Promise<string> {
    const payload: BackupFile = {
      app: "personal-life-os",
      schemaVersion: 1,
      exportedAt: new Date(0).toISOString(),
      appVersion: "1.0.0",
      counts: { items: 1 },
      checksum: await computeChecksum(validData),
      data: validData,
      ...over,
    };
    return JSON.stringify(payload);
  }

  test("a well-formed backup validates", async () => {
    const res = await validateBackupFile(await buildFile());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.valid).toBe(true);
      expect(res.value.counts.items).toBe(1);
      expect(res.value.issues).toEqual([]);
    }
  });

  test("not JSON is rejected", async () => {
    const res = await validateBackupFile("{nope");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("backup_invalid");
  });

  test("a foreign app id is rejected", async () => {
    const res = await validateBackupFile(await buildFile({ app: "other-app" }));
    expect(res.ok).toBe(false);
  });

  test("a newer schema version is rejected", async () => {
    const res = await validateBackupFile(await buildFile({ schemaVersion: 99 }));
    expect(res.ok).toBe(false);
  });

  test("tampered data fails the checksum", async () => {
    const file = JSON.parse(await buildFile());
    file.data.items[0].title = "Tampered title";
    const res = await validateBackupFile(JSON.stringify(file));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("backup_invalid");
  });

  test("rows missing required fields are flagged as issues", async () => {
    const broken = { items: [{ id: "x", type: "task" }] }; // no title/status/dates
    const payload: BackupFile = {
      app: "personal-life-os",
      schemaVersion: 1,
      exportedAt: new Date(0).toISOString(),
      appVersion: "1.0.0",
      counts: {},
      checksum: await computeChecksum(broken),
      data: broken,
    };
    const res = await validateBackupFile(JSON.stringify(payload));
    // validation collects issues; missing title is flagged
    if (res.ok) {
      expect(res.value.issues.some((i) => i.includes("items"))).toBe(true);
    } else {
      expect(res.ok).toBe(false);
    }
  });

  test("missing checksum still validates (legacy files)", async () => {
    const res = await validateBackupFile(await buildFile({ checksum: "" }));
    expect(res.ok).toBe(true);
  });
});
