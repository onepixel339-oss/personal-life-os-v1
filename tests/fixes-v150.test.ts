/* v1.5.0 fixes & features — the regression locks.
   1. Silent-drop fixes: virtual period ids remap onto the day's snapshot,
      duplicate re-adds honor the chosen period, routine period/time reach
      the day, the runner's first tap completes, entertainment conversion
      keeps identity + undo, inbox archive leaves no ghost row.
   2. The week → day bridge: what the week gave this date shows up, honoring
      P4 (nothing moves by itself).
   3. Recurring routines: rule.routineId finally has a UI — occurrences
      render, complete, and rest when the routine archives.
   4. The day follows the move; one canonical week-start fallback; one
      canonical "which period holds this moment".
   5. Onboarding pieces: the day can flip at midnight, the Friday card
      starts from the first Friday, and the i18n keys exist in both
      dictionaries with the about line saying 1.5.0. */

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "../src/lib/lifeos/db";
import { addDays, todayLocal, weekStart } from "../src/lib/lifeos/dates";
import { lifeDayFor } from "../src/lib/lifeos/day-boundary";
import { DEFAULT_PRAYER } from "../src/lib/lifeos/defaults";
import { ar, en, rt } from "../src/lib/lifeos/i18n";
import { setLangState, getLangState } from "../src/lib/lifeos/lang-state";
import {
  addEntryToDay,
  addEntryToWeek,
  getWeekBridgeItems,
  moveEntryToDay,
} from "../src/lib/lifeos/services/planning-service";
import {
  addRoutineItem,
  addRoutineToToday,
  archiveRoutine,
  createRoutine,
  nextStepStatus,
} from "../src/lib/lifeos/services/routine-service";
import {
  buildRulesById,
  buildStatesByKey,
  createRule,
  expand,
  setOccurrenceExecution,
} from "../src/lib/lifeos/services/recurrence-service";
import { convertToEntertainment } from "../src/lib/lifeos/services/entertainment-service";
import { archiveInboxItem } from "../src/lib/lifeos/services/inbox-service";
import { buildTodayData } from "../src/lib/lifeos/services/today-assembly";
import { shouldShowFridayAlarm } from "../src/lib/lifeos/friday";

async function freshDb(): Promise<void> {
  await db.delete();
  await db.open();
}

function seedItem(id: string, title: string): Promise<unknown> {
  return db.items.add({
    id,
    type: "task",
    title,
    description: "",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  } as never);
}

async function seedPeriods(): Promise<void> {
  await db.periodSettings.bulkAdd([
    { id: "ps-morning", name: "Morning", order: 1, enabled: true },
    { id: "ps-evening", name: "Evening", order: 2, enabled: true },
  ] as never);
}

beforeAll(async () => {
  await freshDb();
});

beforeEach(async () => {
  for (const store of db.tables) await store.clear();
});

/* ---------------- 1: the silent drops are closed ---------------- */

describe("v1.5 A1: period placement lands where the user chose", () => {
  test("a virtual period id is remapped onto the day's real snapshot", async () => {
    await seedPeriods();
    await seedItem("v1", "مهمة أول يوم");
    const res = await addEntryToDay({
      date: todayLocal(),
      kind: "item",
      itemId: "v1",
      periodId: "virtual:ps-morning", // what a fresh day's UI knows
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.periodId).toBeDefined();
    expect(res.value.periodId!.startsWith("virtual:")).toBe(false);
    const periods = await db.dailyPeriods.toArray();
    const target = periods.find((p) => p.id === res.value.periodId);
    expect(target?.settingId).toBe("ps-morning");
  });

  test("a stale period id from another day is dropped, never dangles", async () => {
    await seedPeriods();
    await seedItem("v2", "مهمة");
    const res = await addEntryToDay({
      date: todayLocal(),
      kind: "item",
      itemId: "v2",
      periodId: "a-period-from-yesterday",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.periodId).toBeUndefined();
  });

  test("re-adding with a period HONORS the placement instead of erroring", async () => {
    await seedPeriods();
    await seedItem("v3", "مهمة مكررة");
    const first = await addEntryToDay({
      date: todayLocal(),
      kind: "item",
      itemId: "v3",
      periodSettingId: "ps-morning",
    });
    expect(first.ok).toBe(true);

    const again = await addEntryToDay({
      date: todayLocal(),
      kind: "item",
      itemId: "v3",
      periodSettingId: "ps-evening",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.alreadyPlaced).toBe(true);

    const entries = await db.dailyEntries.toArray();
    expect(entries.length).toBe(1); // one entry, now in the NEW period
    const periods = await db.dailyPeriods.toArray();
    const target = periods.find((p) => p.id === entries[0].periodId);
    expect(target?.settingId).toBe("ps-evening");
  });

  test("re-adding without a period is still a gentle duplicate error", async () => {
    await seedPeriods();
    await seedItem("v4", "مهمة");
    await addEntryToDay({ date: todayLocal(), kind: "item", itemId: "v4" });
    const again = await addEntryToDay({
      date: todayLocal(),
      kind: "item",
      itemId: "v4",
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("duplicate");
    expect(again.error.message).toContain("already on this day");
  });
});

describe("v1.5 A2: routine placement keeps its period + time", () => {
  test("the dialog's period + time reach the day (they used to be dropped)", async () => {
    await seedPeriods();
    const res = await createRoutine({ name: "فاتحة الصباح" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const placed = await addRoutineToToday(res.value.id, todayLocal(), {
      periodSettingId: "ps-morning",
      startTime: "06:30",
    });
    expect(placed.ok).toBe(true);
    const entries = await db.dailyEntries.toArray();
    expect(entries.length).toBe(1);
    expect(entries[0].startTime).toBe("06:30");
    const periods = await db.dailyPeriods.toArray();
    const target = periods.find((p) => p.id === entries[0].periodId);
    expect(target?.settingId).toBe("ps-morning");
  });

  test("the same routine twice on one day is a gentle duplicate", async () => {
    await seedPeriods();
    const res = await createRoutine({ name: "روتين" });
    if (!res.ok) return;
    await addRoutineToToday(res.value.id, todayLocal());
    const again = await addRoutineToToday(res.value.id, todayLocal());
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("duplicate");
    expect(again.error.message).toContain("already on this day");
  });
});

describe("v1.5 A5: the runner's first tap completes", () => {
  test("the gentle step cycle: pending → done → skipped → pending", () => {
    expect(nextStepStatus("pending")).toBe("done");
    expect(nextStepStatus("done")).toBe("skipped");
    expect(nextStepStatus("skipped")).toBe("pending");
  });
});

describe("v1.5 A6: entertainment conversion preserves identity", () => {
  test("same item, new nature — and a working undo", async () => {
    await seedItem("e1", "مسلسل جديد");
    const res = await convertToEntertainment("e1", "series");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const item = await db.items.get("e1");
    expect(item?.type).toBe("entertainment");
    const details = await db.entertainmentDetails.get("e1");
    expect(details?.mediaType).toBe("series");
    expect(details?.progressStatus).toBe("planned");

    if (res.value.undo) await res.value.undo.undo();
    const back = await db.items.get("e1");
    expect(back?.type).toBe("task"); // identity survived the round trip
    expect(await db.entertainmentDetails.get("e1")).toBeUndefined();
  });

  test("review B1: the undo restores the item's STATUS too, exactly", async () => {
    await db.items.add({
      id: "e2",
      type: "task",
      title: "مهمة مكتملة",
      description: "",
      status: "completed",
      completedAt: 123,
      createdAt: 1,
      updatedAt: 1,
    } as never);
    const res = await convertToEntertainment("e2", "movie");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // converting a completed task lands it on the seeded mapping (active)
    expect((await db.items.get("e2"))?.status).toBe("active");

    if (res.value.undo) await res.value.undo.undo();
    const back = await db.items.get("e2");
    expect(back?.type).toBe("task");
    expect(back?.status).toBe("completed"); // NOT silently lost
    expect(back?.completedAt).toBe(123);
  });
});

describe("v1.5 A7: inbox archive leaves no ghost row", () => {
  test("the item archives AND its inbox entry leaves with it — undo restores both", async () => {
    await seedItem("i1", "حاجة من الوارد");
    await db.inboxEntries.add({
      id: "in1",
      itemId: "i1",
      sortOrder: "a",
      createdAt: 1,
    } as never);

    const res = await archiveInboxItem("i1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((await db.items.get("i1"))?.status).toBe("archived");
    expect(await db.inboxEntries.where("itemId").equals("i1").count()).toBe(0);

    if (res.value.undo) await res.value.undo.undo();
    expect((await db.items.get("i1"))?.status).toBe("active");
    expect(await db.inboxEntries.where("itemId").equals("i1").count()).toBe(1);
  });
});

/* ---------------- 2: the week → day bridge ---------------- */

describe("v1.5 B1: the bridge shows what the week gave this date", () => {
  test("a scheduled, open item appears — completed and already-on-day don't", async () => {
    const date = todayLocal();
    const ws = weekStart(date, 6);
    await seedItem("b1", "مهمة الأسبوع");
    await seedItem("b2", "خلصت خلاص");
    await db.items.update("b2", { status: "completed" });
    await seedItem("b3", "على اليوم بالفعل");

    await addEntryToWeek({ weekStartDate: ws, itemId: "b1", scheduledDate: date });
    await addEntryToWeek({ weekStartDate: ws, itemId: "b2", scheduledDate: date });
    await addEntryToWeek({ weekStartDate: ws, itemId: "b3", scheduledDate: date });
    await addEntryToDay({ date, kind: "item", itemId: "b3" });

    const rows = await getWeekBridgeItems(date, 6);
    expect(rows.length).toBe(1);
    expect(rows[0].item.id).toBe("b1");
  });

  test("nothing scheduled for another date — the bridge stays quiet", async () => {
    const date = todayLocal();
    await seedItem("b4", "مش النهارده");
    await addEntryToWeek({
      weekStartDate: weekStart(date, 6),
      itemId: "b4",
      scheduledDate: addDays(date, 1),
    });
    expect(await getWeekBridgeItems(date, 6)).toEqual([]);
  });
});

/* ---------------- 3: recurring routines ---------------- */

describe("v1.5 C: a routine can repeat", () => {
  test("a daily rule materializes the routine on its day, and it completes", async () => {
    const res = await createRoutine({ name: "ورد القرآن" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const routine = res.value;
    await addRoutineItem(routine.id, { title: "صفحة" });

    const ruleRes = await createRule({
      routineId: routine.id,
      pattern: "daily",
      interval: 1,
      startDate: "2026-01-01",
      weekAnchor: 6,
      periodSettingId: "ps-morning",
    });
    expect(ruleRes.ok).toBe(true);
    if (!ruleRes.ok) return;

    const rules = await db.recurrenceRules.toArray();
    const occ = expand(
      rules[0],
      "2026-03-10",
      "2026-03-10",
      buildStatesByKey([]),
      buildRulesById(rules)
    );
    expect(occ.length).toBe(1);
    expect(occ[0].routineId).toBe(routine.id);

    const data = buildTodayData({
      date: "2026-03-10",
      plan: undefined,
      periodRows: [
        {
          id: "virtual:ps-morning",
          settingId: "ps-morning",
          name: "Morning",
          mode: "fixed",
          startTime: "05:00",
          endTime: "12:00",
          order: 1,
        },
      ],
      entries: [],
      items: [],
      routines: [routine],
      rules,
      occStates: [],
    });
    const row = data.allRows.find((r) => r.kind === "occurrence");
    expect(row?.title).toBe("ورد القرآن");
    expect(row?.periodId).toBe("virtual:ps-morning");

    // completing the occurrence is sparse state, remembered on rebuild
    const done = await setOccurrenceExecution(
      rules[0].id,
      occ[0].occurrenceKey,
      occ[0].originalDate,
      "completed"
    );
    expect(done.ok).toBe(true);
    const states = await db.occurrenceStates.toArray();
    const data2 = buildTodayData({
      date: "2026-03-10",
      plan: undefined,
      periodRows: [
        {
          id: "virtual:ps-morning",
          settingId: "ps-morning",
          name: "Morning",
          mode: "fixed",
          startTime: "05:00",
          endTime: "12:00",
          order: 1,
        },
      ],
      entries: [],
      items: [],
      routines: [routine],
      rules,
      occStates: states,
    });
    expect(
      data2.allRows.find((r) => r.kind === "occurrence")?.executionStatus
    ).toBe("completed");
  });

  test("archiving the routine rests its rule — no more quiet occurrences", async () => {
    const res = await createRoutine({ name: "روتين هيرتاح" });
    if (!res.ok) return;
    await createRule({
      routineId: res.value.id,
      pattern: "daily",
      interval: 1,
      startDate: "2026-01-01",
      weekAnchor: 6,
    });
    const archived = await archiveRoutine(res.value.id);
    expect(archived.ok).toBe(true);
    const rules = await db.recurrenceRules.toArray();
    expect(rules[0].state).toBe("disabled");
    const occ = expand(
      rules[0],
      "2026-03-10",
      "2026-03-10",
      buildStatesByKey([]),
      buildRulesById(rules)
    );
    expect(occ.length).toBe(0); // disabled rules generate nothing new
  });
});

/* ---------------- 4: the day follows the move ---------------- */

describe("v1.5 D10: moving an entry to another day keeps its period", () => {
  test("same time of day, new day's snapshot", async () => {
    await seedPeriods();
    await seedItem("m1", "مهمة بتتنقل");
    const today = todayLocal();
    const tomorrow = addDays(today, 1);
    const res = await addEntryToDay({
      date: today,
      kind: "item",
      itemId: "m1",
      periodSettingId: "ps-morning",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const moved = await moveEntryToDay(res.value.id, tomorrow);
    expect(moved.ok).toBe(true);
    const entry = await db.dailyEntries.get(res.value.id);
    expect(entry).toBeDefined();
    if (!entry) return;
    // the entry sits on the new day's morning, not wiped to unplaced
    const tomorrowPlan = await db.dailyPlans
      .where("date")
      .equals(tomorrow)
      .first();
    expect(tomorrowPlan).toBeDefined();
    if (!tomorrowPlan) return;
    expect(entry.dailyPlanId).toBe(tomorrowPlan.id);
    const periods = await db.dailyPeriods
      .where("dailyPlanId")
      .equals(tomorrowPlan.id)
      .toArray();
    const target = periods.find((p) => p.id === entry.periodId);
    expect(target?.settingId).toBe("ps-morning");
  });
});

/* ---------------- 5: onboarding pieces + i18n ---------------- */

describe("v1.5 O1: the day can begin at midnight when asked", () => {
  test("lifeDayFor honors the dayStart pref (fajr default unchanged)", () => {
    const atOneAm = new Date();
    atOneAm.setHours(1, 0, 0, 0);
    const cal = todayLocal(atOneAm.getTime());

    const midnight = lifeDayFor(
      { prayer: DEFAULT_PRAYER, dayStart: "midnight" },
      atOneAm.getTime()
    );
    expect(midnight).toBe(cal); // 1 AM is simply "today"

    const fajr = lifeDayFor(
      { prayer: DEFAULT_PRAYER, dayStart: "fajr" },
      atOneAm.getTime()
    );
    expect(fajr).toBe(addDays(cal, -1)); // before Fajr → still yesterday

    const defaultBehavior = lifeDayFor(
      { prayer: DEFAULT_PRAYER },
      atOneAm.getTime()
    );
    expect(defaultBehavior).toBe(fajr); // no pref set = the Fajr boundary
  });
});

describe("v1.5 O3: the Friday card starts from the first Friday", () => {
  test("friday shows, saturday doesn't, done/dismissed never", () => {
    const friday = "2026-11-13";
    const saturday = "2026-11-14";
    expect(
      shouldShowFridayAlarm({ dismissed: false, done: false, lifeToday: friday })
    ).toBe(true);
    expect(
      shouldShowFridayAlarm({ dismissed: false, done: false, lifeToday: saturday })
    ).toBe(false);
    expect(
      shouldShowFridayAlarm({ dismissed: true, done: false, lifeToday: friday })
    ).toBe(false);
    expect(
      shouldShowFridayAlarm({ dismissed: false, done: true, lifeToday: friday })
    ).toBe(false);
  });
});

describe("v1.5 D15: runtime strings arrive in Arabic", () => {
  test("the repeat-rule validation messages translate", () => {
    const prev = getLangState();
    setLangState("ar");
    try {
      expect(rt("A rule needs an item or a routine.")).toBe(
        "القاعدة محتاجة عنصراً أو روتيناً."
      );
      expect(rt("Pick at least one weekday.")).toBe(
        "اختر يوماً واحداً على الأقل من أيام الأسبوع."
      );
      expect(rt("The interval should be at least 1.")).toBe(
        "الفاصل يجب أن يكون ١ على الأقل."
      );
      expect(
        rt(
          "Entertainment status follows its watching/playing progress. Edit it from its entertainment details."
        )
      ).toContain("حالة الترفيه");
      // v1.5: invalid status transitions, translated through the enum maps
      expect(rt("A task can't be set to archived.")).toBe(
        "لا يمكن جعل مهمة بحالة مؤرشف."
      );
      // review M2: snake_case statuses resolve through the English labels
      expect(rt("A task can't be set to in_progress.")).toBe(
        "لا يمكن جعل مهمة بحالة جارٍ."
      );
      // v1.5: the unified duplicate line
      expect(rt("“ورد القرآن” is already on this day.")).toBe(
        "«ورد القرآن» موجود بالفعل في هذا اليوم."
      );
      // the retired "add another session?" phrasing is gone for good
      expect(rt("“X” is already on this page. Add another session?")).toBe(
        "“X” is already on this page. Add another session?"
      );
    } finally {
      setLangState(prev);
    }
  });
});

describe("v1.5 i18n: the new keys exist in both dictionaries", () => {
  const NEW_KEYS = [
    "today.bridgeTitle",
    "today.bridgeHint",
    "today.bridgeAdd",
    "today.bridgeAddAll",
    "today.bridgeBroughtToast",
    "weekly.routinesTitle",
    "weekly.routinesHint",
    "weekly.routineSteps",
    "routines.repeatTitle",
    "routines.repeatDesc",
    "routines.repeatSavedToast",
    "routines.addRepeatShort",
    "routines.repeatChipHint",
    "routines.repeatNote",
    "routines.firstHint",
    "item.nowEntertainmentToast",
    "spaces.iconLabel",
    "spaces.colorLabel",
    "coach.dismiss",
    "coach.today",
    "coach.weekly",
    "coach.spaces",
    "coach.inbox",
    "coach.routines",
    "onboarding.title",
    "onboarding.step1Title",
    "onboarding.step1Subtitle",
    "onboarding.dayStarts",
    "onboarding.dayStartFajr",
    "onboarding.dayStartMidnight",
    "onboarding.dayStartFajrNote",
    "onboarding.dayStartMidnightNote",
    "onboarding.step2Title",
    "onboarding.step2Subtitle",
    "onboarding.step2Note",
    "onboarding.periodNameAria",
    "onboarding.periodToggleAria",
    "onboarding.step3Title",
    "onboarding.step3Subtitle",
    "onboarding.firstThingPlaceholder",
    "onboarding.captureIt",
    "onboarding.step3Note",
    "onboarding.next",
    "onboarding.back",
    "onboarding.skipAll",
    "onboarding.doneToast",
    "onboarding.doneCapturedToast",
  ];

  test("every new key exists in both dictionaries", () => {
    for (const key of NEW_KEYS) {
      expect(en[key], `missing EN key: ${key}`).toBeDefined();
      expect(ar[key], `missing AR key: ${key}`).toBeDefined();
    }
  });

  test("the bridge toast carries its title placeholder in both languages", () => {
    expect(en["today.bridgeBroughtToast"]).toContain("{title}");
    expect(ar["today.bridgeBroughtToast"]).toContain("{title}");
  });
});
