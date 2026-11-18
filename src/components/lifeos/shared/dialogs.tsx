/* Shared dialogs: confirm, pick item, add to today/week/space, delete impact. */

"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";
import { addDays, formatDate, isValidDateString, todayLocal } from "@/lib/lifeos/dates";
import type { Item, PeriodSetting } from "@/lib/lifeos/types";
import { typeLabel, periodName, t } from "@/lib/lifeos/i18n";
import { EmptyState } from "./primitives";
import { getDeleteImpact } from "@/lib/lifeos/services/item-service";
import { formatWeekRange } from "@/lib/lifeos/dates";
import { weekStart } from "@/lib/lifeos/dates";

/* ---------- confirm ---------- */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = t("common.confirm"),
  cancelLabel = t("common.cancel"),
  onConfirm,
  danger,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-[13.5px] leading-relaxed text-muted-foreground">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            autoFocus
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
            className={
              danger
                ? "rounded-full"
                : "rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            }
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- pick an existing item ---------- */

export function ItemPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  onPick,
  filter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onPick: (item: Item) => void;
  filter?: (item: Item) => boolean;
}) {
  const [query, setQuery] = useState("");
  const items = useLiveQuery(() => db.items.toArray(), []);
  const filtered = useMemo(() => {
    if (items === undefined) return [];
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.status !== "archived" && !i.archivedAt)
      .filter((i) => (filter ? filter(i) : true))
      .filter((i) =>
        q ? i.title.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q) : true
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40);
  }, [items, query, filter]);

  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <Input
        dir="auto"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("dialog.findByTitle")}
          className="rounded-xl border-border bg-surface"
        />
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyState message={t("dialog.noMatches")} compact />
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(item);
                      onOpenChange(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-surface-context"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-foreground">
                        {item.title}
                      </span>
                      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                        {typeLabel(item.type)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- add to today (choose date / period / time) ---------- */

export interface AddToTodayChoice {
  date: string;
  periodSettingId?: string;
  startTime?: string;
}

export function AddToTodayDialog({
  open,
  onOpenChange,
  onConfirm,
  title = t("dialog.addToDay"),
  itemTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (choice: AddToTodayChoice) => void | Promise<void>;
  title?: string;
  itemTitle?: string;
}) {
  const [date, setDate] = useState(todayLocal());
  const [period, setPeriod] = useState<string>("none");
  const [time, setTime] = useState("");
  const periodSettings = useLiveQuery(
    () =>
      db.periodSettings
        .orderBy("order")
        .filter((p: PeriodSetting) => p.enabled)
        .toArray(),
    []
  );
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDate(todayLocal());
      setPeriod("none");
      setTime("");
    }
  }
  const dateOk = isValidDateString(date);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">
            {itemTitle ? `“${itemTitle}” — ${title.toLowerCase()}` : title}
          </DialogTitle>
          <DialogDescription>
            {t("dialog.placementNote")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-ink-soft">{t("dialog.day")}</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border-border bg-surface"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-ink-soft">{t("dialog.periodOptional")}</span>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-full rounded-xl border-border bg-surface">
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
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-ink-soft">{t("dialog.timeOptional")}</span>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-xl border-border bg-surface"
              />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!dateOk}
            onClick={async () => {
              await onConfirm({
                date,
                periodSettingId: period === "none" ? undefined : period,
                startTime: time || undefined,
              });
              onOpenChange(false);
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {dateOk ? t("dialog.addToDate", { date: formatDate(date) }) : t("dialog.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- add to week ---------- */

export function AddToWeekDialog({
  open,
  onOpenChange,
  onConfirm,
  firstDayOfWeek,
  itemTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (weekStartDate: string) => void | Promise<void>;
  firstDayOfWeek: number;
  itemTitle?: string;
}) {
  const [date, setDate] = useState(todayLocal());
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setDate(todayLocal());
  }
  const targetWeek = weekStart(date, firstDayOfWeek);
  const dateOk = isValidDateString(date);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">
            {itemTitle ? `«${itemTitle}» — ${t("dialog.addToAWeek")}` : t("dialog.addToAWeek")}
          </DialogTitle>
          <DialogDescription>
            {t("dialog.weekNote")}
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-ink-soft">{t("dialog.anyDayOfWeek")}</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border-border bg-surface"
          />
        </label>
        <p className="text-[12.5px] text-muted-foreground">
          {t("dialog.week")}: {formatWeekRange(targetWeek, addDays(targetWeek, 6))}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!dateOk}
            onClick={async () => {
              await onConfirm(targetWeek);
              onOpenChange(false);
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {t("dialog.addToAWeek")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- move to space ---------- */

export function MoveToSpaceDialog({
  open,
  onOpenChange,
  onPick,
  itemTitle,
  showRemoveOption,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (spaceId: string) => void | Promise<void>;
  itemTitle?: string;
  showRemoveOption?: boolean;
}) {
  const spaces = useLiveQuery(
    () => db.spaces.filter((s) => !s.archivedAt).toArray(),
    []
  );
  const sorted = useMemo(
    () =>
      (spaces ?? []).sort((a, b) =>
        a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0
      ),
    [spaces]
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">
            {itemTitle ? `«${itemTitle}» — ${t("dialog.chooseSpace")}` : t("dialog.chooseSpace")}
          </DialogTitle>
          <DialogDescription>
            {t("dialog.spaceLinkNote")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto">
          {sorted.length === 0 ? (
            <EmptyState message={t("dialog.noSpacesYet")} compact />
          ) : (
            <ul className="flex flex-col gap-0.5">
              {sorted.map((space) => (
                <li key={space.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      await onPick(space.id);
                      onOpenChange(false);
                    }}
                    className="w-full rounded-xl px-3 py-2.5 text-start text-[14px] transition-colors hover:bg-surface-context"
                  >
                    {space.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {showRemoveOption ? (
          <p className="text-[12px] text-muted-foreground">
            {t("dialog.removeLinkHint")}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- delete with impact list (D19) ---------- */

export function DeleteItemDialog({
  open,
  onOpenChange,
  itemId,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string | null;
  onDeleted?: () => void;
}) {
  const [impact, setImpact] = useState<Awaited<ReturnType<typeof getDeleteImpact>>>(null);
  useEffect(() => {
    if (open && itemId) {
      void getDeleteImpact(itemId).then(setImpact);
    } else {
      setImpact(null);
    }
  }, [open, itemId]);

  const lines: string[] = [];
  if (impact) {
    if (impact.spaces.length) lines.push(t("dialog.impactSpaces", { count: impact.spaces.length, names: impact.spaces.join("، ") }));
    if (impact.onToday.length) lines.push(t("dialog.impactDays", { count: impact.onToday.length, example: formatDate(impact.onToday[impact.onToday.length - 1]) }));
    if (impact.onWeekly.length) lines.push(t("dialog.impactWeeks", { count: impact.onWeekly.length }));
    if (impact.inInbox) lines.push(t("dialog.impactInbox"));
    if (impact.relatedItems) lines.push(t("dialog.impactRelated", { count: impact.relatedItems }));
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={impact ? t("dialog.deleteTitle", { title: impact.item.title }) : t("dialog.deleteShort")}
      description={t("dialog.deleteDesc")}
      confirmLabel={t("dialog.deleteForever")}
      danger
      onConfirm={async () => {
        if (!itemId) return;
        const { deleteItemPermanently } = await import("@/lib/lifeos/services/item-service");
        const { run } = await import("@/lib/lifeos/run");
        const res = await run(deleteItemPermanently(itemId), { quiet: true });
        if (res.ok) {
          const { toast } = await import("sonner");
          toast(t("dialog.deletedToast", { title: res.value.title }));
          onDeleted?.();
        }
      }}
    >
      {lines.length ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-surface-context p-3 text-[13px] text-ink-soft">
          {lines.map((l, i) => (
            <li key={i}>· {l}</li>
          ))}
        </ul>
      ) : null}
    </ConfirmDialog>
  );
}

