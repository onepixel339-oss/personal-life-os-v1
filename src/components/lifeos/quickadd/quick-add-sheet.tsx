/* Quick Add — persistent, minimal, context-aware (§3.13).
   Title only is valid; defaults never force scheduling or categorization. */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useUIStore, type QuickAddContext } from "@/lib/lifeos/ui-store";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";
import { todayLocal, weekdayName } from "@/lib/lifeos/dates";
import { weekStart, addDays } from "@/lib/lifeos/dates";
import type { ItemType, RecurrencePattern } from "@/lib/lifeos/types";
import { mediaTypeLabel, periodName, t, typeLabel, useT } from "@/lib/lifeos/i18n";
import { run } from "@/lib/lifeos/run";
import { createItem } from "@/lib/lifeos/services/item-service";
import { addItemToSpace } from "@/lib/lifeos/services/item-service";
import { capture } from "@/lib/lifeos/services/inbox-service";
import { addEntryToDay, addEntryToWeek } from "@/lib/lifeos/services/planning-service";
import { createNote } from "@/lib/lifeos/services/note-service";
import { createMedia } from "@/lib/lifeos/services/entertainment-service";
import { createRule } from "@/lib/lifeos/services/recurrence-service";
import { deleteItemPermanently } from "@/lib/lifeos/services/item-service";
import { toastWithUndo } from "@/lib/lifeos/run";
import { useViewPrefs } from "@/lib/lifeos/hooks";
import { cn } from "@/lib/utils";

const TYPE_CHIPS: ItemType[] = [
  "task",
  "activity",
  "event",
  "idea",
  "note",
  "project",
  "entertainment",
];

export function QuickAddSheet() {
  const open = useUIStore((s) => s.quickAddOpen);
  const context = useUIStore((s) => s.quickAddContext);
  const closeQuickAdd = useUIStore((s) => s.closeQuickAdd);
  const openItem = useUIStore((s) => s.openItem);
  const prefs = useViewPrefs();
  const { t } = useT();

  const [title, setTitle] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState<ItemType | "unsorted">("unsorted");
  const [description, setDescription] = useState("");
  const [spaceId, setSpaceId] = useState<string>("none");
  const [today, setToday] = useState<string>("");
  const [period, setPeriod] = useState<string>("none");
  const [time, setTime] = useState("");
  const [week, setWeek] = useState<string>("");
  const [weekDay, setWeekDay] = useState<string>("none");
  const [repeat, setRepeat] = useState<string>("none");
  const [mediaType, setMediaType] = useState("series");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);

  const spaces = useLiveQuery(() => db.spaces.filter((s) => !s.archivedAt).toArray(), []);
  const periodSettings = useLiveQuery(
    () => db.periodSettings.orderBy("order").filter((p) => p.enabled).toArray(),
    []
  );

  // context-aware defaults (§3.13 table)
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setExpanded(false);
    setDescription("");
    setSpaceId("none");
    setToday("");
    setPeriod("none");
    setTime("");
    setWeek("");
    setWeekDay("none");
    setRepeat("none");
    setMediaType("series");
    switch (context.source) {
      case "today":
        setToday(context.date);
        setPeriod(context.periodSettingId ?? "none");
        setType("unsorted");
        break;
      case "weekly":
        setWeek(context.weekStart);
        setWeekDay(context.day ?? "none");
        setType("unsorted");
        break;
      case "space":
        setSpaceId(context.spaceId);
        setType("unsorted");
        break;
      case "notes":
        setType("note");
        break;
      case "entertainment":
        setType("entertainment");
        break;
      case "inbox":
      case "global":
      default:
        setType("unsorted");
        break;
    }
  }, [open, context]);

  const weekDays = useMemo(() => {
    if (!week) return [];
    return Array.from({ length: 7 }, (_, i) => addDays(week, i));
  }, [week]);

  const save = async (keepOpen: boolean) => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      let itemId: string | null = null;
      let placementLabel = "";
      if (context.source === "inbox" || context.source === "global") {
        if (type === "unsorted" && !expanded) {
          const res = await capture(trimmed, description || undefined);
          if (!res.ok) return;
          itemId = res.value.id;
          placementLabel = t("qa.addedInbox");
        } else if (type === "note") {
          const res = await createNote({ title: trimmed, content: description || undefined });
          if (!res.ok) return;
          itemId = res.value.itemId;
          placementLabel = t("qa.noteAdded");
        } else if (type === "entertainment") {
          const res = await createMedia({
            title: trimmed,
            mediaType: mediaType as "movie" | "series" | "anime" | "game",
            progressStatus: "planned",
          });
          if (!res.ok) return;
          itemId = res.value.itemId;
          placementLabel = t("qa.addedEntertainment");
        } else {
          const res = await createItem({ type: type as ItemType, title: trimmed, description });
          if (!res.ok) return;
          itemId = res.value.id;
          placementLabel = t("qa.addedInbox");
          await run(
            (await import("@/lib/lifeos/services/inbox-service")).returnItemToInbox(itemId),
            { quiet: true }
          );
        }
      } else if (type === "note") {
        const res = await createNote({ title: trimmed, content: description || undefined });
        if (!res.ok) return;
        itemId = res.value.itemId;
        placementLabel = t("qa.noteAdded");
      } else if (type === "entertainment") {
        const res = await createMedia({
          title: trimmed,
          mediaType: mediaType as "movie" | "series" | "anime" | "game",
          progressStatus: "planned",
        });
        if (!res.ok) return;
        itemId = res.value.itemId;
        placementLabel = t("qa.addedEntertainment");
      } else {
        const res = await createItem({
          type: type === "unsorted" ? "unsorted" : (type as ItemType),
          title: trimmed,
          description,
        });
        if (!res.ok) return;
        itemId = res.value.id;
        placementLabel = t("qa.saved");
      }
      if (!itemId) return;
      const finalItemId = itemId;
      // Recurrence decision — computed ONCE and shared by placement and rule
      // creation: when a rule will exist, the rule itself carries the period
      // and the time (and generates today's occurrence), so we must NOT also
      // create a manual one-off placement — that duplicate row was the single
      // most confusing moment of the first session.
      const patternMap: Record<string, RecurrencePattern> = {
        daily: "daily",
        weekdays: "weekdays",
        weekly: "weekly",
        monthly: "monthly",
      };
      const repeatPattern = patternMap[repeat] as RecurrencePattern | undefined;
      const willRepeat =
        !!repeatPattern &&
        repeat !== "none" &&
        type !== "note" &&
        type !== "entertainment";
      // context placement
      if (context.source === "today" && today && !willRepeat) {
        const addRes = await run(
          addEntryToDay({
            date: today,
            kind: "item",
            itemId: finalItemId,
            startTime: time || undefined,
          }),
          { quiet: true }
        );
        if (addRes.ok && period !== "none") {
          const { setEntryPeriodBySetting } = await import(
            "@/lib/lifeos/services/planning-service"
          );
          await run(setEntryPeriodBySetting(addRes.value.id, period), { quiet: true });
        }
        placementLabel = t("qa.addedToday");
      }
      if (context.source === "weekly" && week && !willRepeat) {
        await run(
          addEntryToWeek({
            weekStartDate: week,
            itemId: finalItemId,
            scheduledDate: weekDay !== "none" ? weekDay : undefined,
          }),
          { quiet: true }
        );
        placementLabel = t("qa.addedWeek");
      }
      if (spaceId !== "none") {
        await run(addItemToSpace(finalItemId, spaceId), { quiet: true });
        placementLabel = t("qa.addedSpace");
      }
      // recurrence — the rule carries the period/time so every occurrence
      // (today's included) lands where the user chose, every single day.
      if (willRepeat && repeatPattern) {
        await run(
          createRule({
            itemId: finalItemId,
            pattern: repeatPattern,
            interval: 1,
            byWeekday: repeatPattern === "weekdays" ? [0, 1, 2, 3, 4] : undefined,
            byMonthDay: repeatPattern === "monthly" ? 1 : undefined,
            startDate: today || todayLocal(),
            startTime: time || undefined,
            periodSettingId: period !== "none" ? period : undefined,
            weekAnchor: ((prefs?.calendar.firstDayOfWeek ?? 6) as 0 | 1 | 2 | 3 | 4 | 5 | 6),
          }),
          { quiet: true }
        );
      }
      toastWithUndo({
        label: `${placementLabel} — “${trimmed}”`,
        undo: async () => {
          await deleteItemPermanently(finalItemId);
        },
      });
      (await import("@/lib/lifeos/services/history-service")).pushUndo({
        label: `${placementLabel} — “${trimmed}”`,
        undo: async () => {
          await deleteItemPermanently(finalItemId);
        },
      });
      if (keepOpen) {
        setTitle("");
        setDescription("");
        titleRef.current?.querySelector("input")?.focus();
      } else {
        closeQuickAdd();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : closeQuickAdd())}>
      <DialogContent
        className="max-w-lg rounded-2xl border-border bg-surface-raised p-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save(true);
          }
        }}
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="font-serif text-lg">{t("shell.quickAdd")}</DialogTitle>
          <DialogDescription>
            {t("qa.desc")}
          </DialogDescription>
        </DialogHeader>
        <div className="px-5" ref={titleRef}>
          <Input
          dir="auto"
            autoFocus
            value={title}
            placeholder={
              context.source === "today"
                ? t("qa.placeholderToday")
                : t("qa.placeholder")
            }
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                void save(false);
              }
            }}
            className="h-11 rounded-xl border-border bg-surface text-[15px]"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {TYPE_CHIPS.map((chipType) => (
              <button
                key={chipType}
                type="button"
                onClick={() => {
                  setType(type === chipType ? "unsorted" : chipType);
                  setExpanded(true);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                  type === chipType
                    ? "border-primary-soft bg-primary-soft/50 text-primary-deep"
                    : "border-border bg-surface text-muted-foreground hover:text-ink-soft"
                )}
              >
                {typeLabel(chipType)}
              </button>
            ))}
          </div>
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-ink-soft"
            >
              <ChevronDown className="h-3.5 w-3.5" /> {t("qa.more")}
            </button>
          ) : (
            <div className="mt-3 space-y-3">
              <Textarea
              dir="auto"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("qa.description")}
                className="min-h-[64px] rounded-xl border-border bg-surface"
              />
              {type === "entertainment" ? (
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] font-medium text-ink-soft">{t("qa.mediaType")}</span>
                  <Select value={mediaType} onValueChange={setMediaType}>
                    <SelectTrigger className="w-36 rounded-xl border-border bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border bg-surface-raised">
                      <SelectItem value="movie">{mediaTypeLabel("movie")}</SelectItem>
                      <SelectItem value="series">{mediaTypeLabel("series")}</SelectItem>
                      <SelectItem value="anime">{mediaTypeLabel("anime")}</SelectItem>
                      <SelectItem value="game">{mediaTypeLabel("game")}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
              <label className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-medium text-ink-soft">{t("nav.spaces")}</span>
                <Select
                  value={spaceId}
                  onValueChange={(v) => {
                    setSpaceId(v);
                  }}
                >
                  <SelectTrigger className="w-44 rounded-xl border-border bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-surface-raised">
                    <SelectItem value="none">{t("dialog.noSpace")}</SelectItem>
                    {(spaces ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-ink-soft">{t("qa.onADay")}</span>
                  <Input
                    type="date"
                    value={today}
                    onChange={(e) => setToday(e.target.value)}
                    className="w-36 rounded-xl border-border bg-surface"
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-ink-soft">{t("qa.period")}</span>
                  <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger className="w-36 rounded-xl border-border bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border bg-surface-raised">
                      <SelectItem value="none">{t("dialog.noPeriod")}</SelectItem>
                      {(periodSettings ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {periodName(p.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-ink-soft">{t("qa.time")}</span>
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-36 rounded-xl border-border bg-surface"
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-ink-soft">{t("qa.repeat")}</span>
                  <Select value={repeat} onValueChange={setRepeat}>
                    <SelectTrigger className="w-36 rounded-xl border-border bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border bg-surface-raised">
                      <SelectItem value="none">{t("qa.noRepeat")}</SelectItem>
                      <SelectItem value="daily">{t("notes.everyDay")}</SelectItem>
                      <SelectItem value="weekdays">{t("qa.weekdays")}</SelectItem>
                      <SelectItem value="weekly">{t("qa.weekly")}</SelectItem>
                      <SelectItem value="monthly">{t("qa.monthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
              {week || context.source === "weekly" ? (
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] font-medium text-ink-soft">
                    {t("weekly.dayOfThisWeek")}
                  </span>
                  <Select value={weekDay} onValueChange={setWeekDay}>
                    <SelectTrigger className="w-44 rounded-xl border-border bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-border bg-surface-raised">
                      <SelectItem value="none">{t("weekly.noDayYetShort")}</SelectItem>
                      {weekDays.map((d) => (
                        <SelectItem key={d} value={d}>
                          {weekdayName(d)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
            </div>
          )}
        </div>
        <DialogFooter className="mt-4 flex items-center justify-between gap-2 border-t border-border/70 px-5 py-3.5">
          <p className="text-[11.5px] text-muted-foreground">
            {t("qa.footerHint")}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeQuickAdd} className="rounded-full">
              {t("common.close")}
            </Button>
            <Button
              disabled={!title.trim() || busy}
              onClick={() => void save(false)}
              className="gap-1 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            >
              <Plus className="h-4 w-4" /> {t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { QuickAddContext };
