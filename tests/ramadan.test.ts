/* Ramadan detection tests (v1.2) — offline Hijri calendar via Intl.
   Anchor dates: Ramadan 1447 ≈ 2026-02-18 .. 2026-03-19 (umalqura). */

import { describe, expect, test } from "bun:test";
import { hijriMonthDay, isRamadan, ramadanThird, RAMADAN_PERIODS } from "../src/lib/lifeos/ramadan";

describe("hijriMonthDay", () => {
  test("mid-Ramadan 1447", () => {
    const h = hijriMonthDay(new Date("2026-03-05T12:00:00"));
    expect(h).not.toBe(null);
    expect(h!.month).toBe(9);
  });

  test("a Shawwal date", () => {
    const h = hijriMonthDay(new Date("2026-04-05T12:00:00"));
    expect(h).not.toBe(null);
    expect(h!.month).toBe(10);
  });
});

describe("isRamadan", () => {
  test("true during Ramadan 1447", () => {
    expect(isRamadan(new Date("2026-02-25T12:00:00"))).toBe(true);
    expect(isRamadan(new Date("2026-03-10T12:00:00"))).toBe(true);
  });

  test("false outside", () => {
    expect(isRamadan(new Date("2026-06-10T12:00:00"))).toBe(false);
    expect(isRamadan(new Date("2026-11-18T12:00:00"))).toBe(false);
    expect(isRamadan(new Date("2027-01-15T12:00:00"))).toBe(false);
  });
});

describe("ramadanThird", () => {
  test("first third", () => {
    expect(ramadanThird(new Date("2026-02-20T12:00:00"))).toBe(1);
  });
  test("last third", () => {
    expect(ramadanThird(new Date("2026-03-12T12:00:00"))).toBe(3);
  });
  test("outside Ramadan → 1", () => {
    expect(ramadanThird(new Date("2026-07-01T12:00:00"))).toBe(1);
  });
});

describe("RAMADAN_PERIODS", () => {
  test("five ordered rhythm names with taglines", () => {
    expect(RAMADAN_PERIODS.length).toBe(5);
    expect(RAMADAN_PERIODS.map((p) => p.order)).toEqual([1, 2, 3, 4, 5]);
    for (const p of RAMADAN_PERIODS) {
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.tagline.length).toBeGreaterThan(2);
    }
  });
});
