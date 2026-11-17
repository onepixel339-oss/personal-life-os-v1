/* Regression tests — v1.2.1 first-session fixes, all born from a live
   walkthrough of the real app:
   1. A recurring habit placed in a period must live there EVERY day
      (the rule carries periodSettingId/startTime), not drift "unplaced".
   2. setRulePeriod can set and CLEAR the rule's period (existing rules
      from older versions become fixable in one tap).
   3. Review rows group per item with a count — a daily habit missed four
      days is one honest sentence, not four look-alike rows.
   4. pluralClass drives the Arabic grammar variants ("حاجة واحدة" /
      "حاجتين" / "٥ حاجات" / "١٢ حاجة") so "١ حاجات" can never render.
   5. Every count-bearing insight key ships all four variants in BOTH
      dictionaries, or t() would fall back to the raw key. */

import { describe, expect, test } from "bun:test";
import {
  buildRulesById,
  buildStatesByKey,
  createRule,
  expand,
  setRulePeriod,
} from "../src/lib/lifeos/services/recurrence-service";
import {
  groupRowsByItem,
  pluralClass,
} from "../src/lib/lifeos/services/review-insights";
import { ar, en } from "../src/lib/lifeos/i18n";

/* ---------- 1 + 2: the rule is the habit's home ---------- */

describe("a repeat with a period lives in its period (every single day)", () => {
  test("createRule stores periodSettingId and startTime; expand carries them to every occurrence", async () => {
    const created = await createRule({
      itemId: "item-home",
      pattern: "daily",
      interval: 1,
      startDate: "2026-11-01",
      startTime: "05:30",
      periodSettingId: "ps-morning",
      weekAnchor: 6,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const days = expand(
      created.value,
      "2026-11-01",
      "2026-11-05",
      buildStatesByKey([]),
      buildRulesById([created.value])
    );
    expect(days.length).toBe(5);
    for (const occ of days) {
      expect(occ.periodSettingId).toBe("ps-morning");
      expect(occ.startTime).toBe("05:30");
    }
    // exactly ONE occurrence per day — no duplicate row possible
    const keys = new Set(days.map((o) => o.date));
    expect(keys.size).toBe(5);
  });

  test("setRulePeriod sets, bumps version, and can clear back to unplaced", async () => {
    const created = await createRule({
      itemId: "item-rehome",
      pattern: "daily",
      interval: 1,
      startDate: "2026-11-01",
      weekAnchor: 6,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;
    const v0 = created.value.version;

    const set = await setRulePeriod(id, "ps-evening");
    expect(set.ok).toBe(true);

    const { db } = await import("../src/lib/lifeos/db");
    let stored = await db.recurrenceRules.get(id);
    expect(stored?.periodSettingId).toBe("ps-evening");
    expect(stored?.version).toBe(v0 + 1);

    // occurrences follow the new home immediately
    const occ = expand(
      stored!,
      "2026-11-02",
      "2026-11-02",
      buildStatesByKey([]),
      buildRulesById([stored!])
    );
    expect(occ[0]?.periodSettingId).toBe("ps-evening");

    const cleared = await setRulePeriod(id, undefined);
    expect(cleared.ok).toBe(true);
    stored = await db.recurrenceRules.get(id);
    expect(stored?.periodSettingId).toBeUndefined();
    expect(stored?.version).toBe(v0 + 2);
  });

  test("setRulePeriod on a missing rule is a clean not_found", async () => {
    const res = await setRulePeriod("no-such-rule", "ps-morning");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_found");
  });
});

/* ---------- 3 + 4: the review groups honestly ---------- */

describe("groupRowsByItem — one sentence per habit", () => {
  const item = (id: string, title: string) => ({ item: { id, title } });

  test("four missed days of one habit collapse into one row with count 4", () => {
    const rows = [
      item("a", "قراءة قرآن ١٠ دقايق"),
      item("a", "قراءة قرآن ١٠ دقايق"),
      item("a", "قراءة قرآن ١٠ دقايق"),
      item("a", "قراءة قرآن ١٠ دقايق"),
    ];
    const grouped = groupRowsByItem(rows);
    expect(grouped.length).toBe(1);
    expect(grouped[0]?.count).toBe(4);
    expect(grouped[0]?.title).toBe("قراءة قرآن ١٠ دقايق");
  });

  test("distinct items stay distinct, sorted by how often they surfaced", () => {
    const grouped = groupRowsByItem([
      item("a", "عادة أولى"),
      item("b", "حاجة تانية"),
      item("a", "عادة أولى"),
      item("a", "عادة أولى"),
    ]);
    expect(grouped.map((g) => g.itemId)).toEqual(["a", "b"]);
    expect(grouped[0]?.count).toBe(3);
    expect(grouped[1]?.count).toBe(1);
  });

  test("empty stays empty", () => {
    expect(groupRowsByItem([])).toEqual([]);
  });
});

describe("pluralClass — Arabic plural boundaries", () => {
  test("1 = one, 2 = two, 3..10 = many, 11+ = plus", () => {
    expect(pluralClass(1)).toBe("one");
    expect(pluralClass(2)).toBe("two");
    expect(pluralClass(3)).toBe("many");
    expect(pluralClass(10)).toBe("many");
    expect(pluralClass(11)).toBe("plus");
    expect(pluralClass(120)).toBe("plus");
  });
});

/* ---------- 5: the dictionaries carry every variant ---------- */

describe("count-sentence variants exist in BOTH dictionaries", () => {
  const bases = [
    "insights.captured",
    "insights.created",
    "insights.completed",
    "insights.absence",
    "review.timesThisWeek",
  ];
  const variants = ["one", "two", "many", "plus"] as const;

  test("every base ships all four variants in en and ar", () => {
    const missing: string[] = [];
    for (const base of bases) {
      for (const v of variants) {
        const key = `${base}.${v}`;
        if (!(key in en)) missing.push(`en:${key}`);
        if (!(key in ar)) missing.push(`ar:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("numeric variants keep their {n} placeholder", () => {
    for (const base of bases) {
      for (const suffix of ["many", "plus"]) {
        const key = `${base}.${suffix}`;
        expect(en[key]).toContain("{n}");
        expect(ar[key]).toContain("{n}");
      }
    }
  });
});
