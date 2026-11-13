/* Regression tests — the recurrence engine (§8): pure date generation,
   sparse-state merging, and the generateDates memo. Bug 4 regression lives
   here: rule mutations (pause/resume/end) MUST bump `version` so the memo
   key changes — otherwise stale cached dates keep showing. */

import { describe, expect, test } from "bun:test";
import {
  buildRulesById,
  buildStatesByKey,
  createRule,
  editThisAndFuture,
  endRuleBefore,
  expand,
  generateDates,
  ruleRootId,
  type RuleInput,
} from "../src/lib/lifeos/services/recurrence-service";
import type { OccurrenceState, RecurrenceRule } from "../src/lib/lifeos/types";

let seq = 0;

function rule(over: Partial<RecurrenceRule>): RecurrenceRule {
  // unique id per fixture — generateDates memoizes by id|version|window,
  // so shared ids across fixtures would poison the memo between tests
  seq += 1;
  return {
    id: `rule-${seq}`,
    itemId: "item-1",
    routineId: undefined,
    state: "active",
    pattern: "daily",
    interval: 1,
    weekAnchor: 0,
    startDate: "2026-11-01",
    pauseSegments: [],
    createdAt: 0,
    updatedAt: 0,
    version: 1,
    ...over,
  } as RecurrenceRule;
}

describe("generateDates — patterns", () => {
  test("daily every day in the window", () => {
    const dates = generateDates(rule({ pattern: "daily" }), "2026-11-01", "2026-11-07");
    expect(dates).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
  });

  test("daily interval 2 jumps inside and outside the window", () => {
    // rule starts before the window; the jump math must stay aligned:
    // 10-01 + even steps lands on 11-02, 11-04, 11-06 (10-31 is before the window)
    const dates = generateDates(
      rule({ pattern: "daily", interval: 2, startDate: "2026-10-01" }),
      "2026-11-01",
      "2026-11-07"
    );
    expect(dates).toEqual(["2026-11-02", "2026-11-04", "2026-11-06"]);
  });

  test("weekly on the start weekday", () => {
    // 2026-11-01 is a Sunday; weekly -> Sundays
    const dates = generateDates(rule({ pattern: "weekly" }), "2026-11-01", "2026-11-30");
    expect(dates).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
  });

  test("weekdays picks byWeekday inside each anchored week", () => {
    const dates = generateDates(
      rule({ pattern: "weekdays", byWeekday: [1, 3] }), // Monday, Wednesday
      "2026-11-01",
      "2026-11-14"
    );
    expect(dates).toEqual([
      "2026-11-02",
      "2026-11-04",
      "2026-11-09",
      "2026-11-11",
    ]);
  });

  test("monthly on day 31 clamps shorter months", () => {
    const dates = generateDates(
      rule({ pattern: "monthly", byMonthDay: 31, monthDayMode: "day", startDate: "2026-01-31" }),
      "2026-01-01",
      "2026-04-30"
    );
    // Feb clamps to 28, Apr clamps to 30
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  test("monthly monthDayMode=last always lands on the last day", () => {
    const dates = generateDates(
      rule({ pattern: "monthly", monthDayMode: "last", startDate: "2026-01-15" }),
      "2026-01-01",
      "2026-04-30"
    );
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  test("endDate clamps the window", () => {
    const dates = generateDates(
      rule({ pattern: "daily", endDate: "2026-11-03" }),
      "2026-11-01",
      "2026-11-07"
    );
    expect(dates).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  test("disabled rules generate nothing", () => {
    expect(generateDates(rule({ state: "disabled" }), "2026-11-01", "2026-11-07")).toEqual([]);
  });
});

describe("generateDates — pause segments (§8.5)", () => {
  test("closed segment excludes dates inside it, no catch-up", () => {
    const dates = generateDates(
      rule({ pauseSegments: [{ from: "2026-11-03", to: "2026-11-05" }] }),
      "2026-11-01",
      "2026-11-08"
    );
    expect(dates).toEqual(["2026-11-01", "2026-11-02", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });

  test("open segment (no `to`) excludes everything from `from` on", () => {
    const dates = generateDates(
      rule({ pauseSegments: [{ from: "2026-11-04" }] }),
      "2026-11-01",
      "2026-11-08"
    );
    expect(dates).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
});

describe("BUG 4 — memo must not survive rule mutations", () => {
  test("version bump changes the memo key — pause reflects immediately", () => {
    const id = `memo-${Date.now()}`;
    const v1 = rule({ id, pattern: "daily", version: 1 });
    const before = generateDates(v1, "2026-11-01", "2026-11-07");
    expect(before).toHaveLength(7);

    // pauseRule-equivalent mutation: version++ + open pause segment.
    // generateDates memoizes by id|version|from|to — without the version
    // bump, the pause would be invisible until the window changes.
    const v2 = rule({
      id,
      pattern: "daily",
      version: 2,
      state: "paused",
      pauseSegments: [{ from: "2026-11-04" }],
    });
    const after = generateDates(v2, "2026-11-01", "2026-11-07");
    expect(after).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
});

describe("expand — sparse state merging", () => {
  const r = rule({ pattern: "daily" });

  test("cancelled occurrences disappear", () => {
    const states: OccurrenceState[] = [
      {
        id: "s1",
        ruleId: r.id,
        occurrenceKey: `${r.id}:2026-11-02`,
        originalDate: "2026-11-02",
        kind: "cancelled",
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const out = expand(r, "2026-11-01", "2026-11-03", buildStatesByKey(states), buildRulesById([r]));
    expect(out.map((o) => o.date)).toEqual(["2026-11-01", "2026-11-03"]);
  });

  test("overrideDate moves an occurrence", () => {
    const states: OccurrenceState[] = [
      {
        id: "s1",
        ruleId: r.id,
        occurrenceKey: `${r.id}:2026-11-02`,
        originalDate: "2026-11-02",
        kind: "modified",
        overrideDate: "2026-11-03",
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const out = expand(r, "2026-11-01", "2026-11-03", buildStatesByKey(states), buildRulesById([r]));
    const moved = out.find((o) => o.occurrenceKey === `${r.id}:2026-11-02`);
    expect(moved?.date).toBe("2026-11-03");
    expect(moved?.originalDate).toBe("2026-11-02");
  });

  test("completed history survives after the rule is disabled (§8.4)", () => {
    const disabled = rule({ state: "disabled" });
    const states: OccurrenceState[] = [
      {
        id: "s1",
        ruleId: disabled.id,
        occurrenceKey: `${disabled.id}:2026-11-02`,
        originalDate: "2026-11-02",
        kind: "status",
        executionStatus: "completed",
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const out = expand(
      disabled,
      "2026-11-01",
      "2026-11-03",
      buildStatesByKey(states),
      buildRulesById([disabled])
    );
    expect(out).toHaveLength(1);
    expect(out[0].executionStatus).toBe("completed");
    expect(out[0].date).toBe("2026-11-02");
  });
});

describe("ruleRootId — supersedes chain", () => {
  test("walks to the root of a split chain", () => {
    const base = rule({ id: "root" });
    const mid = rule({ id: "mid", supersedesRuleId: "root" });
    const leaf = rule({ id: "leaf", supersedesRuleId: "mid" });
    const byId = buildRulesById([base, mid, leaf]);
    expect(ruleRootId("leaf", byId)).toBe("root");
    expect(ruleRootId("mid", byId)).toBe("root");
    expect(ruleRootId("root", byId)).toBe("root");
  });

  test("cycles in the chain terminate (defensive)", () => {
    const a = rule({ id: "a", supersedesRuleId: "b" });
    const b = rule({ id: "b", supersedesRuleId: "a" });
    const byId = buildRulesById([a, b]);
    expect(["a", "b"]).toContain(ruleRootId("a", byId));
  });
});

/* ---------- service-level (Dexie via fake-indexeddb) ---------- */

describe("rule CRUD validation (service)", () => {
  test("a rule needs an item or a routine", async () => {
    const input: RuleInput = {
      pattern: "daily",
      interval: 1,
      startDate: "2026-11-01",
      weekAnchor: 0,
    };
    const res = await createRule(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("validation");
  });

  test("endRuleBefore sets endDate and bumps version (BUG 4 service level)", async () => {
    const created = await createRule({
      itemId: "item-x",
      pattern: "daily",
      interval: 1,
      startDate: "2026-11-01",
      weekAnchor: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;

    const before = generateDates(created.value, "2026-11-01", "2026-11-30");
    expect(before.length).toBeGreaterThan(20);

    const res = await endRuleBefore(id, "2026-11-10");
    expect(res.ok).toBe(true);

    const { db } = await import("../src/lib/lifeos/db");
    const updated = await db.recurrenceRules.get(id);
    expect(updated?.endDate).toBe("2026-11-09");
    expect((updated?.version ?? 0)).toBe((created.value.version) + 1);

    const after = generateDates(updated!, "2026-11-01", "2026-11-30");
    expect(after[after.length - 1]).toBe("2026-11-09");
  });

  test("editThisAndFuture splits the rule and re-points future states", async () => {
    const created = await createRule({
      itemId: "item-split",
      pattern: "daily",
      interval: 1,
      startDate: "2026-11-01",
      weekAnchor: 0,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const oldId = created.value.id;

    // a future state attached to the old rule
    const { db } = await import("../src/lib/lifeos/db");
    await db.occurrenceStates.add({
      id: "st-future",
      ruleId: oldId,
      occurrenceKey: `${oldId}:2026-11-15`,
      originalDate: "2026-11-15",
      kind: "modified",
      createdAt: 0,
      updatedAt: 0,
    });

    const res = await editThisAndFuture(oldId, "2026-11-10", { interval: 3 });
    expect(res.ok).toBe(true);

    const oldRule = await db.recurrenceRules.get(oldId);
    expect(oldRule?.endDate).toBe("2026-11-09");

    // the app walks supersedesRuleId via in-memory maps — no index exists,
    // so query with .filter() (a .where("supersedesRuleId") would SchemaError)
    const newRules = await db.recurrenceRules
      .filter((r) => r.supersedesRuleId === oldId)
      .toArray();
    expect(newRules).toHaveLength(1);
    const newRule = newRules[0];
    expect(newRule.startDate).toBe("2026-11-10");
    expect(newRule.interval).toBe(3);

    const moved = await db.occurrenceStates.get("st-future");
    expect(moved?.ruleId).toBe(newRule.id);

    // states keep their occurrence key root (stable across splits)
    expect(moved?.occurrenceKey).toBe(`${oldId}:2026-11-15`);
  });
});
