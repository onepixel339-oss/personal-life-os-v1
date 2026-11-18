/* App shell — three-region desktop, bottom nav + floating add on mobile (§13.6, §17). */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Inbox,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Sun,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useInboxCount, useLifeToday, useSpaces, useTodayData, useUserName, useViewPrefs } from "@/lib/lifeos/hooks";
import { useT, initI18n, rt, t, periodName } from "@/lib/lifeos/i18n";
import { toArabicDigits } from "@/lib/lifeos/lang-state";
import { nowMinutes, formatTime, weekStart, minutesToTime } from "@/lib/lifeos/dates";
import { ensureSearchStarted } from "@/lib/lifeos/services/search-service";
import { proposePeriodSettingId } from "@/lib/lifeos/services/planning-service";
import { handleUndoShortcut } from "@/lib/lifeos/services/history-service";
import { SETTING_KEYS, DEFAULT_PRAYER, DEFAULT_FIRST_DAY } from "@/lib/lifeos/defaults";
import { db, getSetting, setSetting, pruneActivityHistory } from "@/lib/lifeos/db";
import type { PrayerSettings } from "@/lib/lifeos/prayer";
import { lifeDayFor } from "@/lib/lifeos/day-boundary";
import { initErrorLogging } from "@/lib/lifeos/error-log";
import { isRamadan } from "@/lib/lifeos/ramadan";
import {
  maybeRevertRamadan,
  ramadanBackupExists,
  ramadanPromptRecentlyShown,
} from "@/lib/lifeos/services/ramadan-service";
import { hasPin } from "@/lib/lifeos/services/pin-service";
import { hasAnyClosure, closedInLast7Days } from "@/lib/lifeos/services/day-closure";
import { shouldWeeklyNudge } from "@/lib/lifeos/services/backup-service";
import { initInstallPromptListener, isStandalone } from "@/lib/lifeos/install-prompt";
import { TodayScreen } from "./today/today-screen";
import { WeeklyScreen } from "./weekly/weekly-screen";
import { SpacesScreen, SpaceScreen } from "./spaces/spaces-screen";
import { InboxScreen } from "./inbox/inbox-screen";
import { MoreScreen } from "./more/more-screen";
import { NotesScreen, NoteEditorScreen } from "./notes/notes-screen";
import { EntertainmentScreen } from "./entertainment/entertainment-screen";
import { ReviewScreen } from "./review/review-screen";
import { RoutinesScreen } from "./routines/routines-screen";
import { SettingsScreen } from "./settings/settings-screen";
import { ArchivedScreen } from "./archived/archived-screen";
import { SearchDialog } from "./search/search-dialog";
import { QuickAddSheet } from "./quickadd/quick-add-sheet";
import { ItemSheet } from "./itemsheet/item-sheet";
import { RegistrationGate } from "./shared/registration-gate";
import { LockScreen } from "./shared/lock-screen";
import { InstallHintCard } from "./shared/install-hint";
import { FridayAlarmCard, shouldShowFridayAlarm } from "./shared/friday-alarm-card";
import { TzHintCard } from "./shared/tz-hint";
import { RamadanCard } from "./shared/ramadan-card";
import { BackupNudgeCard } from "./shared/backup-nudge-card";
import { OnboardingSheet } from "./shared/onboarding-sheet";
import { ScreenErrorBoundary } from "./shared/error-boundary";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { key: "today", icon: CalendarDays },
  { key: "weekly", icon: Sun },
  { key: "spaces", icon: LayoutGrid },
  { key: "inbox", icon: Inbox },
  { key: "more", icon: MoreHorizontal },
] as const;

function BootSplash() {
  const { t } = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <p className="font-serif text-[15px] italic text-muted-foreground">
        {t("register.opening")}
      </p>
    </div>
  );
}

export function AppShell() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const openSearch = useUIStore((s) => s.openSearch);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const { t } = useT();
  const userName = useUserName();
  const prefs = useViewPrefs();
  const [online, setOnline] = useState(true);
  const [welcome, setWelcome] = useState<boolean | null>(null);
  const [installHint, setInstallHint] = useState(false);
  // v1.2 cards: Friday ritual, DST drift hint, Ramadan rhythm
  const [fridayAlarm, setFridayAlarm] = useState(false);
  const [tzHint, setTzHint] = useState(false);
  const [ramadanCard, setRamadanCard] = useState(false);
  // v1.3: weekly backup nudge — one line, at most once a week
  const [backupNudge, setBackupNudge] = useState(false);
  // optional PIN lock (v1.1): `null` = still checking the vault
  const [pinActive, setPinActive] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  // one-time initialization
  useEffect(() => {
    void initI18n();
    ensureSearchStarted();
    initInstallPromptListener();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    void getSetting<boolean>(SETTING_KEYS.welcomeDismissed, false).then((v) =>
      setWelcome(!v)
    );
    void hasPin().then(setPinActive);
    // quiet weekly on-device snapshot (never blocks the UI, never throws)
    void import("@/lib/lifeos/services/backup-service").then(
      ({ maybeAutoBackup }) => maybeAutoBackup()
    );
    // v1.4: keep the activity log bounded — a quiet prune at boot, and
    // logActivity itself trims periodically as it writes.
    void pruneActivityHistory().catch(() => undefined);
    // v1.3 graduated onboarding: the install hint waits for the first قفلة —
    // "add me to your home screen" makes sense once the daily ritual is real.
    void Promise.all([
      getSetting<boolean>(SETTING_KEYS.installHintDismissed, false),
      hasAnyClosure(),
    ]).then(([dismissed, anyClosure]) =>
      setInstallHint(!dismissed && !isStandalone() && anyClosure)
    );
    // v1.2: local-only error log (never any network)
    initErrorLogging();
    // v1.2: Friday-alarm card — shown once until done/dismissed.
    // v1.5: from the FIRST Friday after registration — the old gate (a
    // full week + a closure) hid the ritual when it mattered most.
    void (async () => {
      try {
        const [dismissed, done, prayer, dayStart] = await Promise.all([
          getSetting<boolean>(SETTING_KEYS.fridayAlarmDismissed, false),
          getSetting<boolean>(SETTING_KEYS.fridayAlarmDone, false),
          getSetting<PrayerSettings>(SETTING_KEYS.prayer, DEFAULT_PRAYER),
          getSetting<"fajr" | "midnight">(SETTING_KEYS.dayStart, "fajr"),
        ]);
        setFridayAlarm(
          shouldShowFridayAlarm({
            dismissed,
            done,
            lifeToday: lifeDayFor({ prayer, dayStart }),
          })
        );
      } catch {
        /* quiet */
      }
    })();
    // v1.3: the weekly backup nudge — the one honest alarm. Not a streak,
    // not a scolding: a single line, at most once a week, only after a
    // lived week (≥1 قفلة) with a stale export. The phone is the only copy.
    void (async () => {
      try {
        const [lastExport, lastNudge, closed, itemCount] = await Promise.all([
          getSetting<number | null>(SETTING_KEYS.lastBackupAt, null),
          getSetting<number | null>(SETTING_KEYS.backupWeeklyNudgeAt, null),
          closedInLast7Days(),
          db.items.count(),
        ]);
        setBackupNudge(
          shouldWeeklyNudge({
            now: Date.now(),
            lastExportAt: lastExport ?? null,
            lastNudgeAt: lastNudge ?? null,
            closedInLast7Days: closed,
            itemCount,
          })
        );
      } catch {
        /* quiet — a courtesy must never become an error */
      }
    })();
    // v1.2: a manual prayer schedule drifts an hour when DST flips — say it once
    void (async () => {
      try {
        const offset = new Date().getTimezoneOffset();
        const stored = await getSetting<number | null>(
          SETTING_KEYS.tzLastOffset,
          null
        );
        if (stored === null) {
          await setSetting(SETTING_KEYS.tzLastOffset, offset);
          return;
        }
        if (stored !== offset) {
          const prayer = await getSetting<PrayerSettings>(
            SETTING_KEYS.prayer,
            DEFAULT_PRAYER
          );
          if (prayer.mode === "manual") setTzHint(true);
          else await setSetting(SETTING_KEYS.tzLastOffset, offset);
        }
      } catch {
        /* quiet */
      }
    })();
    // v1.2: Ramadan rhythm — quietly revert after the month; card once a season
    void maybeRevertRamadan();
    void (async () => {
      try {
        if (!isRamadan()) return;
        const [hasBackup, shown] = await Promise.all([
          ramadanBackupExists(),
          ramadanPromptRecentlyShown(),
        ]);
        setRamadanCard(!hasBackup && !shown);
      } catch {
        /* quiet */
      }
    })();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // re-lock when the app stays in the background for a while (v1.1)
  useEffect(() => {
    if (pinActive !== true) return;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null && Date.now() - hiddenAt > 90_000) {
        setUnlocked(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, [pinActive]);

  // ask for persistent storage quietly after the first meaningful write
  const persistedAsked = useRef(false);
  useEffect(() => {
    if (persistedAsked.current) return;
    const unsubscribe = import("@/lib/lifeos/events").then(({ onDataChange }) => {
      const off = onDataChange(() => {
        if (persistedAsked.current) return;
        persistedAsked.current = true;
        try {
          void navigator.storage?.persist?.();
        } catch {
          /* quiet */
        }
        off();
      });
      return off;
    });
    return () => {
      void unsubscribe.then((off) => off());
    };
  }, []);

  // v1.2: the life day flips at Fajr, not midnight — keep the anchor honest
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        const [prayer, dayStart] = await Promise.all([
          getSetting<PrayerSettings>(SETTING_KEYS.prayer, DEFAULT_PRAYER),
          getSetting<"fajr" | "midnight">(SETTING_KEYS.dayStart, "fajr"),
        ]);
        if (!alive) return;
        useUIStore
          .getState()
          .syncLifeDay(lifeDayFor({ prayer, dayStart }));
      } catch {
        /* quiet */
      }
    };
    void sync();
    const interval = setInterval(() => void sync(), 60_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  // v1.4: the week anchor follows the "week starts on" setting. The store
  // seeds a Saturday-anchored default before IndexedDB answers; once prefs
  // arrive (or the setting changes), re-anchor — but never drag a user who
  // has browsed to another week.
  const firstDay = prefs?.calendar.firstDayOfWeek;
  const prevFirstDay = useRef<number | null>(null);
  useEffect(() => {
    if (firstDay === undefined) return;
    if (prevFirstDay.current === firstDay) return;
    prevFirstDay.current = firstDay;
    const s = useUIStore.getState();
    const today = s.lifeToday;
    const stillThisWeek =
      s.weekStartDate === weekStart(today, DEFAULT_FIRST_DAY) || // the seeded default
      s.weekStartDate === weekStart(today, firstDay);
    if (!stillThisWeek) return;
    const anchor = weekStart(today, firstDay);
    s.setWeekStartDate(anchor);
    s.setReviewWeekStart(anchor);
  }, [firstDay]);

  // keyboard shortcuts (visible alternatives exist for each)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        void handleUndoShortcut().then((label) => {
          if (label) {
            import("sonner").then(({ toast }) => toast(t("shell.undone", { label: rt(label) })));
          }
        });
      } else if (e.key === "Escape" && !searchOpen) {
        // dialogs handle their own escape
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch, searchOpen, t]);

  const screen = useMemo(() => {
    const inner = (() => {
      switch (route.name) {
        case "today":
          return <TodayScreen />;
        case "weekly":
          return <WeeklyScreen />;
        case "spaces":
          return <SpacesScreen />;
        case "space":
          return <SpaceScreen spaceId={route.spaceId} />;
        case "inbox":
          return <InboxScreen />;
        case "more":
          return <MoreScreen />;
        case "notes":
          return <NotesScreen />;
        case "note":
          return <NoteEditorScreen itemId={route.itemId} />;
        case "entertainment":
          return <EntertainmentScreen />;
        case "review":
          return <ReviewScreen />;
        case "routines":
          return <RoutinesScreen />;
        case "settings":
          return <SettingsScreen section={route.section} />;
        case "archived":
          return <ArchivedScreen />;
        default:
          return <TodayScreen />;
      }
    })();
    // v1.4: one broken screen must never take the shell down with it — a
    // fresh boundary per route (keyed) so navigating away always starts clean.
    return (
      <ScreenErrorBoundary key={route.name}>{inner}</ScreenErrorBoundary>
    );
  }, [route]);

  // Registration gate: `undefined` = still reading local data, `null` = not registered.
  // PIN lock (v1.1) sits in front of everything once enabled.
  if (pinActive === null || userName === undefined) return <BootSplash />;
  if (pinActive && !unlocked)
    return <LockScreen onUnlocked={() => setUnlocked(true)} />;
  if (userName === null) return <RegistrationGate />;

  return (
    <div className="daybook-paper min-h-screen">
      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/70 bg-canvas/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="min-w-0">
          <p className="truncate font-serif text-[15px] leading-tight text-ink">
            {t("app.name")}
          </p>
          <p className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
            {routeLabel(route)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full text-ink-soft"
            aria-label={t("shell.search")}
            onClick={openSearch}
          >
            <Search className="h-4.5 w-4.5" />
          </Button>
          <Button
            size="icon"
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            aria-label={t("shell.quickAdd")}
            onClick={() => openQuickAdd()}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px]">
        {/* desktop rail */}
        <nav
          aria-label={t("nav.primary")}
          className="sticky top-0 hidden h-screen w-[228px] shrink-0 flex-col border-e border-border/70 bg-surface-sidebar px-3 py-5 lg:flex"
        >
          <div className="px-2.5 pb-5">
            <p className="font-serif text-[19px] leading-tight text-ink">
              {t("app.name")}
            </p>
            <p className="mt-0.5 font-serif text-[11.5px] italic text-muted-foreground">
              {t("app.tagline")}
            </p>
          </div>
          <RailList />
          <div className="mt-auto space-y-1.5 px-1">
            <button
              type="button"
              onClick={openSearch}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] text-ink-soft transition-colors hover:bg-surface-raised"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              {t("shell.search")}
              <span className="ms-auto text-[10px] text-muted-foreground/70">⌘K</span>
            </button>
            <button
              type="button"
              onClick={() => openQuickAdd()}
              className="flex w-full items-center gap-2.5 rounded-xl bg-primary px-3 py-2.5 text-[13.5px] font-medium text-primary-foreground transition-colors hover:bg-primary-deep"
            >
              <Plus className="h-4 w-4" />
              {t("shell.quickAdd")}
            </button>
            <p className="flex items-start gap-1.5 px-3 pt-2 text-[11px] leading-snug text-muted-foreground">
              {online ? (
                <>
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
                  <span>{t("shell.offlineReady")}</span>
                </>
              ) : (
                <>
                  <WifiOff className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{t("shell.offline")}</span>
                </>
              )}
            </p>
          </div>
        </nav>

        {/* main content */}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-7 lg:pb-14 lg:pt-7">
          <div className="mx-auto max-w-[720px]">{screen}</div>
          {/* first-launch cards live on the Today page only — they used to
              trail the user across every screen (review, settings, inbox…),
              which read as clutter, not welcome. */}
          {route.name === "today" ? (
            <div className="mx-auto mt-4 max-w-[720px] space-y-3">
              {/* v1.5: the three-card onboarding replaced the single welcome
                  card — existing users (welcomeDismissed) never see it. */}
              {welcome ? (
                <OnboardingSheet onDone={() => setWelcome(false)} />
              ) : null}
              {installHint ? <InstallHintCard onDone={() => setInstallHint(false)} /> : null}
              {tzHint ? <TzHintCard onDone={() => setTzHint(false)} /> : null}
              {fridayAlarm ? <FridayAlarmCard onDone={() => setFridayAlarm(false)} /> : null}
              {ramadanCard ? <RamadanCard onDone={() => setRamadanCard(false)} /> : null}
              {backupNudge ? <BackupNudgeCard onDone={() => setBackupNudge(false)} /> : null}
            </div>
          ) : null}
        </main>

        {/* right context panel */}
        <aside
          aria-label={t("shell.todayGlance")}
          className="sticky top-0 hidden h-screen w-[272px] shrink-0 flex-col gap-4 overflow-y-auto border-s border-border/70 bg-surface-context/60 px-4 py-6 xl:flex"
        >
          <ContextPanel />
        </aside>
      </div>

      {/* mobile bottom nav */}
      <nav
        aria-label={t("nav.primary")}
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border/80 bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {PRIMARY.map(({ key, icon: Icon }) => {
          const activeRoute =
            key === "today"
              ? route.name === "today"
              : key === "weekly"
                ? route.name === "weekly"
                : key === "spaces"
                  ? route.name === "spaces" || route.name === "space"
                  : key === "inbox"
                    ? route.name === "inbox"
                    : route.name === "more" ||
                      ["notes", "note", "entertainment", "review", "routines", "settings", "archived"].includes(
                        route.name
                      );
          return (
            <button
              key={key}
              type="button"
              aria-current={activeRoute ? "page" : undefined}
              onClick={() =>
                key === "more"
                  ? navigate({ name: "more" })
                  : key === "today"
                    ? navigate({ name: "today" })
                    : key === "weekly"
                      ? navigate({ name: "weekly" })
                      : key === "spaces"
                        ? navigate({ name: "spaces" })
                        : navigate({ name: "inbox" })
              }
              className={cn(
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors",
                activeRoute ? "text-primary-deep" : "text-muted-foreground"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {key === "inbox" ? <InboxBadge /> : null}
              </span>
              {t(`nav.${key}`)}
            </button>
          );
        })}
      </nav>

      {/* overlays */}
      <SearchDialog />
      <QuickAddSheet />
      <ItemSheet />
    </div>
  );
}

function routeLabel(route: { name: string }): string {
  switch (route.name) {
    case "today":
      return t("nav.today");
    case "weekly":
      return t("nav.weekly");
    case "spaces":
    case "space":
      return t("nav.spaces");
    case "inbox":
      return t("nav.inbox");
    case "more":
      return t("nav.more");
    case "notes":
    case "note":
      return t("nav.notes");
    case "entertainment":
      return t("nav.entertainment");
    case "review":
      return t("nav.review");
    case "routines":
      return t("nav.routines");
    case "settings":
      return t("nav.settings");
    case "archived":
      return t("nav.archived");
    default:
      return t("app.name");
  }
}

function RailList() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const goToday = useUIStore((s) => s.goToday);
  const { t } = useT();
  return (
    <div className="flex flex-1 flex-col gap-0.5">
      {PRIMARY.map(({ key, icon: Icon }) => {
        const active =
          key === "spaces"
            ? route.name === "spaces" || route.name === "space"
            : key === "more"
              ? ["more", "notes", "note", "entertainment", "review", "routines", "settings", "archived"].includes(
                  route.name
                )
              : route.name === key;
        return (
          <button
            key={key}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (key === "today") goToday();
              else if (key === "weekly") navigate({ name: "weekly" });
              else if (key === "spaces") navigate({ name: "spaces" });
              else if (key === "inbox") navigate({ name: "inbox" });
              else navigate({ name: "more" });
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] transition-colors",
              active
                ? "bg-surface-raised font-medium text-primary-deep shadow-[var(--shadow-warm)]"
                : "text-ink-soft hover:bg-surface-raised/70"
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
            {t(`nav.${key}`)}
            {key === "inbox" ? <InboxBadge withLabel /> : null}
          </button>
        );
      })}
    </div>
  );
}

function InboxBadge({ withLabel }: { withLabel?: boolean }) {
  const prefs = useViewPrefs();
  const count = useInboxCount();
  const { t, lang } = useT();
  if (!prefs?.inboxBadge || count === 0) return null;
  const shown = lang === "ar" ? toArabicDigits(String(count)) : String(count);
  return (
    <span
      className={cn(
        "ms-auto inline-flex min-w-[18px] items-center justify-center rounded-full px-1 font-medium",
        "bg-primary-soft/70 text-primary-deep",
        withLabel ? "text-[10.5px]" : "text-[10px]"
      )}
      aria-label={t("shell.inboxBadge", { count: shown })}
    >
      {shown}
    </span>
  );
}

/* ---------- right context panel ---------- */

function ContextPanel() {
  const lifeToday = useLifeToday();
  const data = useTodayData(lifeToday);
  const spaces = useSpaces();
  const prefs = useViewPrefs();
  const navigate = useUIStore((s) => s.navigate);
  const openItem = useUIStore((s) => s.openItem);
  const setTodayDate = useUIStore((s) => s.setTodayDate);
  const { t } = useT();

  const now = nowMinutes();
  // v1.5: one canonical "which period holds this moment" — the inline
  // 90-minute fallback used to disagree with the service's 60-minute one.
  const currentPeriodSetting =
    data === undefined
      ? null
      : proposePeriodSettingId(
          data.periods.map((p) => ({
            ...p,
            endTime: p.endTime ?? undefined,
          })),
          minutesToTime(now)
        );
  const currentPeriod = currentPeriodSetting
    ? data!.periods.find((p) => p.settingId === currentPeriodSetting) ?? null
    : null;
  const current = currentPeriod
    ? { name: currentPeriod.name, until: currentPeriod.endTime ?? null }
    : null;

  const todaysItems = useMemo(() => {
    if (!data) return [];
    return data.allRows.slice(0, 6);
  }, [data]);

  return (
    <div className="space-y-4 text-[13px]">
      <section className="rounded-2xl border border-border bg-surface px-3.5 py-3">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {t("shell.rightNow")}
        </p>
        {current ? (
          <>
            <p className="mt-1 font-serif text-[16px] text-ink">{periodName(current.name)}</p>
            {current.until && prefs ? (
              <p className="text-[12px] tabular-nums text-muted-foreground">
                {t("shell.until", { time: formatTime(current.until, prefs.calendar.timeFormat24) })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 font-serif italic text-[14px] text-muted-foreground">
            {t("shell.betweenPeriods")}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface px-3.5 py-3">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {t("shell.todayGlance")}
        </p>
        {todaysItems.length === 0 ? (
          <p className="mt-1.5 font-serif italic text-[13px] text-muted-foreground">
            {t("shell.openPage")}
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {todaysItems.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  onClick={() => row.item && openItem(row.item.id)}
                  className="flex w-full items-center gap-2 text-start"
                >
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                      row.executionStatus === "completed"
                        ? "bg-sage"
                        : row.executionStatus === "skipped"
                          ? "bg-muted-foreground/40"
                          : "bg-primary/60"
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12.5px]",
                      row.executionStatus === "completed"
                        ? "text-muted-foreground"
                        : "text-ink-soft"
                    )}
                  >
                    {row.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => {
            setTodayDate(lifeToday);
            navigate({ name: "today" });
          }}
          className="mt-2 text-[12px] text-muted-foreground underline-offset-2 hover:text-ink-soft hover:underline"
        >
          {t("shell.openTodayLink")}
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-surface px-3.5 py-3">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {t("shell.spaces")}
        </p>
        {spaces && spaces.active.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5">
            {spaces.active.slice(0, 5).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => navigate({ name: "space", spaceId: s.id })}
                  className="w-full truncate rounded-md px-1 py-0.5 text-start text-[13px] text-ink-soft hover:bg-surface-context"
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 font-serif italic text-[13px] text-muted-foreground">
            {t("shell.noSpaces")}
          </p>
        )}
        <button
          type="button"
          onClick={() => navigate({ name: "spaces" })}
          className="mt-2 text-[12px] text-muted-foreground underline-offset-2 hover:text-ink-soft hover:underline"
        >
          {t("shell.allSpaces")}
        </button>
      </section>

      <p className="px-1 font-serif text-[11.5px] italic leading-relaxed text-muted-foreground/80">
        {t("shell.panelNote")}
      </p>
    </div>
  );
}
