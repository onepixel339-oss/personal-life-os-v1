/* Test preload (bunfig.toml [test] preload) — runs before every test file.
   Bun's transpiler can evaluate the CJS `dexie` module before an ESM
   side-effect import like "fake-indexeddb/auto", so Dexie's static
   `dependencies` snapshot captures indexedDB: null and every Dexie write
   fails with MissingAPIError. Here we patch the snapshot directly, before
   any test module (and therefore before src/lib/lifeos/db.ts instantiates
   `new LifeOSDB()`). */

import { indexedDB as fakeIndexedDB, IDBKeyRange } from "fake-indexeddb";
import Dexie from "dexie";

const deps = (
  Dexie as unknown as {
    dependencies: {
      indexedDB?: unknown;
      IDBKeyRange?: unknown;
    };
  }
).dependencies;

if (!deps?.indexedDB) {
  deps.indexedDB = fakeIndexedDB;
  deps.IDBKeyRange = IDBKeyRange;
}

/* Also expose the globals for code that reads them directly. */
const g = globalThis as Record<string, unknown>;
if (typeof g.indexedDB === "undefined") g.indexedDB = fakeIndexedDB;
if (typeof g.IDBKeyRange === "undefined") g.IDBKeyRange = IDBKeyRange;

export {};
