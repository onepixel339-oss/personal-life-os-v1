/* Inbox screen — fastest capture, no organizing required (§3.4, §14.5). */

"use client";

import { useState } from "react";
import {
  ArrowRightLeft,
  CalendarPlus,
  Inbox as InboxIcon,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useInboxData, useViewPrefs } from "@/lib/lifeos/hooks";
import { run } from "@/lib/lifeos/run";
import { capture } from "@/lib/lifeos/services/inbox-service";
import { moveInboxItemToSpace, addInboxItemToToday, addInboxItemToWeek } from "@/lib/lifeos/services/inbox-service";
import { archiveItem, changeItemType } from "@/lib/lifeos/services/item-service";
import type { Item, ItemType } from "@/lib/lifeos/types";
import { t, typeLabel, useT } from "@/lib/lifeos/i18n";
import { formatDate, todayLocal } from "@/lib/lifeos/dates";
import {
  Card,
  Chip,
  EmptyState,
  PageHeader,
} from "../shared/primitives";
import {
  AddToTodayDialog,
  DeleteItemDialog,
  MoveToSpaceDialog,
} from "../shared/dialogs";
import { toast } from "sonner";

export function InboxScreen() {
  const data = useInboxData();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const openItem = useUIStore((s) => s.openItem);
  const prefs = useViewPrefs();
  const { t } = useT();
  const firstDay = prefs?.calendar.firstDayOfWeek ?? 6;

  const [spaceFor, setSpaceFor] = useState<Item | null>(null);
  const [todayFor, setTodayFor] = useState<Item | null>(null);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await run(capture(title), { quiet: true });
      if (res.ok) {
        setTitle("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("inbox.title")}
        subtitle={t("inbox.subtitle")}
      />

      <Card className="mb-4 px-3.5 py-3 md:px-5">
        <div className="flex items-center gap-2.5">
          <InboxIcon className="h-4.5 w-4.5 shrink-0 text-primary/70" />
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder={t("qa.placeholder")}
            className="h-10 rounded-xl border-transparent bg-transparent px-1 text-[15px] focus-visible:border-transparent focus-visible:ring-0"
          />
          <Button
            size="sm"
            className="h-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            disabled={!title.trim() || busy}
            onClick={() => void submit()}
          >
            <Plus className="h-4 w-4" />
            {t("inbox.capture")}
          </Button>
        </div>
      </Card>

      {data === undefined ? (
        <div className="py-10 text-center font-serif italic text-muted-foreground">
          {t("inbox.opening")}
        </div>
      ) : data.rows.length === 0 ? (
        <Card className="px-6 py-10">
          <EmptyState message={t("inbox.empty")} />
        </Card>
      ) : (
        <Card className="px-2 py-1.5 md:px-3">
          <ul className="flex flex-col">
            {data.rows.map(({ entry, item }) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 border-t border-border/60 px-2 py-2.5 first:border-t-0 md:px-2.5"
              >
                <button
                  type="button"
                  onClick={() => openItem(item.id)}
                  className="min-w-0 flex-1 text-start"
                >
                  <span className="block truncate text-[14.5px] text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1.5">
                    <Chip tone="muted">{t("entry.unsorted")}</Chip>
                    {item.description ? (
                      <span className="truncate text-[12px] text-muted-foreground">
                        {item.description.slice(0, 80)}
                      </span>
                    ) : null}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-2.5 text-[12px] text-muted-foreground"
                    onClick={() => setTodayFor(item)}
                  >
                    {t("nav.today")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-2.5 text-[12px] text-muted-foreground"
                    onClick={() => setSpaceFor(item)}
                  >
                    {t("inbox.toSpace")}
                  </Button>
                  <InboxRowMenu
                    item={item}
                    onMoveSpace={() => setSpaceFor(item)}
                    onAddToday={() => setTodayFor(item)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <MoveToSpaceDialog
        open={spaceFor !== null}
        onOpenChange={(o) => setSpaceFor(o ? spaceFor : null)}
        itemTitle={spaceFor?.title}
        onPick={async (spaceId) => {
          if (!spaceFor) return;
          await run(moveInboxItemToSpace(spaceFor.id, spaceId, true), {
            success: t("inbox.movedToSpaceToast"),
          });
        }}
      />
      <AddToTodayDialog
        open={todayFor !== null}
        onOpenChange={(o) => setTodayFor(o ? todayFor : null)}
        itemTitle={todayFor?.title}
        onConfirm={async (choice) => {
          if (!todayFor) return;
          const res = await run(
            addInboxItemToToday(todayFor.id, {
              date: choice.date,
              startTime: choice.startTime,
              alsoRemoveFromInbox: true,
            }),
            { quiet: true }
          );
          if (res.ok) {
            const { addEntryToDay: _unused } = await import(
              "@/lib/lifeos/services/planning-service"
            );
            void _unused;
            toast(t("inbox.placedOnToast", { date: formatDate(choice.date) }));
          }
        }}
      />
    </div>
  );
}

function InboxRowMenu({
  item,
  onMoveSpace,
  onAddToday,
}: {
  item: Item;
  onMoveSpace: () => void;
  onAddToday: () => void;
}) {
  const prefs = useViewPrefs();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { t } = useT();
  const firstDay = prefs?.calendar.firstDayOfWeek ?? 6;
  const openItem = useUIStore((s) => s.openItem);
  const navigate = useUIStore((s) => s.navigate);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground"
            aria-label={t("entry.options")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 rounded-xl border-border bg-surface-raised">
          <DropdownMenuItem onClick={() => openItem(item.id)}>
            {t("inbox.openEdit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onMoveSpace}>
            <ArrowRightLeft className="h-3.5 w-3.5" /> {t("inbox.moveToSpace")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onAddToday}>
            <CalendarPlus className="h-3.5 w-3.5" /> {t("inbox.addToDay")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              const { addEntryToWeek } = await import(
                "@/lib/lifeos/services/planning-service"
              );
              const [y, m, d] = todayLocal().split("-").map(Number);
              const date = new Date(Date.UTC(y, m - 1, d));
              const dow = date.getUTCDay();
              const thisWeekStart = new Date(date);
              thisWeekStart.setUTCDate(date.getUTCDate() - ((dow - firstDay + 7) % 7));
              const weekStartStr = `${thisWeekStart.getUTCFullYear()}-${String(
                thisWeekStart.getUTCMonth() + 1
              ).padStart(2, "0")}-${String(thisWeekStart.getUTCDate()).padStart(2, "0")}`;
              const res = await run(addInboxItemToWeek(item.id, weekStartStr, true), {
                quiet: true,
              });
              if (res.ok) toast(t("inbox.addedToWeekToast"));
            }}
          >
            <CalendarPlus className="h-3.5 w-3.5" /> {t("inbox.addToThisWeek")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            {t("inbox.categorize")}
          </div>
          {(["task", "activity", "event", "idea", "note", "project", "entertainment"] as ItemType[]).map(
            (type) => (
              <DropdownMenuItem
                key={type}
                onClick={async () => {
                  if (type === "entertainment") {
                    const { createMedia } = await import(
                      "@/lib/lifeos/services/entertainment-service"
                    );
                    const res = await run(
                      createMedia({
                        title: item.title,
                        mediaType: "series",
                        progressStatus: "planned",
                      }),
                      { quiet: true }
                    );
                    if (res.ok) {
                      const { deleteItemPermanently } = await import(
                        "@/lib/lifeos/services/item-service"
                      );
                      await deleteItemPermanently(item.id);
                      const { toast } = await import("sonner");
                      toast(t("inbox.nowEntertainment", { title: item.title }));
                    }
                  } else {
                    await run(changeItemType(item.id, type), { quiet: true });
                    const { toast } = await import("sonner");
                    toast(t("inbox.nowType", { title: item.title, type: typeLabel(type) }));
                  }
                }}
              >
                {t("inbox.makeItA", { type: typeLabel(type) })}
              </DropdownMenuItem>
            )
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await run(archiveItem(item.id), { success: t("inbox.archivedToast") });
            }}
          >
            {t("weekly.archive")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-[#a5533c] focus:text-[#a5533c]"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("inbox.deletePermanently")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteItemDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemId={item.id}
      />
    </>
  );
}
