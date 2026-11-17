/* Spaces screens — external memory, personal notebooks (§3.3, §14.4). */

"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useSpaceData, useSpaces, useViewPrefs } from "@/lib/lifeos/hooks";
import { run } from "@/lib/lifeos/run";
import {
  archiveSpace,
  createSpace,
  restoreSpace,
  spaceNameExists,
  updateSpace,
} from "@/lib/lifeos/services/space-service";
import { removeSpaceLink } from "@/lib/lifeos/services/item-service";
import type { Item, Space } from "@/lib/lifeos/types";
import { t, typeLabel, useT } from "@/lib/lifeos/i18n";
import {
  Card,
  Chip,
  EmptyState,
  PageHeader,
  SectionLabel,
  StatusChip,
} from "../shared/primitives";
import { AddToTodayDialog, ItemPickerDialog, MoveToSpaceDialog } from "../shared/dialogs";
import { cn } from "@/lib/utils";

const COPY_SUGGESTIONS_EN = [
  "Learning English",
  "Reading",
  "Personal growth",
  "Home & family",
  "Health",
];
void COPY_SUGGESTIONS_EN;

export function SpacesScreen() {
  const spaces = useSpaces();
  const navigate = useUIStore((s) => s.navigate);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const { t } = useT();
  const [createOpen, setCreateOpen] = useState(false);

  const copySuggestions = [
    t("spaces.sugg1"),
    t("spaces.sugg2"),
    t("spaces.sugg3"),
    t("spaces.sugg4"),
    t("spaces.sugg5"),
  ];

  if (!spaces) {
    return (
      <div className="py-16 text-center font-serif italic text-muted-foreground">
        {t("spaces.opening")}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("spaces.title")}
        subtitle={t("spaces.subtitle")}
        actions={
          <Button
            size="sm"
            className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            onClick={() => setCreateOpen(true)}
          >
            <FolderPlus className="h-4 w-4" /> {t("spaces.newSpace")}
          </Button>
        }
      />

      {spaces.active.length === 0 ? (
        <Card className="px-6 py-10">
          <EmptyState
            message={t("spaces.empty")}
            action={
              <div className="flex flex-wrap justify-center gap-1.5">
                {copySuggestions.map((s) => (
                  <Chip
                    key={s}
                    tone="terracotta"
                    onClick={() => setCreateOpen(true)}
                  >
                    {s}
                  </Chip>
                ))}
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {spaces.active.map((space) => (
            <SpaceCard key={space.id} space={space} />
          ))}
        </div>
      )}

      {spaces.archived.length > 0 ? (
        <div className="mt-6">
          <SectionLabel>{t("spaces.archivedSpaces")}</SectionLabel>
          <ul className="mt-1.5 space-y-1">
            {spaces.archived.map((space) => (
              <li
                key={space.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface/60 px-3 py-2"
              >
                <span className="truncate font-serif text-[14.5px] text-muted-foreground">
                  {space.name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full text-[12px] text-muted-foreground"
                  onClick={() => run(restoreSpace(space.id), { success: t("spaces.restoredToast") })}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" /> {t("archived.restore")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <CreateSpaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <button
        type="button"
        className="hidden"
        onClick={() => openQuickAdd({ source: "global" })}
        aria-hidden
      />
    </div>
  );
}

function SpaceCard({ space }: { space: Space }) {
  const navigate = useUIStore((s) => s.navigate);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const { t } = useT();
  return (
    <div className="group rounded-2xl border border-border bg-surface px-4 py-3.5 transition-shadow hover:shadow-[var(--shadow-warm)]">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate({ name: "space", spaceId: space.id })}
          className="min-w-0 flex-1 text-start"
        >
          <h3 className="truncate font-serif text-[17px] text-ink">
            <BookOpen className="me-1.5 inline h-4 w-4 text-primary/70" />
            {space.name}
          </h3>
          {space.description ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
              {space.description}
            </p>
          ) : null}
        </button>
        <SpaceMenu space={space} />
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11.5px] text-muted-foreground">
          {space.color ? (
            <span
              className="me-2 inline-block h-2 w-2 rounded-full align-middle"
              style={{ background: "var(--primary)" }}
              aria-hidden
            />
          ) : null}
          {t("spaces.shelfNote")}
        </span>
        <button
          type="button"
          onClick={() =>
            openQuickAdd({ source: "space", spaceId: space.id })
          }
          className="rounded-full px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-primary-soft/35 hover:text-primary-deep"
        >
          {t("spaces.addPlus")}
        </button>
      </div>
    </div>
  );
}

function SpaceMenu({ space }: { space: Space }) {
  const [editOpen, setEditOpen] = useState(false);
  const { t } = useT();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground"
            aria-label={t("spaces.options")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl border-border bg-surface-raised">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> {t("spaces.rename")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await run(archiveSpace(space.id), {
                success: t("spaces.archivedToast"),
              });
            }}
          >
            <Archive className="h-3.5 w-3.5" /> {t("spaces.archiveSpace")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditSpaceDialog open={editOpen} onOpenChange={setEditOpen} space={space} />
    </>
  );
}

/* ---------- space detail ---------- */

export function SpaceScreen({ spaceId }: { spaceId: string }) {
  const data = useSpaceData(spaceId);
  const navigate = useUIStore((s) => s.navigate);
  const openItem = useUIStore((s) => s.openItem);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const setTodayDate = useUIStore((s) => s.setTodayDate);
  const prefs = useViewPrefs();
  const { t } = useT();
  const [pickOpen, setPickOpen] = useState(false);
  const [addTodayFor, setAddTodayFor] = useState<Item | null>(null);
  const [filter, setFilter] = useState<string>("all");

  if (data === undefined) {
    return (
      <div className="py-16 text-center font-serif italic text-muted-foreground">
        {t("spaces.openingSpace")}
      </div>
    );
  }
  if (data === null) {
    return (
      <Card className="px-6 py-10">
        <EmptyState
          message={t("spaces.notHere")}
          action={
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => navigate({ name: "spaces" })}
            >
              {t("spaces.backToSpaces")}
            </Button>
          }
        />
      </Card>
    );
  }

  const { space, items, todayItemIds, weekItemIds } = data;
  const filtered = items.filter((i) =>
    filter === "all"
      ? true
      : filter === "active"
        ? i.status === "active" || i.status === "in_progress"
        : filter === "done"
          ? i.status === "completed" || i.status === "cancelled"
          : i.type === filter
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate({ name: "spaces" })}
        className="mb-2 text-[12.5px] text-muted-foreground hover:text-ink-soft"
      >
        ← {t("spaces.allSpaces")}
      </button>
      <PageHeader
        title={space.name}
        subtitle={space.description || t("spaces.shelfOfItsOwn")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-full border-border bg-surface text-[12.5px]"
              onClick={() => setPickOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" /> {t("period.addExisting")}
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
              onClick={() => openQuickAdd({ source: "space", spaceId })}
            >
              <Plus className="h-4 w-4" /> {t("spaces.newHere")}
            </Button>
          </>
        }
      />

      {(todayItemIds.size > 0 || weekItemIds.size > 0) && prefs ? (
        <div className="mb-4 rounded-xl border border-border/70 bg-surface-context/70 px-4 py-2.5">
          <SectionLabel>{t("spaces.inYourPlans")}</SectionLabel>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {items
              .filter((i) => todayItemIds.has(i.id))
              .map((i) => (
                <Chip
                  key={`t-${i.id}`}
                  tone="terracotta"
                  onClick={() => {
                    setTodayDate(new Date().toISOString().slice(0, 10));
                    navigate({ name: "today" });
                  }}
                >
                  {t("spaces.todayChip", { title: i.title })}
                </Chip>
              ))}
            {items
              .filter((i) => weekItemIds.has(i.id))
              .map((i) => (
                <Chip key={`w-${i.id}`} tone="lavender" onClick={() => navigate({ name: "weekly" })}>
                  {t("spaces.weekChip", { title: i.title })}
                </Chip>
              ))}
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["all", t("spaces.filterAll")],
            ["active", t("spaces.filterActive")],
            ["done", t("spaces.filterDone")],
            ["task", typeLabel("task")],
            ["project", typeLabel("project")],
            ["note", typeLabel("note")],
            ["idea", typeLabel("idea")],
          ] as const
        ).map(([key, label]) => (
          <Chip
            key={key}
            tone={filter === key ? "terracotta" : "neutral"}
            onClick={() => setFilter(key)}
          >
            {label}
          </Chip>
        ))}
      </div>

      <Card className="px-2 py-1.5 md:px-3">
        {filtered.length === 0 ? (
          <EmptyState
            message={
              items.length === 0
                ? t("spaces.firstThought")
                : t("spaces.nothingMatches")
            }
            action={
              items.length === 0 ? (
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => openQuickAdd({ source: "space", spaceId })}
                >
                  {t("spaces.beginHere")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-t border-border/60 px-2 py-2.5 first:border-t-0 md:px-2.5"
              >
                <button
                  type="button"
                  onClick={() => openItem(item.id)}
                  className="min-w-0 flex-1 text-start"
                >
                  <span
                    className={cn(
                      "block truncate text-[14.5px]",
                      item.status === "completed" || item.status === "cancelled"
                        ? "text-muted-foreground"
                        : "text-foreground"
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1.5">
                    <Chip tone="neutral">{typeLabel(item.type)}</Chip>
                    <StatusChip status={item.status} />
                    {todayItemIds.has(item.id) ? <Chip tone="terracotta">{t("common.today")}</Chip> : null}
                    {weekItemIds.has(item.id) ? <Chip tone="lavender">{t("weekly.thisWeek")}</Chip> : null}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-2.5 text-[12px] text-muted-foreground"
                    onClick={() => setAddTodayFor(item)}
                  >
                    {t("nav.today")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground/60 hover:text-[#a5533c]"
                    aria-label={t("spaces.removeFromSpace")}
                    title={t("spaces.removeFromSpaceHint")}
                    onClick={async () => {
                      const link = data.links.find((l) => l.itemId === item.id);
                      if (link)
                        await run(removeSpaceLink(link.id), {
                          success: t("spaces.removedFromToast", { name: space.name }),
                        });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ItemPickerDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        title={t("spaces.addToSpace", { name: space.name })}
        description={t("spaces.linkNote")}
        onPick={async (item) => {
          const { addItemToSpace } = await import("@/lib/lifeos/services/item-service");
          await run(addItemToSpace(item.id, spaceId), {
            success: t("spaces.nowLivesHere", { title: item.title }),
          });
        }}
      />
      <AddToTodayDialog
        open={addTodayFor !== null}
        onOpenChange={(o) => setAddTodayFor(o ? addTodayFor : null)}
        itemTitle={addTodayFor?.title}
        onConfirm={async (choice) => {
          if (!addTodayFor) return;
          const { addEntryToDay, setEntryPeriodBySetting } = await import(
            "@/lib/lifeos/services/planning-service"
          );
          const res = await run(
            addEntryToDay({
              date: choice.date,
              kind: "item",
              itemId: addTodayFor.id,
              startTime: choice.startTime,
              allowMultiple: true,
            }),
            { quiet: true }
          );
          if (res.ok && choice.periodSettingId) {
            await run(setEntryPeriodBySetting(res.value.id, choice.periodSettingId), {
              quiet: true,
            });
          }
        }}
      />
    </div>
  );
}

/* ---------- dialogs ---------- */

function CreateSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useUIStore((s) => s.navigate);
  const { t } = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setName("");
          setDescription("");
          setWarn(null);
        }
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{t("spaces.newSpace")}</DialogTitle>
          <DialogDescription>
            {t("spaces.createDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
          dir="auto"
            autoFocus
            value={name}
            onChange={async (e) => {
              setName(e.target.value);
              setWarn(
                e.target.value.trim() && (await spaceNameExists(e.target.value))
                  ? t("spaces.nameExistsWarn")
                  : null
              );
            }}
            placeholder={t("spaces.namePlaceholder")}
            className="h-11 rounded-xl border-border bg-surface"
          />
          <Textarea
          dir="auto"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("spaces.descPlaceholder")}
            className="min-h-[64px] rounded-xl border-border bg-surface"
          />
          {warn ? (
            <p className="text-[12.5px] text-[#a5533c]">{warn}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!name.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await run(createSpace({ name, description }), { quiet: true });
                if (res.ok) {
                  const { toast } = await import("sonner");
                  toast(t("spaces.readyToast", { name: res.value.name }));
                  onOpenChange(false);
                  navigate({ name: "space", spaceId: res.value.id });
                }
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {t("spaces.createSpace")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSpaceDialog({
  open,
  onOpenChange,
  space,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: Space;
}) {
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description ?? "");
  const { t } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{t("spaces.editSpace")}</DialogTitle>
          <DialogDescription>{t("spaces.renameNote")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
          dir="auto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-xl border-border bg-surface"
          />
          <Textarea
            dir="auto"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[64px] rounded-xl border-border bg-surface"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              const res = await run(updateSpace(space.id, { name, description }), { quiet: true });
              if (res.ok) onOpenChange(false);
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

export { MoveToSpaceDialog };
