/* Review insights tests (v1.2) — sentences, never scores. */

import { describe, expect, test } from "bun:test";
import {
  buildWeekInsights,
  classifyDelta,
  focusSuggestion,
  type InsightsInput,
} from "../src/lib/lifeos/services/review-insights";

function base(over: Partial<InsightsInput> = {}): InsightsInput {
  return {
    days: ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"],
    createdCount: 0,
    capturedCount: 0,
    completedCount: 0,
    activityThisWeek: 0,
    activityPrevWeek: 0,
    closedDays: 0,
    absentDays: 0,
    weekComplete: true,
    spaces: [],
    ...over,
  };
}

describe("classifyDelta", () => {
  test("no previous week → none", () => {
    expect(classifyDelta(10, 0)).toBe("none");
  });
  test("roughly equal → same (±15%)", () => {
    expect(classifyDelta(100, 105)).toBe("same");
    expect(classifyDelta(100, 90)).toBe("same");
  });
  test("clear drop → quieter", () => {
    expect(classifyDelta(70, 100)).toBe("quieter");
  });
  test("clear rise → busier", () => {
    expect(classifyDelta(130, 100)).toBe("busier");
  });
});

describe("focusSuggestion", () => {
  test("no touched spaces → null", () => {
    expect(
      focusSuggestion([
        { id: "a", name: "شغل", touched: 0 },
        { id: "b", name: "عيلة", touched: 0 },
      ])
    ).toBe(null);
  });
  test("all spaces touched → null", () => {
    expect(
      focusSuggestion([
        { id: "a", name: "شغل", touched: 3 },
        { id: "b", name: "عيلة", touched: 1 },
      ])
    ).toBe(null);
  });
  test("busiest vs an untouched one (stable pick)", () => {
    const pick = focusSuggestion([
      { id: "a", name: "شغل", touched: 6 },
      { id: "b", name: "عيلة", touched: 0 },
      { id: "c", name: "صحة", touched: 1 },
    ]);
    expect(pick).not.toBe(null);
    expect(pick!.full).toBe("شغل");
    expect(pick!.quiet).toBe("عيلة"); // lexicographically first untouched
  });
});

describe("buildWeekInsights", () => {
  test("empty quiet week → the quiet sentence only", () => {
    const { sentences } = buildWeekInsights(base());
    expect(sentences.length).toBe(1);
    expect(sentences[0].key).toBe("insights.quiet");
  });

  test("activity clauses appear only when they happened", () => {
    const { sentences } = buildWeekInsights(
      base({ capturedCount: 4, completedCount: 2 })
    );
    const keys = sentences.map((s) => s.key);
    expect(keys).toContain("insights.captured");
    expect(keys).toContain("insights.completed");
    expect(keys).not.toContain("insights.created");
    const captured = sentences.find((s) => s.key === "insights.captured")!;
    expect(captured.params?.n).toBe(4);
  });

  test("delta sentence mirrors the classification", () => {
    const { sentences } = buildWeekInsights(
      base({ activityThisWeek: 50, activityPrevWeek: 100 })
    );
    expect(sentences.map((s) => s.key)).toContain("insights.delta.quieter");
  });

  test("closure only in its warm forms — 5+ days", () => {
    const { sentences } = buildWeekInsights(base({ closedDays: 5 }));
    expect(sentences.map((s) => s.key)).toContain("insights.closureMost");
  });

  test("closure 2-4 days", () => {
    const { sentences } = buildWeekInsights(base({ closedDays: 3 }));
    expect(sentences.map((s) => s.key)).toContain("insights.closureSome");
  });

  test("1 closed day is never mentioned (no debt)", () => {
    const { sentences } = buildWeekInsights(base({ closedDays: 1 }));
    expect(sentences.map((s) => s.key)).not.toContain("insights.closureSome");
    expect(sentences.map((s) => s.key)).not.toContain("insights.closureMost");
  });

  test("absence appears for completed weeks only, 3+ days", () => {
    const done = buildWeekInsights(base({ absentDays: 4, weekComplete: true }));
    expect(done.sentences.map((s) => s.key)).toContain("insights.absence");
    const open = buildWeekInsights(base({ absentDays: 4, weekComplete: false }));
    expect(open.sentences.map((s) => s.key)).not.toContain("insights.absence");
    const short = buildWeekInsights(base({ absentDays: 2, weekComplete: true }));
    expect(short.sentences.map((s) => s.key)).not.toContain("insights.absence");
  });

  test("focus sentence carries space names as params", () => {
    const { sentences } = buildWeekInsights(
      base({
        activityThisWeek: 10,
        spaces: [
          { id: "a", name: "شغل", touched: 5 },
          { id: "b", name: "عيلة", touched: 0 },
        ],
      })
    );
    const focus = sentences.find((s) => s.key === "insights.focus");
    expect(focus).toBeDefined();
    expect(focus!.params?.full).toBe("شغل");
    expect(focus!.params?.quiet).toBe("عيلة");
  });

  test("full rich week ordering: new → delta → closure → absence → focus", () => {
    const { sentences } = buildWeekInsights(
      base({
        createdCount: 3,
        capturedCount: 7,
        completedCount: 5,
        activityThisWeek: 30,
        activityPrevWeek: 10,
        closedDays: 6,
        absentDays: 0,
        spaces: [
          { id: "a", name: "شغل", touched: 9 },
          { id: "b", name: "قراية", touched: 0 },
        ],
      })
    );
    expect(sentences.map((s) => s.key)).toEqual([
      "insights.captured",
      "insights.created",
      "insights.completed",
      "insights.delta.busier",
      "insights.closureMost",
      "insights.focus",
    ]);
  });
});
