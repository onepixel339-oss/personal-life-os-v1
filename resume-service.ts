/* ResumeService — Smart Resume suggestions (§10.2, D11).
   Eligible sources ONLY: due return notes, kept markers, upcoming dated
   items (3-day window), postponed items whose date arrived.
   Never suggests merely-incomplete things. Never modifies the source. */

import { db } from "../db";
import { emitChange } from "../events";
import { uid } from "../ids";
import type {
  DailyEntry,
  Item,
  ItemSpaceLink,
  ProjectDetails,
  ResumeMarker,
  ResumeSuggestionState,
  ReturnNoteSettings,
  Result,
  Space,
  WeeklyEntry,
} from "../types";
import { err, ok } from "../types";
import { addDays, todayLocal } from "../dates";

export type ResumeTrigger =
  | { kind: "app_open" }
  | { kind: "space_open"; spaceId: string }
  | { kind: "project_open"; itemId: string };

export interface ResumeSuggestion {
  kind: "return_note" | "kept" | "dated" | "postponed";
  title: string;
  message: string;
  sourceKind: "return_note" | "marker" | "dated_item";
  sourceId: string;
  presentationKey: string;
  openItemId: string; // item to open (note item or the item itself)
  openNote?: boolean;
}

export interface ResumeInput {
  today: string;
  now: number;
  trigger: ResumeTrigger;
  returnNotes: { settings: ReturnNoteSettings; item: Item }[];
  markers: ResumeMarker[];
  itemsById: Map<string, Item>;
  spacesById: Map<string, Space>;
  dailyPlacements: { itemId: string; date: string }[];
  weeklyPlacements: { itemId: string; scheduledDate?: string }[];
  projectTargetDates: { itemId: string; targetDate?: string }[];
  todayItemIds: Set<string>;
  states: ResumeSuggestionState[];
}

function startOfTomorrow(today: string): number {
  const next = addDays(today, 1);
  const [ny, nm, nd] = next.split("-").map(Number);
  return Date.UTC(ny, nm - 1, nd, 0, 0, 0);
}

function repeatMatches(
  repeat: ReturnNoteSettings["repeat"],
  targetDate: string,
  today: string
): boolean {
  if (today < targetDate) return false;
  if (repeat === "none" || repeat === "daily") return true;
  const [ty, tm, td] = targetDate.split("-").map(Number);
  const [ny, nm, nd] = today.split("-").map(Number);
  if (repeat === "weekly") {
    return dayDiff(today, targetDate) % 7 === 0;
  }
  if (repeat === "monthly") {
    const monthsDiff = (ny - ty) * 12 + (nm - tm);
    if (monthsDiff <= 0) return today === targetDate;
    const lastDayOfTargetMonth = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return nd === Math.min(td, lastDayOfTargetMonth) || (td > lastDayOfTargetMonth && nd === lastDayOfTargetMonth);
  }
  if (repeat === "yearly") {
    const lastDayFeb = (y: number) => new Date(Date.UTC(y, 2, 0)).getUTCDate();
    if (tm === 2 && td === 29 && ny !== ty) return nm === 2 && nd === lastDayFeb(ny);
    return tm === nm && td === nd && ny > ty;
  }
  return true;
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000
  );
}

export function computeSuggestions(input: ResumeInput): ResumeSuggestion[] {
  const out: ResumeSuggestion[] = [];
  const hidden = new Set<string>();
  const laterHidden = new Set<string>();
  for (const s of input.states) {
    if (s.presentationKey === "x") continue;
    if (s.state === "dismissed") hidden.add(s.presentationKey);
    if (s.state === "later" && (s.until ?? 0) > input.now)
      laterHidden.add(s.presentationKey);
  }
  const isHidden = (key: string) => hidden.has(key) || laterHidden.has(key);

  // 1. Due return notes
  for (const { settings, item } of input.returnNotes) {
    if (!settings.enabled) continue;
    const key = `returnNote:${settings.noteItemId}:${input.today}`;
    if (isHidden(key)) continue;
    let eligible = false;
    let message = "A note you wanted to come back to.";
    if (settings.trigger === "app_open" && input.trigger.kind === "app_open") {
      eligible = true;
    } else if (
      settings.trigger === "space_open" &&
      input.trigger.kind === "space_open" &&
      settings.targetId === input.trigger.spaceId
    ) {
      const space = input.spacesById.get(settings.targetId ?? "");
      if (space && !space.archivedAt) eligible = true;
    } else if (
      settings.trigger === "project_open" &&
      input.trigger.kind === "project_open" &&
      settings.targetId === input.trigger.itemId
    ) {
      eligible = true;
    } else if (settings.trigger === "date" && settings.targetDate) {
      eligible = repeatMatches(settings.repeat, settings.targetDate, input.today);
    }
    if (!eligible) continue;
    out.push({
      kind: "return_note",
      title: item.title,
      message,
      sourceKind: "return_note",
      sourceId: settings.noteItemId,
      presentationKey: key,
      openItemId: settings.noteItemId,
      openNote: true,
    });
  }

  // 2. Kept markers ("Keep for later")
  for (const marker of input.markers) {
    if (marker.reason !== "kept") continue;
    const item = input.itemsById.get(marker.itemId);
    if (!item || item.archivedAt || item.status === "archived") continue;
    const key = `marker:${marker.id}:${input.today}`;
    if (isHidden(key)) continue;
    out.push({
      kind: "kept",
      title: item.title,
      message: "You kept this for later attention.",
      sourceKind: "marker",
      sourceId: marker.id,
      presentationKey: key,
      openItemId: marker.itemId,
    });
  }

  // 3. Upcoming dated items (3-day window), not already visible today
  const windowEnd = addDays(input.today, 3);
  const seen = new Set<string>();
  const addDated = (itemId: string, date: string, label: string) => {
    if (input.todayItemIds.has(itemId)) return;
    if (date <= input.today || date > windowEnd) return;
    const item = input.itemsById.get(itemId);
    if (!item || item.archivedAt || item.status === "archived") return;
    const dedupe = `${itemId}:${date}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    const key = `dated:${itemId}:${date}`;
    if (isHidden(key)) return;
    out.push({
      kind: "dated",
      title: item.title,
      message: `Coming up: ${label}.`,
      sourceKind: "dated_item",
      sourceId: itemId,
      presentationKey: key,
      openItemId: itemId,
    });
  };
  for (const p of input.dailyPlacements) {
    if (p.itemId) addDated(p.itemId, p.date, p.date);
  }
  for (const p of input.weeklyPlacements) {
    if (p.itemId && p.scheduledDate) addDated(p.itemId, p.scheduledDate, p.scheduledDate);
  }
  for (const p of input.projectTargetDates) {
    if (p.targetDate) addDated(p.itemId, p.targetDate, p.targetDate);
  }

  // 4. Postponed items whose resumeOn arrived
  for (const marker of input.markers) {
    if (marker.reason !== "postponed") continue;
    if (!marker.resumeOn || marker.resumeOn > input.today) continue;
    const item = input.itemsById.get(marker.itemId);
    if (!item || item.archivedAt || item.status === "archived") continue;
    const key = `marker:${marker.id}:${input.today}`;
    if (isHidden(key)) continue;
    out.push({
      kind: "postponed",
      title: item.title,
      message: "You postponed this until today.",
      sourceKind: "marker",
      sourceId: marker.id,
      presentationKey: key,
      openItemId: marker.itemId,
    });
  }

  return out;
}

export async function laterSuggestion(
  sourceKind: ResumeSuggestionState["sourceKind"],
  sourceId: string,
  presentationKey: string
): Promise<Result<void>> {
  try {
    await db.transaction("rw", db.resumeSuggestionStates, async () => {
      await db.resumeSuggestionStates
        .where("presentationKey")
        .equals(presentationKey)
        .delete();
      await db.resumeSuggestionStates.add({
        id: uid(),
        sourceKind,
        sourceId,
        presentationKey,
        state: "later",
        until: startOfTomorrow(todayLocal()),
        createdAt: Date.now(),
      });
    });
    emitChange(["resumeSuggestionStates"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that." });
  }
}

export async function dismissSuggestion(
  sourceKind: ResumeSuggestionState["sourceKind"],
  sourceId: string,
  presentationKey: string
): Promise<Result<void>> {
  try {
    await db.transaction("rw", db.resumeSuggestionStates, async () => {
      await db.resumeSuggestionStates
        .where("presentationKey")
        .equals(presentationKey)
        .delete();
      await db.resumeSuggestionStates.add({
        id: uid(),
        sourceKind,
        sourceId,
        presentationKey,
        state: "dismissed",
        createdAt: Date.now(),
      });
    });
    emitChange(["resumeSuggestionStates"]);
    return ok(undefined);
  } catch (e) {
    console.error(e);
    return err({ code: "write_failed", message: "Couldn't save that." });
  }
}

/* ---------- helpers used by the Today hook to gather inputs ---------- */

export async function gatherResumeInput(
  trigger: ResumeTrigger
): Promise<Omit<ResumeInput, "today" | "now" | "trigger">> {
  const [
    markers,
    items,
    spaces,
    dailyEntries,
    weeklyEntries,
    projectRows,
    states,
    settingsRows,
  ] = await Promise.all([
    db.resumeMarkers.toArray(),
    db.items.toArray(),
    db.spaces.toArray(),
    db.dailyEntries.toArray(),
    db.weeklyEntries.toArray(),
    db.projectDetails.toArray(),
    db.resumeSuggestionStates.toArray(),
    db.returnNoteSettings.toArray(),
  ]);
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const notes = settingsRows
    .map((settings) => ({ settings, item: itemsById.get(settings.noteItemId) }))
    .filter(
      (n): n is { settings: ReturnNoteSettings; item: Item } =>
        !!n.item && n.item.status !== "archived"
    );
  const dailyPlans = await db.dailyPlans.toArray();
  const dateByPlan = new Map(dailyPlans.map((p) => [p.id, p.date]));
  const today = todayLocal();
  const todayItemIds = new Set(
    dailyEntries
      .filter((e) => dateByPlan.get(e.dailyPlanId) === today && e.itemId)
      .map((e) => e.itemId as string)
  );
  const weeklyPlans = await db.weeklyPlans.toArray();
  const rangeByPlan = new Map(weeklyPlans.map((p) => [p.id, p]));
  return {
    returnNotes: notes,
    markers,
    itemsById,
    spacesById: new Map(spaces.map((s) => [s.id, s])),
    dailyPlacements: dailyEntries.flatMap((e: DailyEntry) =>
      e.itemId
        ? [{ itemId: e.itemId, date: dateByPlan.get(e.dailyPlanId) ?? "" }]
        : []
    ),
    weeklyPlacements: weeklyEntries.flatMap((e: WeeklyEntry) => {
      const plan = rangeByPlan.get(e.weeklyPlanId);
      if (!plan) return [];
      return [{ itemId: e.itemId, scheduledDate: e.scheduledDate }];
    }),
    projectTargetDates: projectRows.flatMap((p: ProjectDetails) =>
      p.targetDate ? [{ itemId: p.itemId, targetDate: p.targetDate }] : []
    ),
    todayItemIds,
    states,
  };
}

export type { ItemSpaceLink };
