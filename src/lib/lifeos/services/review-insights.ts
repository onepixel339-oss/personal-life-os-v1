/* Review insights (v1.2) — the review's three questions, answered
   qualitatively from the user's own week: what's new, what changed, and
   where to lean next. Sentences, never scores — reflection, not grading. */

export interface InsightsInput {
  days: string[];
  /** items created in the week */
  createdCount: number;
  /** inbox captures in the week */
  capturedCount: number;
  /** items completed in the week (completedAt in window) */
  completedCount: number;
  /** activityHistory rows inside the week */
  activityThisWeek: number;
  /** activityHistory rows inside the previous week */
  activityPrevWeek: number;
  /** days closed with قفلة اليوم */
  closedDays: number;
  /** days with zero activity (only counted for completed weeks) */
  absentDays: number;
  /** the viewed week has fully ended */
  weekComplete: boolean;
  /** active spaces with their touched-item counts this week */
  spaces: { id: string; name: string; touched: number }[];
}

export interface InsightSentence {
  key: string;
  params?: Record<string, string | number>;
}

/** Arabic-style plural class: 1 = one, 2 = two, 3–10 = many, 11+ = plus.
 *  Powers both the insight sentence variants and the grouped row counts —
 *  "١ حاجات" was wrong grammar wearing a numeral costume. */
export type PluralClass = "one" | "two" | "many" | "plus";

export function pluralClass(n: number): PluralClass {
  if (!Number.isFinite(n)) return "many";
  if (n === 1) return "one";
  if (n === 2) return "two";
  if (n >= 3 && n <= 10) return "many";
  return "plus";
}

export interface GroupedRow {
  itemId: string;
  title: string;
  count: number;
}

/** Collapse per-occurrence rows into one row per item with a count —
 *  a daily habit that surfaced four days is ONE honest sentence
 *  ("قراءة القرآن · ٤ مرات"), not four look-alike rows. */
export function groupRowsByItem(
  rows: { item: { id: string; title: string } }[]
): GroupedRow[] {
  const map = new Map<string, GroupedRow>();
  for (const r of rows) {
    const existing = map.get(r.item.id);
    if (existing) existing.count += 1;
    else map.set(r.item.id, { itemId: r.item.id, title: r.item.title, count: 1 });
  }
  const out = [...map.values()];
  out.sort((a, b) => b.count - a.count || (a.title < b.title ? -1 : 1));
  return out;
}

export type DeltaKind = "quieter" | "busier" | "same" | "none";

/** Qualitative movement vs the previous week (±15% = "the same"). */
export function classifyDelta(
  thisWeek: number,
  prevWeek: number
): DeltaKind {
  if (prevWeek <= 0) return "none";
  const ratio = (thisWeek - prevWeek) / prevWeek;
  if (ratio <= -0.15) return "quieter";
  if (ratio >= 0.15) return "busier";
  return "same";
}

/** Pick the one focus suggestion: the busiest space vs an untouched one. */
export function focusSuggestion(
  spaces: { id: string; name: string; touched: number }[]
): { full: string; quiet: string } | null {
  const active = spaces.filter((s) => s.touched > 0);
  if (active.length === 0) return null;
  const untouched = spaces.filter((s) => s.touched === 0);
  if (untouched.length === 0) return null;
  const busiest = active.reduce((a, b) => (b.touched > a.touched ? b : a));
  // rotate the suggestion between untouched spaces (stable per week shape)
  const quiet = untouched.reduce((a, b) => (b.name < a.name ? b : a));
  return { full: busiest.name, quiet: quiet.name };
}

export function buildWeekInsights(input: InsightsInput): {
  sentences: InsightSentence[];
} {
  const sentences: InsightSentence[] = [];

  // 1) what's new — only the clauses that happened
  if (input.capturedCount > 0) {
    sentences.push({ key: "insights.captured", params: { n: input.capturedCount } });
  }
  if (input.createdCount > 0) {
    sentences.push({ key: "insights.created", params: { n: input.createdCount } });
  }
  if (input.completedCount > 0) {
    sentences.push({ key: "insights.completed", params: { n: input.completedCount } });
  }
  if (sentences.length === 0) {
    sentences.push({ key: "insights.quiet" });
  }

  // 2) what changed — delta vs the previous week
  const delta = classifyDelta(input.activityThisWeek, input.activityPrevWeek);
  if (delta !== "none") {
    sentences.push({ key: `insights.delta.${delta}` });
  }

  // 3) closure — mentioned only in its warm forms, never as a debt
  if (input.closedDays >= 5) {
    sentences.push({ key: "insights.closureMost" });
  } else if (input.closedDays >= 2) {
    sentences.push({ key: "insights.closureSome" });
  }

  // absence — one forgiving sentence, completed weeks only
  if (input.weekComplete && input.absentDays >= 3) {
    sentences.push({ key: "insights.absence", params: { n: input.absentDays } });
  }

  // focus — one suggestion at most
  const focus = focusSuggestion(input.spaces);
  if (focus) {
    sentences.push({ key: "insights.focus", params: focus });
  }

  return { sentences };
}
