/* Weekly screen — what deserves attention this week (§3.2, §14.3).
   Not a commitment list; nothing ever moves by itself. */

"use client";

import { useMemo, useState } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Flag,
  MoreHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useViewPrefs, useWeeklyData, type WeeklyRow } from "@/lib/lifeos/hooks";
import {
  addDays,
  formatDate,
  formatWeekRange,
  todayLocal,
  weekStart,
  weekdayName,
} from "@/lib/lifeos/dates";
import { run } from "@/lib/lifeos/run";
import { t, useT } from "@/lib/lifeos/i18n";
import {
  addEntryToWeek,
  removeEntryFromWeek,
  setWeekEntryDay,
} from "@/lib/lifeos/services/planning-service";
import { setView } from "@/lib/lifeos/services/settings-service";
import { SETTING_KEYS } from "@/lib/lifeos/defaults";
import {
  archiveItem,
  setItemStatus,
  postponeItem,
} from "@/lib/lifeos/services/item-service";
import { returnItemToInbox } from "@/lib/lifeos/services/inbox-service";
import { createItem } from "@/lib/lifeos/services/item-service";
import {
  Chip,
  EmptyState,
  PageHeader,
  SectionLabel,
  StatusChip,
  ViewSwitcher,
} from "../shared/primitives";
import {
  AddToTodayDialog,
  AddToWeekDialog,
  ItemPickerDialog,
} from "../shared/dialogs";
import { cn } from "@/lib/utils";

export function WeeklyScreen() {
  const weekStartDate = useUIStore((s) => s.weekStartDate);
  const setWeekStartDate = useUIStore((s) => s.setWeekStartDate);
  const setReviewWeek = useUIStore((s) => s.setReviewWeek);
  const openItem = useUIStore((s) => s.openItem);
  const setTodayDate = useUIStore((s) => s.setTodayDate);
  const navigate = useUIStore((s) => s.navigate);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const prefs = useViewPrefs();
  const { t } = useT();
  const firstDay = prefs?.calendar.firstDayOfWeek ?? 6;
  const data = useWeeklyData(weekStartDate, firstDay);
  const [pickerDay, setPickerDay] = useState<string | null>(null);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [outcomeTitle, setOutcomeTitle] = useState("");
  const [addExistingOpen, setAddExistingOpen] = useState(false);

  if (!data || !prefs) {
    return (
      <div className="py-16 text-center font-serif italic text-muted-foreground">
        {t("weekly.opening")}
      </div>
    );
  }

  const realToday = todayLocal();
  const isCurrentWeek =
    realToday >= data.weekStart && realToday <= data.weekEnd;
  const dateFormat = prefs.calendar.dateFormat as "dmy" | "mdy" | "ymd";
  const view = prefs.weeklyView;

  return (
    <div>
      <PageHeader
        kicker={isCurrentWeek ? t("weekly.thisWeek") : undefined}
        title={t("weekly.title")}
        subtitle={t("weekly.subtitle")}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("weekly.prevWeek")}
              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-surface hover:text-ink-soft"
              onClick={() => setWeekStartDate(addDays(weekStartDate, -7))}
            >
              <ChevronRight className="h-4 w-4 rtl:hidden" />
              <ChevronLeft className="h-4 w-4 ltr:hidden" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("weekly.nextWeek")}
              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-surface hover:text-ink-soft"
              onClick={() => setWeekStartDate(addDays(weekStartDate, 7))}
            >
              <ChevronLeft className="h-4 w-4 rtl:hidden" />
              <ChevronRight className="h-4 w-4 ltr:hidden" />
            </Button>
            {!isCurrentWeek ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-full border-border bg-surface text-[12.5px]"
                onClick={() => setWeekStartDate(weekStart(realToday, firstDay))}
              >
                {t("weekly.thisWeek")}
              </Button>
            ) : null}
            <ViewSwitcher
              view={view}
              onChange={(v) => void setView(SETTING_KEYS.weeklyView, v)}
            />
          </>
        }
      />

      <p className="-mt-3 mb-4 text-[13px] tabular-nums text-muted-foreground">
        {formatWeekRange(data.weekStart, data.weekEnd, dateFormat)}
      </p>

      {/* outcomes pinned top (§3.2.2) */}
      {data.outcomes.length > 0 ? (
        <section className="mb-4 rounded-2xl border border-primary-soft bg-primary-soft/20 px-4 py-3 md:px-5">
          <SectionLabel className="text-primary-deep">
            <span className="inline-flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5" /> {t("weekly.outcomes")}
            </span>
          </SectionLabel>
          <ul className="mt-1.5 space-y-1">
            {data.outcomes.map((row) => (
              <li key={row.key}>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openItem(row.item.id)}
                    className="min-w-0 flex-1 truncate text-start font-serif text-[15px] text-ink"
                  >
                    {row.item.title}
                  </button>
                  <OutcomeProgress row={row} />
                </div>
                <SubtaskSummary outcomeId={row.item.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* unscheduled (always visible in both views) */}
      <section className="mb-4 rounded-2xl border border-dashed border-border-strong/70 bg-surface-context/60 px-4 py-3 md:px-5">
        <header className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-[16px] text-ink">{t("weekly.noDayYet")}</h2>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full border-border bg-surface text-[12px]"
              onClick={() => setAddExistingOpen(true)}
            >
              {t("period.addExisting")}
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-full bg-primary px-3 text-[12px] text-primary-foreground hover:bg-primary-deep"
              onClick={() => openQuickAdd({ source: "weekly", weekStart: weekStartDate })}
            >
              <Sparkles className="h-3.5 w-3.5" /> {t("weekly.new")}
            </Button>
          </div>
        </header>
        {data.unscheduled.length === 0 ? (
          <EmptyState compact message={t("weekly.nothingWaiting")} />
        ) : (
          <ul className="mt-1 flex flex-col">
            {data.unscheduled.map((row) => (
              <li key={row.key} className="border-t border-border/60 first:border-t-0">
                <WeeklyRowItem
                  row={row}
                  days={data.days}
                  dateFormat={dateFormat}
                  isPastWeek={data.weekEnd < realToday}
                  weekStart={weekStartDate}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* days */}
      {view === "list" ? (
        <div className="space-y-3">
          {data.days.map((day) => {
            const rows = data.byDay.get(day) ?? [];
            const isToday = day === realToday;
            return (
              <section
                key={day}
                className={cn(
                  "rounded-2xl border bg-surface px-4 py-3 md:px-5",
                  isToday ? "border-primary/45" : "border-border"
                )}
              >
                <header className="flex items-baseline justify-between gap-2">
                  <h3 className="font-serif text-[15.5px] text-ink">
                    {weekdayName(day)}
                    <span className="ms-2 text-[12px] tabular-nums text-muted-foreground">
                      {formatDate(day, dateFormat)}
                    </span>
                    {isToday ? (
                      <span className="ms-2 rounded-full bg-primary-soft/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary-deep">
                        {t("common.today")}
                      </span>
                    ) : null}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPickerDay(day)}
                    className="rounded-full px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-primary-soft/35 hover:text-primary-deep"
                  >
                    {t("weekly.add")}
                  </button>
                </header>
                {rows.length === 0 ? (
                  <EmptyState compact message={t("weekly.openForWhatever")} />
                ) : (
                  <ul className="mt-1 flex flex-col">
                    {rows.map((row) => (
                      <li key={row.key} className="border-t border-border/60 first:border-t-0">
                        <WeeklyRowItem
                          row={row}
                          days={data.days}
                          dateFormat={dateFormat}
                          isPastWeek={data.weekEnd < realToday}
                          weekStart={weekStartDate}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <WeeklyTimeline
          data={data}
          dateFormat={dateFormat}
          realToday={realToday}
          isPastWeek={data.weekEnd < realToday}
        />
      )}

      {/* outcome + review */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          className="rounded-full border-border bg-surface"
          onClick={() => setOutcomeOpen(true)}
        >
          <Flag className="h-4 w-4" /> {t("weekly.newOutcome")}
        </Button>
        <button
          type="button"
          onClick={() => setReviewWeek(weekStartDate)}
          className="font-serif italic text-[14px] text-muted-foreground underline-offset-4 hover:text-ink-soft hover:underline"
        >
          {t("weekly.reflect")}
        </button>
      </div>

      <ItemPickerDialog
        open={pickerDay !== null || addExistingOpen}
        onOpenChange={(o) => {
          if (!o) {
            setPickerDay(null);
            setAddExistingOpen(false);
          }
        }}
        title={t("weekly.pickerTitle")}
        description={t("weekly.pickerDesc")}
        onPick={async (item) => {
          await run(
            addEntryToWeek({
              weekStartDate,
              itemId: item.id,
              scheduledDate: pickerDay ?? undefined,
            }),
            { success: t("weekly.joinsToast", { title: item.title }) }
          );
        }}
      />

      <OutcomeDialog
        open={outcomeOpen}
        onOpenChange={setOutcomeOpen}
        title={outcomeTitle}
        setTitle={setOutcomeTitle}
        weekStart={weekStartDate}
      />
    </div>
  );
}

/* ---------- one weekly row ---------- */

function WeeklyRowItem({
  row,
  days,
  dateFormat,
  isPastWeek,
  weekStart,
}: {
  row: WeeklyRow;
  days: string[];
  dateFormat: string;
  isPastWeek: boolean;
  weekStart: string;
}) {
  const openItem = useUIStore((s) => s.openItem);
  const setTodayDate = useUIStore((s) => s.setTodayDate);
  const navigate = useUIStore((s) => s.navigate);
  const { t } = useT();
  const [addToday, setAddToday] = useState(false);
  const [addWeek, setAddWeek] = useState(false);
  const showChoose = isPastWeek && row.item.status !== "completed" && row.item.status !== "cancelled";
  const done = row.item.status === "completed" || row.item.status === "cancelled";

  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <button
        type="button"
        onClick={() => openItem(row.item.id)}
        className="min-w-0 flex-1 text-start"
      >
        <span
          className={cn(
            "block truncate text-[14.5px] leading-snug",
            done ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {row.item.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {row.item.type === "unsorted" ? <Chip tone="muted">{t("entry.unsorted")}</Chip> : null}
          {row.occurrenceKey ? <Chip tone="lavender">{t("entry.repeats")}</Chip> : null}
          {row.item.status !== "active" ? <StatusChip status={row.item.status} /> : null}
          {showChoose ? (
            <Chip tone="terracotta">{t("weekly.weekPassed")}</Chip>
          ) : null}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
            aria-label={t("entry.options")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl border-border bg-surface-raised">
          <DropdownMenuItem onClick={() => openItem(row.item.id)}>
            {t("entry.openItem")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            {t("weekly.dayOfThisWeek")}
          </div>
          {days.map((d) => (
            <DropdownMenuItem
              key={d}
              onClick={async () => {
                if (row.entry) {
                  await run(setWeekEntryDay(row.entry.id, d), { quiet: true });
                } else if (row.occurrence?.ruleId) {
                  // virtual occurrence: nothing to assign — it follows its own date
                }
              }}
            >
              {weekdayName(d, true)} · {formatDate(d, dateFormat as "dmy" | "mdy" | "ymd")}
              {row.scheduledDate === d ? " ✓" : ""}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={async () => {
              if (row.entry) await run(setWeekEntryDay(row.entry.id, null), { quiet: true });
            }}
          >
            {t("weekly.noDayYetShort")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAddToday(true)}>
            <CalendarPlus className="h-3.5 w-3.5" /> {t("weekly.addToDay")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAddWeek(true)}>
            <CalendarPlus className="h-3.5 w-3.5" /> {t("weekly.addToAnotherWeek")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {showChoose ? (
            <>
              <div className="px-2 py-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                {t("weekly.passedChoice")}
              </div>
              <DropdownMenuItem onClick={() => undefined} className="text-muted-foreground/70">
                {t("weekly.keepWhere")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await run(returnItemToInbox(row.item.id), {
                    success: t("weekly.backInInboxToast"),
                  });
                }}
              >
                {t("weekly.returnToInbox")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await run(postponeItem(row.item.id), { success: t("weekly.postponedToast") });
                }}
              >
                {t("weekly.postpone")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await run(setItemStatus(row.item.id, "cancelled"), { quiet: true });
                }}
              >
                {t("weekly.cancelItem")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await run(archiveItem(row.item.id), { success: t("weekly.archivedToast") });
                }}
              >
                {t("weekly.archive")}
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-[#a5533c] focus:text-[#a5533c]"
            onClick={async () => {
              if (row.entry) {
                await run(removeEntryFromWeek(row.entry.id), {
                  success: t("weekly.removedFromWeekToast"),
                });
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("weekly.removeFromWeek")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddToTodayDialog
        open={addToday}
        onOpenChange={setAddToday}
        itemTitle={row.item.title}
        onConfirm={async (choice) => {
          const { addEntryToDay, setEntryPeriodBySetting } = await import(
            "@/lib/lifeos/services/planning-service"
          );
          const res = await run(
            addEntryToDay({
              date: choice.date,
              kind: "item",
              itemId: row.item.id,
              startTime: choice.startTime,
              allowMultiple: true,
            }),
            { quiet: true }
          );
          if (res.ok && choice.periodSettingId) {
            await run(setEntryPeriodBySetting(res.value.id, choice.periodSettingId), { quiet: true });
          }
        }}
      />
      <AddToWeekDialog
        open={addWeek}
        onOpenChange={setAddWeek}
        itemTitle={row.item.title}
        firstDayOfWeek={6}
        onConfirm={async (targetWeek) => {
          await run(
            addEntryToWeek({ weekStartDate: targetWeek, itemId: row.item.id }),
            { success: t("weekly.addedToast") }
          );
        }}
      />
    </div>
  );
}

function OutcomeProgress({ row }: { row: WeeklyRow }) {
  return <StatusChip status={row.item.status} />;
}

function SubtaskSummary({ outcomeId }: { outcomeId: string }) {
  // progress as "x of y related tasks done" text only (D9)
  const rels = useLiveQuery(
    () =>
      db.itemRelationships
        .filter((r) => r.sourceItemId === outcomeId || r.targetItemId === outcomeId)
        .toArray(),
    [outcomeId]
  );
  const items = useLiveQuery(() => db.items.toArray(), []);
  const done = useMemo(() => {
    if (!rels || !items) return null;
    const byId = new Map(items.map((i) => [i.id, i]));
    const children = rels
      .filter((r) => r.relationType === "parent" && r.targetItemId === outcomeId)
      .map((r) => byId.get(r.sourceItemId))
      .filter((i): i is NonNullable<typeof i> => !!i);
    if (children.length === 0) return null;
    const completed = children.filter(
      (i) => i.status === "completed" || i.status === "cancelled"
    ).length;
    return t("weekly.tasksDone", { done: completed, total: children.length });
  }, [rels, items, outcomeId]);
  if (!done) return null;
  return <p className="text-[12px] text-muted-foreground">{done}</p>;
}

/* ---------- timeline view ---------- */

function WeeklyTimeline({
  data,
  dateFormat,
  realToday,
  isPastWeek,
}: {
  data: NonNullable<ReturnType<typeof useWeeklyData>>;
  dateFormat: string;
  realToday: string;
  isPastWeek: boolean;
}) {
  const openItem = useUIStore((s) => s.openItem);
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 md:p-4">
      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {data.days.map((day) => {
          const rows = data.byDay.get(day) ?? [];
          const isToday = day === realToday;
          return (
            <div key={day} className="min-w-0">
              <div
                className={cn(
                  "rounded-lg px-1 py-1.5 text-center",
                  isToday ? "bg-primary-soft/50" : "bg-surface-context/70"
                )}
              >
                <p className="truncate text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                  {weekdayName(day, true)}
                </p>
                <p className="text-[11px] tabular-nums text-ink-soft">
                  {formatDate(day, "dmy").split(" ")[0]}
                </p>
              </div>
              <ul className="mt-1.5 space-y-1">
                {rows.map((row) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      onClick={() => openItem(row.item.id)}
                      title={row.item.title}
                      className={cn(
                        "w-full truncate rounded-md border px-1.5 py-1 text-start text-[11px] leading-tight",
                        row.item.status === "completed" || row.item.status === "cancelled"
                          ? "border-sage/40 bg-sage-soft/60 text-muted-foreground"
                          : "border-border bg-surface-context/80 text-ink-soft"
                      )}
                    >
                      {row.item.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground/70">
        {t("weekly.timelineCaption")}
      </p>
      {isPastWeek ? null : null}
    </div>
  );
}

/* ---------- outcome dialog ---------- */

function OutcomeDialog({
  open,
  onOpenChange,
  title,
  setTitle,
  weekStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  setTitle: (t: string) => void;
  weekStart: string;
}) {
  const { t } = useT();
  const [subtask, setSubtask] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setTitle("");
          setSubtask("");
        }
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{t("weekly.newOutcomeTitle")}</DialogTitle>
          <DialogDescription>
            {t("weekly.outcomeDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("weekly.outcomePlaceholder")}
            className="h-11 rounded-xl border-border bg-surface"
          />
          <Input
            value={subtask}
            onChange={(e) => setSubtask(e.target.value)}
            placeholder={t("weekly.firstStepPlaceholder")}
            className="rounded-xl border-border bg-surface"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!title.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await createItem({ type: "outcome", title });
                if (!res.ok) return;
                const outcomeItem = res.value;
                await run(
                  addEntryToWeek({
                    weekStartDate: weekStart,
                    itemId: outcomeItem.id,
                    role: "outcome",
                  }),
                  { quiet: true }
                );
                if (subtask.trim()) {
                  const stepRes = await createItem({
                    type: "task",
                    title: subtask.trim(),
                  });
                  if (stepRes.ok) {
                    const { addRelationship } = await import(
                      "@/lib/lifeos/services/item-service"
                    );
                    await run(
                      addRelationship(stepRes.value.id, outcomeItem.id, "parent"),
                      { quiet: true }
                    );
                    await run(
                      addEntryToWeek({
                        weekStartDate: weekStart,
                        itemId: stepRes.value.id,
                      }),
                      { quiet: true }
                    );
                  }
                }
                const { toast } = await import("sonner");
                toast(t("weekly.outcomeToast"));
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {t("weekly.addOutcome")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
