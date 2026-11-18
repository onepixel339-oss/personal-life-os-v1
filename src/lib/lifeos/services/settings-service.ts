/* SettingsService — typed access to AppSetting rows (services-only DB access). */

import { db, getSetting, setSetting } from "../db";
import { emitChange } from "../events";
import {
  DEFAULT_CALENDAR,
  DEFAULT_PRAYER,
  SETTING_KEYS,
  type CalendarSettings,
  type ViewKind,
} from "../defaults";
import type { PrayerSettings } from "../prayer";
import type { DateFormatKind } from "../dates";

export async function getCalendarSettings(): Promise<CalendarSettings> {
  const firstDay = await getSetting<number>(
    SETTING_KEYS.firstDayOfWeek,
    DEFAULT_CALENDAR.firstDayOfWeek
  );
  const dateFormat = await getSetting<DateFormatKind>(
    SETTING_KEYS.dateFormat,
    DEFAULT_CALENDAR.dateFormat
  );
  const timeFormat24 = await getSetting<boolean>(
    SETTING_KEYS.timeFormat24,
    DEFAULT_CALENDAR.timeFormat24
  );
  return {
    firstDayOfWeek: (firstDay % 7) as CalendarSettings["firstDayOfWeek"],
    dateFormat: (["dmy", "mdy", "ymd"] as const).includes(
      dateFormat as DateFormatKind
    )
      ? (dateFormat as DateFormatKind)
      : "dmy",
    timeFormat24: !!timeFormat24,
  };
}

export async function setCalendarSettings(
  patch: Partial<CalendarSettings>
): Promise<void> {
  const current = await getCalendarSettings();
  const next = { ...current, ...patch };
  await db.transaction(
    "rw",
    db.appSettings,
    async () => {
      await setSetting(SETTING_KEYS.firstDayOfWeek, next.firstDayOfWeek);
      await setSetting(SETTING_KEYS.dateFormat, next.dateFormat);
      await setSetting(SETTING_KEYS.timeFormat24, next.timeFormat24);
    }
  );
}

export async function getPrayerSettings(): Promise<PrayerSettings> {
  return getSetting<PrayerSettings>(SETTING_KEYS.prayer, DEFAULT_PRAYER);
}

export async function setPrayerSettings(
  settings: PrayerSettings
): Promise<void> {
  await setSetting(SETTING_KEYS.prayer, settings);
}

/* ---------- v1.5: the day's beginning + period names (onboarding) ---------- */

export async function setDayStart(
  dayStart: "fajr" | "midnight"
): Promise<void> {
  await setSetting(SETTING_KEYS.dayStart, dayStart);
}

export async function renamePeriodSetting(
  id: string,
  name: string
): Promise<void> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return;
  await db.periodSettings.update(id, { name: clean });
  emitChange(["periodSettings"]);
}

export async function setPeriodEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  await db.periodSettings.update(id, { enabled });
  emitChange(["periodSettings"]);
}

export async function getView(
  key: typeof SETTING_KEYS.todayView | typeof SETTING_KEYS.weeklyView
): Promise<ViewKind> {
  const v = await getSetting<string>(key, "list");
  return v === "timeline" ? "timeline" : "list";
}

export async function setView(
  key: typeof SETTING_KEYS.todayView | typeof SETTING_KEYS.weeklyView,
  view: ViewKind
): Promise<void> {
  await setSetting(key, view);
}

export async function getInboxBadgeEnabled(): Promise<boolean> {
  return getSetting<boolean>(SETTING_KEYS.inboxBadge, true);
}

export async function setInboxBadgeEnabled(enabled: boolean): Promise<void> {
  await setSetting(SETTING_KEYS.inboxBadge, enabled);
}

export async function getFlag(key: string): Promise<boolean> {
  return getSetting<boolean>(key, false);
}

export async function setFlag(key: string, value: boolean): Promise<void> {
  await setSetting(key, value);
}

export async function getRecentSearches(): Promise<string[]> {
  return getSetting<string[]>(SETTING_KEYS.recentSearches, []);
}

export async function addRecentSearch(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  const list = await getRecentSearches();
  const next = [trimmed, ...list.filter((q) => q !== trimmed)].slice(0, 8);
  await setSetting(SETTING_KEYS.recentSearches, next);
}

export async function clearRecentSearches(): Promise<void> {
  await setSetting(SETTING_KEYS.recentSearches, []);
}
