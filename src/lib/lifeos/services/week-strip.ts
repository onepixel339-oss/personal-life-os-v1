/* WeekStripService — a qualitative, no-numbers view of one week for the
   review screen (§3.14 extension, v1.1). Pure functions: the hook gathers
   rows, this builds the shape the UI renders. Density is expressed as
   levels (0/1/2) only — the philosophy is "reflection, never scoring". */

export interface StripEntry {
  date: string; // 'YYYY-MM-DD'
  order: number; // period order (1..n)
  executionStatus: string; // pending | completed | skipped | partial
}

export interface WeekStrip {
  days: string[];
  orders: number[];
  /** `${date}|${order}` -> entry count in that day+period. */
  cells: Map<string, number>;
  /** date -> total entries that day. */
  dayTotals: Map<string, number>;
  /** date -> completed entries. */
  dayDone: Map<string, number>;
  /** date -> still-open entries (pending or partial). */
  dayOpen: Map<string, number>;
  busiestDate: string | null;
  quietestDate: string | null;
  fullestOrder: number | null;
  emptyDays: number;
  allDoneDays: number;
  uniform: boolean;
}

/** Visual density level for a count (never shown as a number). */
export function densityLevel(count: number): 0 | 1 | 2 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  return 2;
}

export function buildWeekStrip(
  days: string[],
  entries: StripEntry[],
  knownOrders: number[] = []
): WeekStrip {
  const cells = new Map<string, number>();
  const dayTotals = new Map<string, number>();
  const dayDone = new Map<string, number>();
  const dayOpen = new Map<string, number>();
  const orderByTotal = new Map<number, number>();
  const orderSet = new Set<number>(knownOrders);

  for (const d of days) {
    dayTotals.set(d, 0);
    dayDone.set(d, 0);
    dayOpen.set(d, 0);
  }

  for (const e of entries) {
    if (!dayTotals.has(e.date)) continue;
    orderSet.add(e.order);
    const key = `${e.date}|${e.order}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
    dayTotals.set(e.date, (dayTotals.get(e.date) ?? 0) + 1);
    orderByTotal.set(e.order, (orderByTotal.get(e.order) ?? 0) + 1);
    if (e.executionStatus === "completed") {
      dayDone.set(e.date, (dayDone.get(e.date) ?? 0) + 1);
    } else if (e.executionStatus !== "skipped") {
      dayOpen.set(e.date, (dayOpen.get(e.date) ?? 0) + 1);
    }
  }

  let busiestDate: string | null = null;
  let quietestDate: string | null = null;
  let maxTotal = 0;
  let minPositive = Infinity;
  for (const d of days) {
    const total = dayTotals.get(d) ?? 0;
    if (total > maxTotal) {
      maxTotal = total;
      busiestDate = d;
    }
    if (total > 0 && total < minPositive) {
      minPositive = total;
      quietestDate = d;
    }
  }

  let fullestOrder: number | null = null;
  let maxOrderTotal = 0;
  const sortedOrders = [...orderSet].sort((a, b) => a - b);
  for (const o of sortedOrders) {
    const total = orderByTotal.get(o) ?? 0;
    if (total > maxOrderTotal) {
      maxOrderTotal = total;
      fullestOrder = o;
    }
  }

  let emptyDays = 0;
  let allDoneDays = 0;
  const totals = new Set<number>();
  for (const d of days) {
    const total = dayTotals.get(d) ?? 0;
    totals.add(total);
    if (total === 0) emptyDays++;
    else if ((dayOpen.get(d) ?? 0) === 0) allDoneDays++;
  }

  return {
    days,
    orders: sortedOrders,
    cells,
    dayTotals,
    dayDone,
    dayOpen,
    busiestDate,
    quietestDate,
    fullestOrder,
    emptyDays,
    allDoneDays,
    uniform: totals.size <= 1,
  };
}
