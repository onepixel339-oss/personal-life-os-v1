/* Local error log tests (v1.2) — the only telemetry the philosophy allows.
   bun exposes localStorage; if a runtime ever lacks it, a fake is injected. */

import { afterEach, describe, expect, test } from "bun:test";

type Store = Record<string, string>;

function ensureFakeStorage(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.localStorage === "undefined" || g.localStorage === null) {
    const store: Store = {};
    g.localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = String(v);
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    };
  } else {
    (g.localStorage as Storage).clear();
  }
}

async function load() {
  return await import("../src/lib/lifeos/error-log");
}

describe("error log", () => {
  afterEach(async () => {
    const { clearErrorLog } = await load();
    clearErrorLog();
  });

  test("append, read, and clear round-trip", async () => {
    ensureFakeStorage();
    const { logError, readErrorLog, clearErrorLog } = await load();
    expect(readErrorLog()).toEqual([]);
    logError("first failure", "test");
    logError("second failure");
    const list = readErrorLog();
    expect(list.length).toBe(2);
    expect(list[0].message).toBe("second failure"); // newest first
    expect(list[1].message).toBe("first failure");
    expect(list[1].source).toBe("test");
    clearErrorLog();
    expect(readErrorLog()).toEqual([]);
  });

  test("caps at 50 entries, trimming values", async () => {
    ensureFakeStorage();
    const { logError, readErrorLog, ERROR_LOG_MAX } = await load();
    for (let i = 0; i < 60; i++) logError(`e${i}`);
    const list = readErrorLog();
    expect(list.length).toBe(ERROR_LOG_MAX);
    expect(list[0].message).toBe("e59");
    expect(list[list.length - 1].message).toBe("e10");
  });

  test("corrupted JSON reads as empty, never throws", async () => {
    ensureFakeStorage();
    const { logError, readErrorLog } = await load();
    (globalThis.localStorage as Storage).setItem("lifeos.errorlog.v1", "{{{not json");
    expect(readErrorLog()).toEqual([]);
    logError("still works after corruption");
    expect(readErrorLog().length).toBe(1);
  });

  test("formatErrorLogText produces one line per entry, newest first", async () => {
    ensureFakeStorage();
    const { logError, formatErrorLogText, clearErrorLog } = await load();
    clearErrorLog();
    logError("alpha", "src/a.ts:1");
    logError("beta");
    const lines = formatErrorLogText().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("beta");
    expect(lines[1]).toContain("[src/a.ts:1]");
    expect(lines[1]).toContain("alpha");
  });
});
