/* Regression tests — pure date arithmetic (UTC-safe, DST-immune).
   Run: bun test tests/dates.test.ts */

import { describe, expect, test } from "bun:test";
import {
  addDays,
  addMonths,
  compareDates,
  dateInRange,
  dayOfWeek,
  daysInMonth,
  diffDays,
  isValidDateString,
  isValidTimeString,
  minutesToTime,
  timeToMinutes,
  todayLocal,
  weekDates,
  weekStart,
} from "../src/lib/lifeos/dates";

describe("addDays", () => {
  test("crosses month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28"); // 2026 is not a leap year
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29"); // 2028 is a leap year
  });

  test("crosses year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  test("zero is identity", () => {
    expect(addDays("2026-11-14", 0)).toBe("2026-11-14");
  });

  test("large jumps stay exact (no DST drift, UTC math)", () => {
    expect(addDays("2026-01-01", 365)).toBe("2027-01-01");
    expect(addDays("2026-06-01", 180)).toBe("2026-11-28");
  });
});

describe("addMonths clamps to the last day", () => {
  test("Jan 31 + 1 month -> Feb 28", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
  test("Mar 31 - 1 month -> Feb 28", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
  test("Dec + 2 months crosses the year", () => {
    expect(addMonths("2026-12-15", 2)).toBe("2027-02-15");
  });
});

describe("dayOfWeek / weekStart", () => {
  test("2026-11-14 is a Saturday (6)", () => {
    expect(dayOfWeek("2026-11-14")).toBe(6);
    expect(dayOfWeek("2026-11-08")).toBe(0); // Sunday
  });

  test("week anchored on Saturday contains its Saturday", () => {
    expect(weekStart("2026-11-14", 6)).toBe("2026-11-14");
    // Nov 13 2026 is a Friday -> belongs to the week starting Sat Nov 7
    expect(weekStart("2026-11-13", 6)).toBe("2026-11-07");
  });

  test("week anchored on Sunday (0)", () => {
    // Nov 14 2026 is a Saturday -> its Sunday-anchored week starts Nov 8
    expect(weekStart("2026-11-14", 0)).toBe("2026-11-08");
    // Nov 8 itself is Sunday
    expect(weekStart("2026-11-08", 0)).toBe("2026-11-08");
  });

  test("week anchored on Monday (1)", () => {
    // Nov 14 2026 (Sat) belongs to the Monday-anchored week starting Nov 9
    expect(weekStart("2026-11-14", 1)).toBe("2026-11-09");
  });

  test("weekDates returns 7 consecutive days", () => {
    const days = weekDates("2026-11-08");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-11-08");
    expect(days[6]).toBe("2026-11-14");
    expect(diffDays(days[0], days[6])).toBe(6);
  });
});

describe("compareDates / dateInRange / diffDays", () => {
  test("lexicographic comparison matches chronological", () => {
    expect(compareDates("2026-11-01", "2026-11-02")).toBe(-1);
    expect(compareDates("2026-12-31", "2027-01-01")).toBe(-1);
    expect(compareDates("2026-11-14", "2026-11-14")).toBe(0);
  });

  test("dateInRange is inclusive on both ends", () => {
    expect(dateInRange("2026-11-01", "2026-11-01", "2026-11-30")).toBe(true);
    expect(dateInRange("2026-11-30", "2026-11-01", "2026-11-30")).toBe(true);
    expect(dateInRange("2026-10-31", "2026-11-01", "2026-11-30")).toBe(false);
  });

  test("diffDays is exact across months", () => {
    expect(diffDays("2026-11-01", "2026-12-01")).toBe(30);
    expect(diffDays("2026-01-01", "2026-03-01")).toBe(59); // 2026 not a leap year
  });
});

describe("time helpers", () => {
  test("timeToMinutes parses HH:mm", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  test("minutesToTime round-trips", () => {
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(timeToMinutes("18:45"))).toBe("18:45");
  });

  test("validators", () => {
    expect(isValidDateString("2026-11-14")).toBe(true);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("14-11-2026")).toBe(false);
    expect(isValidTimeString("07:05")).toBe(true);
    expect(isValidTimeString("7:5")).toBe(false);
    expect(isValidTimeString("24:00")).toBe(false);
  });
});

describe("todayLocal", () => {
  test("returns a valid YYYY-MM-DD date", () => {
    expect(isValidDateString(todayLocal())).toBe(true);
  });
});

describe("daysInMonth", () => {
  test("knows leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});
