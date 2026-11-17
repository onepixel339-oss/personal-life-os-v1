/* Today entry row + its gentle context menu (§3.1). */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  Clock,
  Coffee,
  MoreHorizontal,
  Pencil,
  Repeat,
  RotateCcw,
  Timer,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { run, toastWithUndo } from "@/lib/lifeos/run";
import type { TodayRow } from "@/lib/lifeos/hooks";
import type { ResolvedPeriod } from "@/lib/lifeos/types";
import type { RecurrenceRule } from "@/lib/lifeos/types";
import {
  moveEntryToDay,
  removeEntryFromDay,
  reorderEntry,
  setEntryPeriodBySetting,
  updateEntryTimes,
  proposePeriodSettingId,
} from "@/lib/lifeos/services/planning-service";
import {
  cancelOccurrence,
  parseOccurrenceKey,
  setRulePeriod,
  setOccurrenceExecution,
  disableRule,
  endRuleBefore,
} from "@/lib/lifeos/services/recurrence-service";
import { pushUndo, type UndoCommand } from "@/lib/lifeos/services/history-service";
import { db } from "@/lib/lifeos/db";
import { formatDate, formatTime, isValidDateString } from "@/lib/lifeos/dates";
import { periodName, t, useT } from "@/lib/lifeos/i18n";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { cn } from "@/lib/utils";
import { Chip, ExecutionMark } from "../shared/primitives";

export function TodayEntryRow({
  row,
  periods,
  timeFormat24,
  dateFormat,
  suggestedSettingId,
}: {
  row: TodayRow;
  periods: (ResolvedPeriod & { settingId?: string })[];
  timeFormat24: boolean;
  dateFormat: string;
  suggestedSettingId?: string | null;
}) {
  const openItem = useUIStore((s) => s.openItem);
  const navigate = useUIStore((s) => s.navigate);
  const { t } = useT();
  const [timesOpen, setTimesOpen] = useState(false);
  const [moveDayOpen, setMoveDayOpen] = useState(false);
  const [rule, setRule] = useState<RecurrenceRule | null>(null);
  const isOccurrenceVirtual = row.kind === "occurrence";
  // v1.3.1 — a materialized recurring entry (legacy rows from before rules
  // carried their own anchor) is ALSO a recurring row: same gentle menu
  // (مش النهارده + stop), and the red delete stays a manual-entries-only
  // path — removing a materialized twin without cancelling its occurrence
  // just made the virtual twin bounce back the same day.
  const materializedRecurring = !isOccurrenceVirtual && !!row.entry?.occurrenceKey;
  const periodOfRow = periods.find((p) => p.id === row.periodId);
  const suggested = periods.find((p) => p.settingId === suggestedSettingId);
  const done = row.executionStatus === "completed";
  const skipped = row.executionStatus === "skipped";
  // v1.3 "خلّيه يعيش هنا؟" — for a recurring occurrence whose rule has no
  // home yet, the suggestion writes the RULE itself (once, for all days)
  // instead of arranging today only. Per-day arranging stays for entries
  // and for rules that already have a home.
  const canSuggest = !!suggestedSettingId && !row.periodId && !!suggested;
  const liveHere =
    isOccurrenceVirtual && canSuggest && !!rule && !rule.periodSettingId;
  const daySuggestion =
    canSuggest && (!isOccurrenceVirtual || (!!rule && !!rule.periodSettingId));
  useEffect(() => {
    if (row.occurrenceKey && (isOccurrenceVirtual || materializedRecurring)) {
      void db.recurrenceRules
        .where("itemId")
        .equals(row.item?.id ?? "___")
        .first()
        .then((r) => setRule(r ?? null));
    }
  }, [row.occurrenceKey, row.item?.id, isOccurrenceVirtual, materializedRecurring]);

  const cycleStatus = async () => {
    const order = ["pending", "completed", "skipped", "partial"] as const;
    const next = order[(order.indexOf(row.executionStatus) + 1) % order.length];
    if (isOccurrenceVirtual && row.occurrence) {
      await run(
        setOccurrenceExecution(
          row.occurrence.ruleId,
          row.occurrence.occurrenceKey,
          row.occurrence.originalDate,
          next
        ),
        { quiet: true }
      );
    } else if (row.entry) {
      await run(cycleEntry(row.entry.id, next), { quiet: true });
    }
  };

  return (
    <div
      className={cn(
        "group/row flex items-start gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-context/70",
        (done || skipped) && "opacity-80"
      )}
    >
      <div className="pt-0.5">
        <ExecutionMark status={row.executionStatus} onCycle={cycleStatus} />
      </div>
      <button
        type="button"
        onClick={() => {
          if (row.item) openItem(row.item.id);
          else if (row.routine) navigate({ name: "routines" });
        }}
        className="min-w-0 flex-1 text-start"
      >
        <span
          className={cn(
            "block truncate text-[14.5px] leading-snug",
            done ? "text-muted-foreground" : "text-foreground",
            skipped && "text-muted-foreground/70"
          )}
        >
          {row.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {row.startTime ? (
            <Chip tone="terracotta">
              <Clock className="h-3 w-3" />
              {formatTime(row.startTime, timeFormat24)}
            </Chip>
          ) : null}
          {row.durationMinutes ? (
            <Chip tone="neutral">
              <Timer className="h-3 w-3" />
              {row.durationMinutes >= 60
                ? t("entry.hrs", {
                    h: Math.floor(row.durationMinutes / 60),
                    m:
                      row.durationMinutes % 60
                        ? t("entry.min", { m: row.durationMinutes % 60 })
                        : "",
                  })
                : t("entry.min", { m: row.durationMinutes })}
            </Chip>
          ) : null}
          {row.isRecurring ? (
            <Chip tone="lavender" title={t("entry.repeatsHint")}>
              <Repeat className="h-3 w-3" />
              {t("entry.repeats")}
            </Chip>
          ) : null}
          {row.routine ? <Chip tone="neutral">{t("entry.routine")}</Chip> : null}
          {liveHere ? (
            <Chip
              tone="sage"
              title={t("entry.liveHereHint", {
                name: periodName(suggested!.name),
              })}
              onClick={async () => {
                if (!row.occurrence || !suggestedSettingId) return;
                await run(setRulePeriod(row.occurrence.ruleId, suggestedSettingId), {
                  success: t("entry.liveHereToast", {
                    name: periodName(suggested!.name),
                  }),
                });
              }}
            >
              {t("entry.liveHere", { name: periodName(suggested!.name) })}
            </Chip>
          ) : daySuggestion ? (
            <Chip
              tone="terracotta"
              title={t("entry.setPeriodHint")}
              onClick={async () => {
                if (isOccurrenceVirtual && row.occurrence) {
                  const { modifyOccurrence } = await import(
                    "@/lib/lifeos/services/recurrence-service"
                  );
                  await run(
                    modifyOccurrence(
                      row.occurrence.ruleId,
                      row.occurrence.occurrenceKey,
                      row.occurrence.originalDate,
                      { overridePeriodSettingId: suggestedSettingId }
                    ),
                    { quiet: true }
                  );
                } else if (row.entry) {
                  await run(
                    setEntryPeriodBySetting(row.entry.id, suggestedSettingId),
                    { quiet: true }
                  );
                }
              }}
            >
              {t("entry.looksLike", { name: periodName(suggested!.name) })}
            </Chip>
          ) : null}
          {row.item && row.item.status === "archived" ? (
            <Chip tone="muted">{t("entry.archivedChip")}</Chip>
          ) : null}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={t("periods.moveUp")}
          title={t("periods.moveUp")}
          onClick={async () => {
            if (row.entry) await run(reorderEntry(row.entry.id, { dir: "up" }), { quiet: true });
          }}
          className="hidden h-7 w-6 items-center justify-center rounded-md text-muted-foreground/50 hover:text-ink-soft group-hover/row:flex"
        >
          <span aria-hidden className="text-[13px] leading-none">↑</span>
        </button>
        <button
          type="button"
          aria-label={t("periods.moveDown")}
          title={t("periods.moveDown")}
          onClick={async () => {
            if (row.entry) await run(reorderEntry(row.entry.id, { dir: "down" }), { quiet: true });
          }}
          className="hidden h-7 w-6 items-center justify-center rounded-md text-muted-foreground/50 hover:text-ink-soft group-hover/row:flex"
        >
          <span aria-hidden className="text-[13px] leading-none">↓</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("entry.options")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary-soft/40 hover:text-primary-deep"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="rounded-xl border-border bg-surface-raised"
          >
            {row.item ? (
              <DropdownMenuItem onClick={() => openItem(row.item!.id)}>
                <Pencil className="h-3.5 w-3.5" /> {t("entry.openItem")}
              </DropdownMenuItem>
            ) : null}
            {row.routine ? (
              <DropdownMenuItem onClick={() => navigate({ name: "routines" })}>
                <Zap className="h-3.5 w-3.5" /> {t("entry.openRoutine")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft className="h-3.5 w-3.5" /> {t("entry.period")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="rounded-xl border-border bg-surface-raised">
                {periods.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={async () => {
                      if (isOccurrenceVirtual && row.occurrence && p.settingId) {
                        const { modifyOccurrence } = await import(
                          "@/lib/lifeos/services/recurrence-service"
                        );
                        await run(
                          modifyOccurrence(
                            row.occurrence.ruleId,
                            row.occurrence.occurrenceKey,
                            row.occurrence.originalDate,
                            { overridePeriodSettingId: p.settingId }
                          ),
                          { quiet: true }
                        );
                      } else if (row.entry) {
                        await run(setEntryPeriodBySetting(row.entry.id, p.settingId ?? null), {
                          quiet: true,
                        });
                      }
                    }}
                  >
                    {periodName(p.name)}
                    {periodOfRow?.id === p.id ? " ·" : ""}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    if (isOccurrenceVirtual && row.occurrence) {
                      const { modifyOccurrence } = await import(
                        "@/lib/lifeos/services/recurrence-service"
                      );
                      await run(
                        modifyOccurrence(
                          row.occurrence.ruleId,
                          row.occurrence.occurrenceKey,
                          row.occurrence.originalDate,
                          { overridePeriodSettingId: undefined }
                        ),
                        { quiet: true }
                      );
                    } else if (row.entry) {
                      await run(setEntryPeriodBySetting(row.entry.id, null), { quiet: true });
                    }
                  }}
                >
                  {t("entry.unplaced")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => setTimesOpen(true)}>
              <Clock className="h-3.5 w-3.5" /> {t("entry.timeDuration")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMoveDayOpen(true)}>
              <CalendarDays className="h-3.5 w-3.5" /> {t("entry.moveToAnotherDay")}
            </DropdownMenuItem>
            {(isOccurrenceVirtual && row.occurrence) || materializedRecurring ? (
              /* v1.3 "مش النهارده" — the gentle way out (سفر/مرض/عزومة):
                 today's occurrence simply isn't there; the rule keeps
                 breathing and tomorrow arrives untouched. v1.3.1: it covers
                 materialized recurring rows too (cancel + lift today's twin
                 in one gesture), and it is never a dead end — the toast
                 carries a quiet undo. */
              <DropdownMenuItem
                onClick={async () => {
                  if (isOccurrenceVirtual && row.occurrence) {
                    await run(
                      cancelOccurrence(
                        row.occurrence.ruleId,
                        row.occurrence.occurrenceKey,
                        row.occurrence.originalDate
                      )
                    );
                    return;
                  }
                  const key = row.entry?.occurrenceKey;
                  if (!row.entry || !key) return;
                  const parsed = parseOccurrenceKey(key);
                  if (!parsed) return;
                  const ruleId = rule?.id ?? parsed.ruleRootId;
                  const cancelRes = await run(
                    cancelOccurrence(ruleId, key, parsed.originalDate),
                    { quiet: true }
                  );
                  const removeRes = await run(
                    removeEntryFromDay(row.entry.id),
                    { quiet: true }
                  );
                  const cancelUndo = cancelRes.ok ? cancelRes.value.undo : undefined;
                  const removeUndo = removeRes.ok ? removeRes.value.undo : undefined;
                  if (cancelUndo && removeUndo) {
                    const combined: UndoCommand = {
                      label: t("entry.notTodayToast"),
                      undo: async () => {
                        await removeUndo.undo();
                        await cancelUndo.undo();
                      },
                    };
                    pushUndo(combined);
                    toastWithUndo(combined);
                  }
                }}
              >
                <Coffee className="h-3.5 w-3.5" /> {t("entry.notToday")}
              </DropdownMenuItem>
            ) : null}
            {(isOccurrenceVirtual && row.occurrence) || (materializedRecurring && rule) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    if (!rule) return;
                    const originalDate =
                      row.occurrence?.originalDate ??
                      parseOccurrenceKey(row.entry?.occurrenceKey ?? "")?.originalDate;
                    if (!originalDate) return;
                    await run(endRuleBefore(rule.id, originalDate), {
                      success: t("entry.repeatsEndToast"),
                    });
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> {t("entry.stopRepeatingFromHere")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!rule) return;
                    await run(disableRule(rule.id), { success: t("entry.repeatStoppedToast") });
                  }}
                >
                  <X className="h-3.5 w-3.5" /> {t("entry.stopAllRepeats")}
                </DropdownMenuItem>
              </>
            ) : null}
            {row.entry && !row.entry.occurrenceKey ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await run(removeEntryFromDay(row.entry!.id), {
                      success: t("entry.removedFromTodayToast"),
                    });
                  }}
                  className="text-[#a5533c] focus:text-[#a5533c]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("entry.removeFromToday")}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EntryTimesDialog open={timesOpen} onOpenChange={setTimesOpen} row={row} />
      <MoveDayDialog
        open={moveDayOpen}
        onOpenChange={setMoveDayOpen}
        row={row}
        dateFormat={dateFormat}
      />
    </div>
  );
}

async function cycleEntry(entryId: string, next: "pending" | "completed" | "skipped" | "partial") {
  const { setExecutionStatus } = await import("@/lib/lifeos/services/planning-service");
  return setExecutionStatus(entryId, next);
}

export { proposePeriodSettingId };

function EntryTimesDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: TodayRow;
}) {
  const { t } = useT();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [duration, setDuration] = useState("");
  useEffect(() => {
    if (open) {
      setStart(row.startTime ?? "");
      setEnd(row.endTime ?? "");
      setDuration(row.durationMinutes ? String(row.durationMinutes) : "");
    }
  }, [open, row.startTime, row.endTime, row.durationMinutes]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{t("entry.timeDuration")}</DialogTitle>
          <DialogDescription>{t("entry.timeDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-ink-soft">{t("entry.start")}</span>
            <Input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-xl border-border bg-surface"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-ink-soft">{t("entry.end")}</span>
            <Input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-xl border-border bg-surface"
            />
          </label>
          <label className="col-span-2 grid gap-1.5">
            <span className="text-[12px] font-medium text-ink-soft">{t("entry.durationLabel")}</span>
            <Input
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={t("entry.durationExample")}
              className="rounded-xl border-border bg-surface"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={async () => {
              const patch: Parameters<typeof updateEntryTimes>[1] = {
                startTime: start,
                endTime: end,
                durationMinutes: duration ? Number(duration) : undefined,
              };
              if (row.entry) {
                await run(updateEntryTimes(row.entry.id, patch), { quiet: true });
              } else if (row.occurrence) {
                const { modifyOccurrence } = await import(
                  "@/lib/lifeos/services/recurrence-service"
                );
                await run(
                  modifyOccurrence(
                    row.occurrence.ruleId,
                    row.occurrence.occurrenceKey,
                    row.occurrence.originalDate,
                    {
                      overrideStartTime: start || undefined,
                      overrideEndTime: end || undefined,
                      overrideDurationMinutes: duration ? Number(duration) : undefined,
                    }
                  ),
                  { quiet: true }
                );
              }
              onOpenChange(false);
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- move to another day ---------- */

function MoveDayDialog({
  open,
  onOpenChange,
  row,
  dateFormat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: TodayRow;
  dateFormat: string;
}) {
  const { t } = useT();
  const [date, setDate] = useState("");
  useEffect(() => {
    if (open) setDate("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{t("entry.moveToAnotherDay")}</DialogTitle>
          <DialogDescription>
            {t("entry.moveDialogDesc")}
          </DialogDescription>
        </DialogHeader>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border-border bg-surface"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!isValidDateString(date)}
            onClick={async () => {
              if (!isValidDateString(date)) return;
              if (row.entry) {
                await run(moveEntryToDay(row.entry.id, date), {
                  success: t("entry.movedToast", {
                    date: formatDate(date, dateFormat as "dmy" | "mdy" | "ymd"),
                  }),
                });
              } else if (row.occurrence) {
                const { modifyOccurrence } = await import(
                  "@/lib/lifeos/services/recurrence-service"
                );
                await run(
                  modifyOccurrence(
                    row.occurrence.ruleId,
                    row.occurrence.occurrenceKey,
                    row.occurrence.originalDate,
                    { overrideDate: date }
                  ),
                  { success: t("entry.movedToast", {
                    date: formatDate(date, dateFormat as "dmy" | "mdy" | "ymd"),
                  }) }
                );
              }
              onOpenChange(false);
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {t("entry.move")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
