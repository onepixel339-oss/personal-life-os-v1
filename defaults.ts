/* Default seeded settings & the five default periods (D2, D16, F1). */

import type { PeriodSetting } from "./types";
import { DEFAULT_PRAYER_SETTINGS, type PrayerSettings } from "./prayer";

export const SETTING_KEYS = {
  firstDayOfWeek: "calendar.firstDayOfWeek",
  dateFormat: "calendar.dateFormat",
  timeFormat24: "calendar.timeFormat24",
  todayView: "ui.today.view",
  weeklyView: "ui.weekly.view",
  prayer: "prayer.settings",
  language: "ui.language",
  userName: "user.name",
  registeredAt: "user.registeredAt",
  welcomeDismissed: "onboarding.welcome.dismissed",
  makeItYoursDone: "onboarding.makeItYours.dismissed",
  inboxBadge: "ui.inbox.badge",
  lastBackupAt: "backup.lastExportAt",
  restoreSnapshot: "restore.snapshot",
  backupNudgeDismissed: "backup.nudge.dismissed",
  recentSearches: "search.recent",
} as const;

export type ViewKind = "list" | "timeline";
export type DateFormatKind = "dmy" | "mdy" | "ymd";

export interface CalendarSettings {
  firstDayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday
  dateFormat: DateFormatKind;
  timeFormat24: boolean;
}

export const DEFAULT_CALENDAR: CalendarSettings = {
  firstDayOfWeek: 6, // Saturday — editable in Settings › Calendar
  dateFormat: "dmy",
  timeFormat24: false,
};

export const DEFAULT_PRAYER: PrayerSettings = DEFAULT_PRAYER_SETTINGS;

/** The five seeded periods (isDefault = true). Display names are user-editable labels (D2). */
export function defaultPeriodSettings(): PeriodSetting[] {
  return [
    {
      id: "ps-morning",
      name: "Morning",
      tagline: "A gentle start",
      order: 1,
      enabled: true,
      mode: "fixed",
      startAnchor: { kind: "prayer", prayer: "fajr", offsetMin: 0 },
      endAnchor: { kind: "prayer", prayer: "dhuhr", offsetMin: 0 },
      isDefault: true,
    },
    {
      id: "ps-midday",
      name: "Midday",
      tagline: "Make room",
      order: 2,
      enabled: true,
      mode: "fixed",
      startAnchor: { kind: "prayer", prayer: "dhuhr", offsetMin: 0 },
      endAnchor: { kind: "prayer", prayer: "asr", offsetMin: 0 },
      isDefault: true,
    },
    {
      id: "ps-afternoon",
      name: "Afternoon",
      tagline: "Open space",
      order: 3,
      enabled: true,
      mode: "fixed",
      startAnchor: { kind: "prayer", prayer: "asr", offsetMin: 0 },
      endAnchor: { kind: "prayer", prayer: "maghrib", offsetMin: 0 },
      isDefault: true,
    },
    {
      id: "ps-evening",
      name: "Evening",
      tagline: "Come back to yourself",
      order: 4,
      enabled: true,
      mode: "fixed",
      startAnchor: { kind: "prayer", prayer: "maghrib", offsetMin: 0 },
      endAnchor: { kind: "prayer", prayer: "isha", offsetMin: 0 },
      isDefault: true,
    },
    {
      id: "ps-night",
      name: "Night",
      tagline: "Leave it open",
      order: 5,
      enabled: true,
      mode: "fixed",
      startAnchor: { kind: "prayer", prayer: "isha", offsetMin: 0 },
      endAnchor: {
        kind: "prayer",
        prayer: "fajr",
        offsetMin: 0,
        nextDay: true,
      },
      isDefault: true,
    },
  ];
}

export const PERIOD_EMPTY_COPY: Record<string, string> = {
  Morning: "Open space for whatever the morning brings.",
  Midday: "Room for whatever matters midday.",
  Afternoon: "Open space, nothing waiting.",
  Evening: "Quiet room for the evening.",
  Night: "Leave the night open.",
};

export const DEFAULT_EMPTY_COPY = "Open space for whatever the day brings.";
