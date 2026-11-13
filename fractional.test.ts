/* Regression tests — fractional ordering keys (§6.1):
   every generated key must order strictly between its neighbors,
   never end with "0", and stay unique across pathological sequences. */

import { describe, expect, test } from "bun:test";
import { keyAfter, keyBetween, midpoint, successor } from "../src/lib/lifeos/fractional";

describe("successor", () => {
  test("after nothing comes 1", () => {
    expect(successor("")).toBe("1");
  });
  test("increments the last digit", () => {
    expect(successor("1")).toBe("2");
    expect(successor("a")).toBe("b");
  });
  test("wraps z by appending", () => {
    expect(successor("z")).toBe("z1");
    expect(successor("1z")).toBe("1z1");
  });
  test("never produces a trailing 0", () => {
    for (const k of ["1", "2", "a", "z", "11", "zz", "1z"]) {
      expect(successor(k).endsWith("0")).toBe(false);
    }
  });
});

describe("midpoint / keyBetween", () => {
  test("midpoint lands strictly between", () => {
    const a = midpoint("1", "2");
    expect(a > "1").toBe(true);
    expect(a < "2").toBe(true);
    const b = midpoint("", "1");
    expect(b > "").toBe(true);
    expect(b < "1").toBe(true);
  });

  test("keyBetween(null, null) = first key", () => {
    expect(keyBetween(null, null)).toBe("1");
  });

  test("keyBetween(a, null) > a", () => {
    expect(keyBetween("2", null) > "2").toBe(true);
  });

  test("keyBetween(null, b) < b", () => {
    const k = keyBetween(null, "2");
    expect(k < "2").toBe(true);
    expect(k > "").toBe(true);
  });

  test("adjacent keys still produce a strict between-key", () => {
    const between = keyBetween("1", "2");
    expect(between > "1" && between < "2").toBe(true);
    const tighter = keyBetween("1", between);
    expect(tighter > "1" && tighter < between).toBe(true);
  });

  test("keyBetween throws on inverted bounds (guards caller bugs)", () => {
    expect(() => keyBetween("5", "4")).toThrow();
    expect(() => keyBetween("4", "4")).toThrow();
  });
});

describe("keyAfter", () => {
  test("empty list gets the first key", () => {
    expect(keyAfter([])).toBe("1");
  });

  test("appends strictly after the maximum", () => {
    expect(keyAfter(["1"])).toBe("2");
    expect(keyAfter(["1", "3"])).toBe("4");
    // "z" is the largest single-char key after "" — successor appends
    expect(keyAfter(["z"])).toBe("z1");
  });

  test("insertion sequences never collide (uniqueness stress)", () => {
    const seen = new Set<string>();
    const keys: string[] = [];
    keys.push(keyAfter(keys));
    seen.add(keys[0]);
    // repeatedly insert at the front (smallest) and the back (largest)
    for (let i = 0; i < 200; i++) {
      const front = keyBetween(null, keys[0]);
      expect(seen.has(front)).toBe(false);
      seen.add(front);
      keys.unshift(front);
      const back = keyAfter(keys);
      expect(seen.has(back)).toBe(false);
      seen.add(back);
      keys.push(back);
    }
    // the full list must be strictly increasing
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
    // no key ends with "0" (canonical form)
    for (const k of keys) expect(k.endsWith("0")).toBe(false);
  });
});
