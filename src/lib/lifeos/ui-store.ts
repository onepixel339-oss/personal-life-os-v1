/* UI navigation store (client-side SPA routing; the app renders at '/'). */

import { create } from "zustand";
import { todayLocal, weekStart } from "./dates";
import type { DateFormatKind } from "./dates";

export type Route =
  | { name: "today" }
  | { name: "weekly" }
  | { name: "spaces" }
  | { name: "space"; spaceId: string }
  | { name: "inbox" }
  | { name: "more" }
  | { name: "notes" }
  | { name: "note"; itemId: string }
  | { name: "entertainment" }
  | { name: "review" }
  | { name: "routines" }
  | { name: "settings"; section?: SettingsSection }
  | { name: "archived" };

export type SettingsSection =
  | "account"
  | "appearance"
  | "calendar"
  | "periods"
  | "prayer"
  | "reminders"
  | "privacy"
  | "data"
  | "about";

export type QuickAddContext =
  | { source: "today"; date: string; periodSettingId?: string }
  | { source: "weekly"; weekStart: string; day?: string }
  | { source: "space"; spaceId: string }
  | { source: "inbox" }
  | { source: "notes" }
  | { source: "entertainment" }
  | { source: "global" };

interface UIState {
  route: Route;
  todayDate: string;
  /** v1.2 — the Fajr-relative "life day" (today until Fajr = yesterday) */
  lifeToday: string;
  weekStartDate: string;
  reviewWeekStart: string;
  itemSheetItemId: string | null;
  quickAddOpen: boolean;
  quickAddContext: QuickAddContext;
  searchOpen: boolean;
  themeFlash: boolean;
  navigate: (route: Route) => void;
  goToday: () => void;
  setTodayDate: (date: string) => void;
  syncLifeDay: (lifeDay: string) => void;
  setWeekStartDate: (date: string) => void;
  setReviewWeek: (date: string) => void;
  openItem: (itemId: string) => void;
  closeItem: () => void;
  openQuickAdd: (context?: QuickAddContext) => void;
  closeQuickAdd: () => void;
  openSearch: () => void;
  closeSearch: () => void;
}

function defaultWeekStart(): string {
  // Saturday default aligns with the seeded setting; corrected at render by settings
  return weekStart(todayLocal(), 6);
}

export const useUIStore = create<UIState>((set, get) => ({
  route: { name: "today" },
  todayDate: todayLocal(),
  lifeToday: todayLocal(),
  weekStartDate: defaultWeekStart(),
  reviewWeekStart: defaultWeekStart(),
  itemSheetItemId: null,
  quickAddOpen: false,
  quickAddContext: { source: "global" },
  searchOpen: false,
  themeFlash: false,
  navigate: (route) => set({ route }),
  goToday: () =>
    set({
      route: { name: "today" },
      todayDate: get().lifeToday,
      weekStartDate: defaultWeekStart(),
    }),
  setTodayDate: (date) => set({ todayDate: date }),
  /** Boot/minute sync: the life day flips at Fajr, not at midnight. Only
      pulls the user along if they haven't navigated to another day. */
  syncLifeDay: (lifeDay) =>
    set((s) => ({
      lifeToday: lifeDay,
      todayDate: s.todayDate === todayLocal() ? lifeDay : s.todayDate,
    })),
  setWeekStartDate: (date) => set({ weekStartDate: date }),
  setReviewWeek: (date) => set({ reviewWeekStart: date, route: { name: "review" } }),
  openItem: (itemId) => set({ itemSheetItemId: itemId }),
  closeItem: () => set({ itemSheetItemId: null }),
  openQuickAdd: (context) =>
    set({ quickAddOpen: true, quickAddContext: context ?? { source: "global" } }),
  closeQuickAdd: () => set({ quickAddOpen: false }),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
}));

export type { DateFormatKind };
