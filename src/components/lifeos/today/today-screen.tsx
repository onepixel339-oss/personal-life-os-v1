/* Today screen — "What do I want to do today?" (§3.1, §14.2). */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Moon, Plus, RefreshCw } from "lucide-react";
import { useUIStore } from "@/lib/lifeos/ui-store";
import {
  useLifeToday,
  useMinuteTick,
  useResumeSuggestions,
  useTodayData,
  useViewPrefs,
} from "@/lib/lifeos/hooks";
import {
  addDays,
  formatDate,
  formatTime,
  nowMinutes,
  timeToMinutes,
} from "@/lib/lifeos/dates";
import type { ResolvedPeriod } from "@/lib/lifeos/types";
import type { TodayRow } from "@/lib/lifeos/hooks";
import { greeting, periodEmptyCopy, periodName, periodTagline, useT } from "@/lib/lifeos/i18n";
import { run } from "@/lib/lifeos/run";
import { addEntryToDay } from "@/lib/lifeos/services/planning-service";
import { setView } from "@/lib/lifeos/services/settings-service";
import { SETTING_KEYS } from "@/lib/lifeos/defaults";
import { useUserName } from "@/lib/lifeos/hooks";
import { Button } from "@/components/ui/button";
import {
  BeginButton,
  EmptyState,
  PageHeader,
  ViewSwitcher,
} from "../shared/primitives";
import { SmartResumeCard } from "../shared/smart-resume";
import { TodayEntryRow } from "./entry-row";
import { TodayTimeline } from "./timeline-view";
import { ItemPickerDialog } from "../shared/dialogs";
import { DayClosureCard } from "./day-closure-card";
import { isRamadan } from "@/lib/lifeos/ramadan";
import { cn } from "@/lib/utils";

export function TodayScreen() {
  const todayDate = useUIStore((s) => s.todayDate);
  const setTodayDate = useUIStore((s) => s.setTodayDate);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const navigate = useUIStore((s) => s.navigate);
  const data = useTodayData(todayDate);
  const prefs = useViewPrefs();
  const tick = useMinuteTick();
  const { t } = useT();
  const userName = useUserName();
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [showNewDay, setShowNewDay] = useState(false);
  // v1.2: the day flips at Fajr, not midnight (life-day boundary)
  const [seenToday, setSeenToday] = useState<string | null>(null);
  const realToday = useLifeToday();
  const [ramadan] = useState(() => isRamadan());
  const isToday = todayDate === realToday;

  if (seenToday === null) {
    setSeenToday(realToday); // first render: adopt silently, no banner
  } else if (realToday !== seenToday) {
    setSeenToday(realToday);
    setShowNewDay(true);
  }

  const suggestions = useResumeSuggestions({ kind: "app_open" });

  // Current period + the overnight link (D1)
  const currentPeriodId = useMemo(() => {
    if (!data || !isToday) return null;
    const now = nowMinutes();
    for (const p of data.periods) {
      if (!p.startTime) continue;
      const start = timeToMinutes(p.startTime);
      const end = p.endTime
        ? timeToMinutes(p.endTime) + (p.endDayOffset ?? 0) * 1440
        : start + 90;
      if (now >= start && now < end) return p.id;
    }
    return null;
  }, [data, isToday, tick]);

  // Still before Fajr of today? Gentle link to yesterday's plan (D1)
  const overnightLinkDate = useMemo(() => {
    if (!data || !isToday) return null;
    const night = data.periods[data.periods.length - 1];
    if (!night?.startTime || !night.endTime) return null;
    const now = nowMinutes();
    if (now < timeToMinutes(night.startTime) && now < 6 * 60) {
      return addDays(todayDate, -1);
    }
    return null;
  }, [data, isToday, todayDate, tick]);

  if (!data || !prefs) {
    return (
      <div className="py-16 text-center font-serif italic text-muted-foreground">
        {t("today.opening")}
      </div>
    );
  }

  const view = prefs.todayView;
  const dateFormat = prefs.calendar.dateFormat as "dmy" | "mdy" | "ymd";

  return (
    <div>
      <PageHeader
        kicker={
          ramadan
            ? `${greeting(userName)} · ${t("ramadan.greeting")}`
            : greeting(userName)
        }
        title={t("today.title")}
        subtitle={t("today.subtitle")}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("today.prevDay")}
              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-surface hover:text-ink-soft"
              onClick={() => setTodayDate(addDays(todayDate, -1))}
            >
              <ChevronRight className="h-4 w-4 rtl:hidden" />
              <ChevronLeft className="h-4 w-4 ltr:hidden" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("today.nextDay")}
              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-surface hover:text-ink-soft"
              onClick={() => setTodayDate(addDays(todayDate, 1))}
            >
              <ChevronLeft className="h-4 w-4 rtl:hidden" />
              <ChevronRight className="h-4 w-4 ltr:hidden" />
            </Button>
            {!isToday ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-full border-border bg-surface text-[12.5px] text-ink-soft"
                onClick={() => setTodayDate(realToday)}
              >
                {t("common.today")}
              </Button>
            ) : null}
            <ViewSwitcher
              view={view}
              onChange={(v) => void setView(SETTING_KEYS.todayView, v)}
            />
          </>
        }
      />

      <div className="mb-5 space-y-3">
        {showNewDay && !isToday ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-soft bg-primary-soft/25 px-4 py-2.5">
            <p className="text-[13px] text-ink-soft">
              {t("today.newDay")}
            </p>
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full text-[12.5px] text-muted-foreground"
                onClick={() => setShowNewDay(false)}
              >
                {t("today.stayHere")}
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-full bg-primary px-3.5 text-[12.5px] text-primary-foreground hover:bg-primary-deep"
                onClick={() => {
                  setSeenToday(realToday);
                  setShowNewDay(false);
                  setTodayDate(realToday);
                }}
              >
                {t("today.openToday")}
              </Button>
            </div>
          </div>
        ) : null}

        {overnightLinkDate ? (
          <button
            type="button"
            onClick={() => setTodayDate(overnightLinkDate)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-ink-soft"
          >
            <Moon className="h-3.5 w-3.5" />
            {t("today.overnight", { date: formatDate(overnightLinkDate, dateFormat) })}
          </button>
        ) : null}

        <SmartResumeCard suggestions={suggestions ?? []} />
      </div>

      {view === "list" ? (
        <div className="space-y-4">
          <UnplacedSection
            rows={data.unplaced}
            periods={data.periods}
            timeFormat24={prefs.calendar.timeFormat24}
            dateFormat={dateFormat}
          />
          {data.periods.map((period) => (
            <PeriodSection
              key={period.id}
              period={period}
              allPeriods={data.periods}
              rows={data.byPeriod.get(period.id) ?? []}
              isCurrent={currentPeriodId === period.id}
              timeFormat24={prefs.calendar.timeFormat24}
              dateFormat={dateFormat}
              date={todayDate}
              onAddExisting={() => setPickerFor(period.id)}
            />
          ))}
          {data.periods.length === 0 ? (
            <EmptyState
              message={t("today.noPeriods")}
              action={
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => navigate({ name: "settings", section: "periods" })}
                >
                  {t("today.openPeriodSettings")}
                </Button>
              }
            />
          ) : null}
        </div>
      ) : (
        <TodayTimeline
          date={todayDate}
          periods={data.periods}
          byPeriod={data.byPeriod}
          unplaced={data.unplaced}
          timeFormat24={prefs.calendar.timeFormat24}
          isToday={isToday}
        />
      )}

      {isToday ? <DayClosureCard date={todayDate} /> : null}

      <ItemPickerDialog
        open={pickerFor !== null}
        onOpenChange={(open) => setPickerFor(open ? pickerFor : null)}
        title={t("period.addExistingTitle")}
        description={t("period.addExistingDesc")}
        onPick={async (item) => {
          if (!pickerFor) return;
          const period = data.periods.find((p) => p.id === pickerFor);
          await run(
            addEntryToDay({
              date: todayDate,
              kind: "item",
              itemId: item.id,
              periodId: pickerFor,
              startTime: undefined,
            }),
            { success: t("today.placedToast", { title: item.title, period: periodName(period?.name ?? "") }) }
          );
        }}
      />
    </div>
  );
}

/* ---------- period section (five always visible, even empty) ---------- */

function PeriodSection({
  period,
  allPeriods,
  rows,
  isCurrent,
  timeFormat24,
  dateFormat,
  date,
  onAddExisting,
}: {
  period: ResolvedPeriod & { settingId?: string };
  allPeriods: (ResolvedPeriod & { settingId?: string })[];
  rows: TodayRow[];
  isCurrent: boolean;
  timeFormat24: boolean;
  dateFormat: string;
  date: string;
  onAddExisting: () => void;
}) {
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const { t } = useT();
  const timeLabel =
    period.startTime && period.endTime
      ? `${formatTime(period.startTime, timeFormat24)} – ${formatTime(period.endTime, timeFormat24)}${
          period.endDayOffset ? " (+1)" : ""
        }`
      : period.mode === "flexible"
        ? t("period.flexible")
        : "";
  return (
    <section
      className={cn(
        "rounded-2xl border bg-surface px-3.5 pb-2 pt-3 md:px-5",
        isCurrent ? "border-primary/45 shadow-[var(--shadow-warm)]" : "border-border"
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-serif text-[17px] text-ink">{periodName(period.name)}</h2>
          {period.tagline ? (
            <span className="font-serif text-[13px] italic text-muted-foreground">
              {periodTagline(period.tagline, period.name)}
            </span>
          ) : null}
          {isCurrent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft/60 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-primary-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
              {t("period.now")}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {timeLabel ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">{timeLabel}</span>
          ) : null}
          <button
            type="button"
            onClick={onAddExisting}
            className="rounded-full px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-primary-soft/35 hover:text-primary-deep"
            title={t("period.addExistingAria")}
          >
            {t("period.addExisting")}
          </button>
        </div>
      </header>
      <div className="mt-1">
        {rows.length === 0 ? (
          <EmptyState
            compact
            message={periodEmptyCopy(period.name)}
            action={
              <BeginButton
                label={t("period.beginSomething")}
                onClick={() =>
                  openQuickAdd({
                    source: "today",
                    date,
                    periodSettingId: period.settingId ?? undefined,
                  })
                }
              />
            }
          />
        ) : (
          <ul className="flex flex-col">
            {rows.map((row) => (
              <li key={row.key} className="border-t border-border/60 first:border-t-0">
                <TodayEntryRow
                  row={row}
                  periods={allPeriods}
                  timeFormat24={timeFormat24}
                  dateFormat={dateFormat}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {rows.length > 0 ? (
        <div className="pt-0.5">
          <BeginButton
            label={t("period.begin")}
            onClick={() =>
              openQuickAdd({
                source: "today",
                date,
                periodSettingId: period.settingId ?? undefined,
              })
            }
          />
        </div>
      ) : null}
    </section>
  );
}

/* ---------- unplaced (never hidden) ---------- */

function UnplacedSection({
  rows,
  periods,
  timeFormat24,
  dateFormat,
}: {
  rows: TodayRow[];
  periods: (ResolvedPeriod & { settingId?: string })[];
  timeFormat24: boolean;
  dateFormat: string;
}) {
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const todayDate = useUIStore((s) => s.todayDate);
  const { t } = useT();
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-dashed border-border-strong/70 bg-surface-context/60 px-3.5 py-3 md:px-5">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[17px] text-ink">{t("today.unplaced")}</h2>
        <span className="text-[11px] text-muted-foreground">
          {t("today.unplacedHint")}
        </span>
      </header>
      <ul className="mt-1 flex flex-col">
        {rows.map((row) => (
          <li key={row.key} className="border-t border-border/60 first:border-t-0">
            <TodayEntryRow
              row={row}
              periods={periods}
              timeFormat24={timeFormat24}
              dateFormat={dateFormat}
              suggestedSettingId={
                row.startTime
                  ? periods.find((p) => {
                      if (!p.startTime) return false;
                      const start = timeToMinutes(p.startTime);
                      const end = p.endTime
                        ? timeToMinutes(p.endTime) + (p.endDayOffset ?? 0) * 1440
                        : start + 90;
                      const t = timeToMinutes(row.startTime ?? "");
                      return t >= start && t < end;
                    })?.settingId ?? null
                  : null
              }
            />
          </li>
        ))}
      </ul>
      <div className="mt-1">
        <BeginButton
          label={t("today.holdElse")}
          onClick={() => openQuickAdd({ source: "today", date: todayDate })}
        />
      </div>
    </section>
  );
}

export { Plus, RefreshCw };
void 0;
