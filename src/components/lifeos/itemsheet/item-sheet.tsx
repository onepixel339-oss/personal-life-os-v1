/* Item sheet — one item, all its appearances; identity is preserved (P3). */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Bookmark,
  BookmarkPlus,
  CalendarPlus,
  Clock,
  Eye,
  Film,
  Link2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/lifeos/db";
import { useItemDetail } from "@/lib/lifeos/hooks";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { run } from "@/lib/lifeos/run";
import { todayLocal } from "@/lib/lifeos/dates";
import type { ItemStatus, ItemType, MediaType, ProgressStatus } from "@/lib/lifeos/types";
import {
  VALID_STATUS_BY_TYPE,
  ENT_STATUS_MAP,
} from "@/lib/lifeos/types";
import { mediaTypeLabel, progressLabel, statusLabel, t, typeLabel, useT } from "@/lib/lifeos/i18n";
import {
  addItemToSpace,
  archiveItem,
  changeItemType,
  deleteItemPermanently,
  keepForLater,
  postponeItem,
  removeSpaceLink,
  restoreItem,
  setItemStatus,
  updateItem,
  addRelationship,
  removeRelationship,
} from "@/lib/lifeos/services/item-service";
import { createRule, disableRule, pauseRule, resumeRule } from "@/lib/lifeos/services/recurrence-service";
import { updateMedia } from "@/lib/lifeos/services/entertainment-service";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AddToTodayDialog,
  AddToWeekDialog,
  DeleteItemDialog,
  ItemPickerDialog,
  MoveToSpaceDialog,
} from "../shared/dialogs";
import { Chip, Divider, SectionLabel, StatusChip, TypeChip } from "../shared/primitives";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS: ItemType[] = [
  "task",
  "activity",
  "event",
  "idea",
  "note",
  "project",
  "entertainment",
  "outcome",
];

export function ItemSheet() {
  const itemId = useUIStore((s) => s.itemSheetItemId);
  const closeItem = useUIStore((s) => s.closeItem);
  const openItem = useUIStore((s) => s.openItem);
  const navigate = useUIStore((s) => s.navigate);
  const setTodayDate = useUIStore((s) => s.setTodayDate);
  const detail = useItemDetail(itemId);
  const spaces = useLiveQuery(() => db.spaces.filter((s) => !s.archivedAt).toArray(), []);
  const { t, lang } = useT();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addToday, setAddToday] = useState(false);
  const [addWeek, setAddWeek] = useState(false);
  const [addSpace, setAddSpace] = useState(false);
  const [pickRel, setPickRel] = useState<null | "parent" | "related" | "depends_on">(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [postponeOpen, setPostponeOpen] = useState(false);

  useEffect(() => {
    if (detail) {
      setTitle(detail.item.title);
      setDescription(detail.item.description ?? "");
    }
  }, [detail?.item.id]);

  useEffect(() => {
    if (!itemId) {
      setAddToday(false);
      setAddWeek(false);
      setAddSpace(false);
      setPickRel(null);
      setDeleteOpen(false);
      setRepeatOpen(false);
      setPostponeOpen(false);
    }
  }, [itemId]);

  const relsByType = useMemo(() => {
    if (!detail) return { subtasks: [], parents: [], related: [], dependsOn: [], blocks: [] };
    const map = new Map(detail.relatedItems.map((i) => [i.id, i]));
    const subtasks: typeof detail.relatedItems = [];
    const parents: typeof detail.relatedItems = [];
    const related: typeof detail.relatedItems = [];
    const dependsOn: typeof detail.relatedItems = [];
    const blocks: typeof detail.relatedItems = [];
    for (const rel of detail.rels) {
      const otherId = rel.sourceItemId === itemId ? rel.targetItemId : rel.sourceItemId;
      const other = map.get(otherId);
      if (!other) continue;
      if (rel.relationType === "parent") {
        // stored: source = child, target = parent
        if (rel.sourceItemId === itemId) parents.push(other);
        else subtasks.push(other);
      } else if (rel.relationType === "related") {
        related.push(other);
      } else if (rel.relationType === "depends_on") {
        if (rel.sourceItemId === itemId) dependsOn.push(other);
        else blocks.push(other);
      }
    }
    return { subtasks, parents, related, dependsOn, blocks };
  }, [detail, itemId]);

  if (!itemId || !detail) return null;
  const { item } = detail;
  const isEntertainment = item.type === "entertainment";
  const allowedStatuses = VALID_STATUS_BY_TYPE[item.type].filter((s) => s !== "archived");

  const commitEdits = async () => {
    const clean = title.trim();
    if (!clean) return;
    if (clean !== item.title || description !== (item.description ?? "")) {
      await run(updateItem(item.id, { title: clean, description }), { quiet: true });
    }
  };

  return (
    <Sheet open={!!itemId} onOpenChange={(o) => (o ? null : closeItem())}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-border bg-surface p-0 sm:max-w-md"
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-border/70 bg-surface/95 px-5 pb-3 pt-5 backdrop-blur">
          <SheetTitle className="sr-only">{t("item.srTitle")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("item.srDesc")}
          </SheetDescription>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <input
              dir="auto"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitEdits}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitEdits();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                aria-label={t("item.titleAria")}
                className="w-full bg-transparent font-serif text-[19px] leading-snug text-foreground outline-none focus:underline focus:decoration-primary/40"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <TypeChip type={item.type} />
                <StatusChip status={item.status} />
                <Chip tone="neutral">{t("item.created", {
                  date: new Date(item.createdAt).toLocaleDateString(
                    lang === "ar" ? "ar-EG" : undefined
                  ),
                })}</Chip>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
                  aria-label={t("item.moreActions")}
                >
                  <MoreHorizontal className="h-4.5 w-4.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl border-border bg-surface-raised">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("item.typeLabel")}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={async () => {
                    await run(changeItemType(item.id, "task"), { quiet: true });
                  }}
                >
                  {typeLabel("task")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await run(changeItemType(item.id, "activity"), { quiet: true });
                  }}
                >
                  {typeLabel("activity")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await run(changeItemType(item.id, "event"), { quiet: true });
                  }}
                >
                  {typeLabel("event")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await run(changeItemType(item.id, "idea"), { quiet: true });
                  }}
                >
                  {typeLabel("idea")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await run(changeItemType(item.id, "project"), { quiet: true });
                  }}
                >
                  {typeLabel("project")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await run(changeItemType(item.id, "note"), { quiet: true });
                  }}
                >
                  {typeLabel("note")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await run(changeItemType(item.id, "outcome"), { quiet: true });
                  }}
                >
                  {typeLabel("outcome")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await run(keepForLater(item.id), { success: t("item.keptToast") });
                  }}
                >
                  <BookmarkPlus className="h-3.5 w-3.5" /> {t("item.keepForLater")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPostponeOpen(true)}>
                  <Clock className="h-3.5 w-3.5" /> {t("weekly.postpone")}
                </DropdownMenuItem>
                {item.status === "archived" ? (
                  <DropdownMenuItem
                    onClick={async () => {
                      await run(restoreItem(item.id), { success: t("item.restoredToast") });
                    }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" /> {t("archived.restore")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={async () => {
                      await run(archiveItem(item.id), { success: t("item.archivedToast") });
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" /> {t("weekly.archive")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[#a5533c] focus:text-[#a5533c]"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("inbox.deletePermanently")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full text-muted-foreground"
              onClick={closeItem}
              aria-label={t("common.close")}
            >
              <X className="h-4.5 w-4.5" />
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-6 px-5 py-5">
          {/* description */}
          <section>
            <SectionLabel>{t("item.about")}</SectionLabel>
            <Textarea
            dir="auto"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitEdits}
              placeholder={t("item.aboutPlaceholder")}
              className="mt-1.5 min-h-[72px] rounded-xl border-border bg-surface"
            />
          </section>

          {/* status */}
          {!isEntertainment ? (
            <section>
              <SectionLabel>{t("item.status")}</SectionLabel>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {allowedStatuses.map((s) => (
                  <Chip
                    key={s}
                    tone={item.status === s ? "terracotta" : "neutral"}
                    onClick={async () => {
                      await run(setItemStatus(item.id, s as ItemStatus), { quiet: true });
                    }}
                  >
                    {statusLabel(s)}
                  </Chip>
                ))}
                <span className="self-center text-[11.5px] text-muted-foreground">
                  {t("item.placementNote")}
                </span>
              </div>
            </section>
          ) : null}

          {/* appearances */}
          <section>
            <SectionLabel>{t("item.appearsIn")}</SectionLabel>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {detail.spaces.map((space) => (
                <Chip
                  key={space.id}
                  tone="lavender"
                  title={t("item.openSpace")}
                  onClick={() => navigate({ name: "space", spaceId: space.id })}
                >
                  {space.name}
                  <button
                    type="button"
                    aria-label={t("item.removeFromAria", { name: space.name })}
                    className="ms-0.5 text-muted-foreground/70 hover:text-[#a5533c]"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const link = detail.links.find((l) => l.spaceId === space.id);
                      if (link) await run(removeSpaceLink(link.id), { success: t("item.removedFromSpaceToast") });
                    }}
                  >
                    ×
                  </button>
                </Chip>
              ))}
              {detail.inInbox ? <Chip tone="muted">{t("nav.inbox")}</Chip> : null}
              {detail.onToday.map((d) => (
                <Chip
                  key={`t${d}`}
                  tone="terracotta"
                  title={t("item.openThatDay")}
                  onClick={() => {
                    setTodayDate(d);
                    navigate({ name: "today" });
                  }}
                >
                  {t("item.todayChip", { date: d })}
                </Chip>
              ))}
              {detail.onWeekly.map((w) => (
                <Chip key={`w${w}`} tone="neutral">
                  {t("item.weekOfChip", { date: w })}
                </Chip>
              ))}
              {detail.spaces.length === 0 &&
              !detail.inInbox &&
              detail.onToday.length === 0 &&
              detail.onWeekly.length === 0 ? (
                <span className="text-[12.5px] italic text-muted-foreground">
                  {t("item.notPlaced")}
                </span>
              ) : null}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-border bg-surface text-[12px]"
                onClick={() => setAddToday(true)}
              >
                <CalendarPlus className="h-3.5 w-3.5" /> {t("item.addToDay")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-border bg-surface text-[12px]"
                onClick={() => setAddWeek(true)}
              >
                <CalendarPlus className="h-3.5 w-3.5" /> {t("dialog.addToAWeek")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-border bg-surface text-[12px]"
                onClick={() => setAddSpace(true)}
              >
                <Plus className="h-3.5 w-3.5" /> {t("item.addToSpace")}
              </Button>
            </div>
          </section>

          {/* type-specific details */}
          {isEntertainment && detail.entertainment ? (
            <EntertainmentFields
              itemId={item.id}
              details={detail.entertainment}
              itemTitle={item.title}
            />
          ) : null}
          {item.type === "note" && detail.note ? (
            <section>
              <SectionLabel>{t("item.noteSection")}</SectionLabel>
              <Button
                variant="outline"
                size="sm"
                className="mt-1.5 h-8 rounded-full border-border bg-surface text-[12px]"
                onClick={() => {
                  navigate({ name: "note", itemId: item.id });
                  closeItem();
                }}
              >
                <Pencil className="h-3.5 w-3.5" /> {t("item.openNoteEditor")}
              </Button>
            </section>
          ) : null}
          {item.type === "project" ? <ProjectFields itemId={item.id} /> : null}

          {/* relationships */}
          <section>
            <SectionLabel>{t("item.connections")}</SectionLabel>
            <div className="mt-1.5 space-y-2">
              <RelList
                label={t("item.subtasks")}
                items={relsByType.subtasks}
                onOpen={openItem}
                empty={t("item.noSubtasks")}
                onRemove={async (other) => {
                  const rel = detail.rels.find(
                    (r) =>
                      r.relationType === "parent" &&
                      r.sourceItemId === other &&
                      r.targetItemId === item.id
                  );
                  if (rel) await run(removeRelationship(rel.id), { quiet: true });
                }}
              />
              <RelList
                label={t("item.partOf")}
                items={relsByType.parents}
                onOpen={openItem}
                empty={t("item.notPartOf")}
                onRemove={async (other) => {
                  const rel = detail.rels.find(
                    (r) =>
                      r.relationType === "parent" &&
                      r.targetItemId === other &&
                      r.sourceItemId === item.id
                  );
                  if (rel) await run(removeRelationship(rel.id), { quiet: true });
                }}
              />
              <RelList
                label={t("item.related")}
                items={relsByType.related}
                onOpen={openItem}
                empty={t("item.nothingRelated")}
                onRemove={async (other) => {
                  const rel = detail.rels.find(
                    (r) =>
                      r.relationType === "related" &&
                      (r.sourceItemId === other || r.targetItemId === other)
                  );
                  if (rel) await run(removeRelationship(rel.id), { quiet: true });
                }}
              />
              <RelList
                label={t("item.waitingOn")}
                items={relsByType.dependsOn}
                onOpen={openItem}
                empty={t("item.noDeps")}
                hint={t("item.depsHint")}
                onRemove={async (other) => {
                  const rel = detail.rels.find(
                    (r) =>
                      r.relationType === "depends_on" &&
                      r.sourceItemId === item.id &&
                      r.targetItemId === other
                  );
                  if (rel) await run(removeRelationship(rel.id), { quiet: true });
                }}
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-border bg-surface text-[12px]"
                  onClick={() => setPickRel("parent")}
                >
                  <Plus className="h-3.5 w-3.5" /> {t("item.subtaskBtn")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-border bg-surface text-[12px]"
                  onClick={() => setPickRel("related")}
                >
                  <Link2 className="h-3.5 w-3.5" /> {t("item.relatedBtn")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-border bg-surface text-[12px]"
                  onClick={() => setPickRel("depends_on")}
                >
                  <Clock className="h-3.5 w-3.5" /> {t("item.dependsOnBtn")}
                </Button>
              </div>
            </div>
          </section>

          {/* recurrence */}
          {item.type !== "note" && item.type !== "entertainment" ? (
            <section>
              <div className="flex items-center justify-between">
                <SectionLabel>{t("item.repeats")}</SectionLabel>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full border-border bg-surface text-[11.5px]"
                  onClick={() => setRepeatOpen(true)}
                >
                  <Repeat className="h-3 w-3" /> {t("item.addRepeat")}
                </Button>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {detail.rules.length === 0 ? (
                  <p className="text-[12.5px] italic text-muted-foreground">
                    {t("item.doesntRepeat")}
                  </p>
                ) : (
                  detail.rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-context/60 px-3 py-2"
                    >
                      <span className="text-[13px] text-ink-soft">
                        {rule.pattern === "daily"
                          ? t("notes.everyDay")
                          : rule.pattern === "weekdays"
                            ? t("qa.weekdays")
                            : rule.pattern === "weekly"
                              ? t("item.everyWeeks", { count: rule.interval })
                              : t("item.everyMonths", { count: rule.interval })}
                        <span className="ms-2 text-[11px] text-muted-foreground">
                          {rule.state === "paused" ? `· ${t("item.pausedState")}` : rule.state === "disabled" ? `· ${t("item.stoppedState")}` : ""}
                        </span>
                      </span>
                      {rule.state === "active" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-full px-2 text-[11.5px] text-muted-foreground"
                          onClick={async () => {
                            await run(pauseRule(rule.id), { success: t("item.pausedToast") });
                          }}
                        >
                          <Pause className="h-3 w-3" /> {t("item.pause")}
                        </Button>
                      ) : rule.state === "paused" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-full px-2 text-[11.5px] text-muted-foreground"
                          onClick={async () => {
                            await run(resumeRule(rule.id), { success: t("item.resumedToast") });
                          }}
                        >
                          <Play className="h-3 w-3" /> {t("item.resume")}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-full px-2 text-[11.5px] text-muted-foreground"
                          onClick={async () => {
                            await run(resumeRule(rule.id), { success: t("item.reenabledToast") });
                          }}
                        >
                          <Undo2 className="h-3 w-3" /> {t("item.reenable")}
                        </Button>
                      )}
                    </div>
                  ))
                )}
                {detail.rules.some((r) => r.state !== "disabled") ? (
                  <button
                    type="button"
                    className="text-[11.5px] text-muted-foreground hover:text-[#a5533c]"
                    onClick={async () => {
                      await Promise.all(
                        detail.rules
                          .filter((r) => r.state !== "disabled")
                          .map((r) => disableRule(r.id))
                      );
                    }}
                  >
                    {t("item.stopAllRepeats")}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </SheetContent>

      {/* overlays */}
      <AddToTodayDialog
        open={addToday}
        onOpenChange={setAddToday}
        itemTitle={item.title}
        onConfirm={async (choice) => {
          const { addEntryToDay, setEntryPeriodBySetting } = await import(
            "@/lib/lifeos/services/planning-service"
          );
          const res = await run(
            addEntryToDay({
              date: choice.date,
              kind: "item",
              itemId: item.id,
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
        itemTitle={item.title}
        firstDayOfWeek={6}
        onConfirm={async (weekStartDate) => {
          const { addEntryToWeek } = await import("@/lib/lifeos/services/planning-service");
          await run(addEntryToWeek({ weekStartDate, itemId: item.id }), {
            success: t("qa.addedWeek"),
          });
        }}
      />
      <MoveToSpaceDialog
        open={addSpace}
        onOpenChange={setAddSpace}
        itemTitle={item.title}
        onPick={async (spaceId) => {
          await run(addItemToSpace(item.id, spaceId), { quiet: true });
        }}
      />
      <ItemPickerDialog
        open={pickRel !== null}
        onOpenChange={(o) => setPickRel(o ? pickRel : null)}
        title={
          pickRel === "parent"
            ? t("item.chooseSubtask")
            : pickRel === "related"
              ? t("item.chooseRelated")
              : t("item.dependsOnTitle")
        }
        description={t("item.linksOnlyNote")}
        onPick={async (other) => {
          if (!pickRel) return;
          if (pickRel === "parent") {
            await run(addRelationship(other.id, item.id, "parent"), {
              success: t("item.subtaskLinkedToast"),
            });
          } else if (pickRel === "related") {
            await run(addRelationship(item.id, other.id, "related"), {
              success: t("item.linkedRelatedToast"),
            });
          } else {
            await run(addRelationship(item.id, other.id, "depends_on"), {
              success: t("item.dependencyToast"),
            });
          }
        }}
      />
      <DeleteItemDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemId={item.id}
        onDeleted={closeItem}
      />
      <RepeatDialog
        open={repeatOpen}
        onOpenChange={setRepeatOpen}
        itemId={item.id}
        weekAnchor={6}
      />
      <PostponeDialog
        open={postponeOpen}
        onOpenChange={setPostponeOpen}
        itemId={item.id}
      />
    </Sheet>
  );
}

/* ---------- relationship list ---------- */

function RelList({
  label,
  items,
  onOpen,
  onRemove,
  empty,
  hint,
}: {
  label: string;
  items: { id: string; title: string }[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => void | Promise<void>;
  empty: string;
  hint?: string;
}) {
  if (items.length === 0 && !hint) return null;
  return (
    <div>
      <p className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {items.length === 0 ? (
        <p className="text-[12.5px] italic text-muted-foreground/80">
          {empty} {hint ? <span className="not-italic">({hint})</span> : null}
        </p>
      ) : (
        <ul className="mt-0.5 flex flex-wrap gap-1">
          {items.map((i) => (
            <li key={i.id}>
              <Chip onClick={() => onOpen(i.id)} title="Open">
                {i.title}
                <button
                  type="button"
                  aria-label="Remove link"
                  className="ml-0.5 text-muted-foreground/70 hover:text-[#a5533c]"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await onRemove(i.id);
                  }}
                >
                  ×
                </button>
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- entertainment fields ---------- */

function EntertainmentFields({
  itemId,
  details,
  itemTitle,
}: {
  itemId: string;
  details: { mediaType: MediaType; progressStatus: ProgressStatus; currentSeason?: number; currentEpisode?: number; totalSeasons?: number; nextEpisodeDate?: string; rating?: number };
  itemTitle: string;
}) {
  const { t } = useT();
  const [mediaType, setMediaType] = useState<MediaType>(details.mediaType);
  const [progress, setProgress] = useState<ProgressStatus>(details.progressStatus);
  const [season, setSeason] = useState(details.currentSeason?.toString() ?? "");
  const [episode, setEpisode] = useState(details.currentEpisode?.toString() ?? "");
  const [totalSeasons, setTotalSeasons] = useState(details.totalSeasons?.toString() ?? "");
  const [nextEpisode, setNextEpisode] = useState(details.nextEpisodeDate ?? "");
  const [rating, setRating] = useState(details.rating ?? 0);
  const [addSession, setAddSession] = useState(false);

  const save = () =>
    run(
      updateMedia(itemId, {
        mediaType,
        progressStatus: progress,
        currentSeason: season ? Number(season) : undefined,
        currentEpisode: episode ? Number(episode) : undefined,
        totalSeasons: totalSeasons ? Number(totalSeasons) : undefined,
        nextEpisodeDate: nextEpisode || undefined,
        rating: rating || undefined,
      }),
      { quiet: true }
    );

  return (
    <section>
      <div className="flex items-center justify-between">
        <SectionLabel>{t("ent.title")}</SectionLabel>
        <Button
          variant="outline"
          size="sm"
          className="h-7 rounded-full border-border bg-surface text-[11.5px]"
          onClick={() => setAddSession(true)}
        >
          <Eye className="h-3 w-3" /> {t("item.sessionToday")}
        </Button>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-[11.5px] font-medium text-ink-soft">{t("qa.mediaType")}</span>
          <Select
            value={mediaType}
            onValueChange={(v) => {
              setMediaType(v as MediaType);
              setTimeout(save, 0);
            }}
          >
            <SelectTrigger className="w-full rounded-xl border-border bg-surface">
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
        <label className="grid gap-1">
          <span className="text-[11.5px] font-medium text-ink-soft">{t("item.status")}</span>
          <Select
            value={progress}
            onValueChange={(v) => {
              setProgress(v as ProgressStatus);
              setTimeout(save, 0);
            }}
          >
            <SelectTrigger className="w-full rounded-xl border-border bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border bg-surface-raised">
              <SelectItem value="planned">{progressLabel("planned")}</SelectItem>
              <SelectItem value="in_progress">
                {mediaType === "game" ? t("ent.playing") : t("ent.watching")}
              </SelectItem>
              <SelectItem value="paused">{progressLabel("paused")}</SelectItem>
              <SelectItem value="completed">{progressLabel("completed")}</SelectItem>
              <SelectItem value="dropped">{progressLabel("dropped")}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {mediaType !== "movie" ? (
          <>
            <label className="grid gap-1">
              <span className="text-[11.5px] font-medium text-ink-soft">{t("item.season")}</span>
              <Input
                inputMode="numeric"
                value={season}
                onChange={(e) => setSeason(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={save}
                className="rounded-xl border-border bg-surface"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11.5px] font-medium text-ink-soft">{t("item.episode")}</span>
              <Input
                inputMode="numeric"
                value={episode}
                onChange={(e) => setEpisode(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={save}
                className="rounded-xl border-border bg-surface"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11.5px] font-medium text-ink-soft">{t("item.totalSeasons")}</span>
              <Input
                inputMode="numeric"
                value={totalSeasons}
                onChange={(e) => setTotalSeasons(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={save}
                className="rounded-xl border-border bg-surface"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11.5px] font-medium text-ink-soft">{t("item.nextEpisode")}</span>
              <Input
                type="date"
                value={nextEpisode}
                onChange={(e) => {
                  setNextEpisode(e.target.value);
                  setTimeout(save, 0);
                }}
                className="rounded-xl border-border bg-surface"
              />
            </label>
          </>
        ) : null}
        <div className="col-span-2">
          <span className="text-[11.5px] font-medium text-ink-soft">
            {t("item.ratingLabel")}
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            {[2, 4, 6, 8, 10].map((v) => (
              <button
                key={v}
                type="button"
                aria-label={t("item.starsAria", { count: v / 2 })}
                onClick={() => {
                  setRating(rating === v ? 0 : v);
                  setTimeout(save, 0);
                }}
                className={cn(
                  "h-8 w-8 rounded-full border text-[13px] transition-colors",
                  rating >= v
                    ? "border-primary-soft bg-primary-soft/50 text-primary-deep"
                    : "border-border bg-surface text-muted-foreground/60"
                )}
              >
                {rating >= v ? "●" : "○"}
              </button>
            ))}
            <span className="ms-1 text-[12px] text-muted-foreground">
              {rating ? t("item.ratingOf", { value: rating / 2 }) : t("item.notRated")}
            </span>
          </div>
        </div>
      </div>
      <AddToTodayDialog
        open={addSession}
        onOpenChange={setAddSession}
        itemTitle={itemTitle}
        title={t("item.addSessionTitle")}
        onConfirm={async (choice) => {
          const { addSessionToToday } = await import(
            "@/lib/lifeos/services/entertainment-service"
          );
          const res = await run(
            addSessionToToday(itemId, {
              date: choice.date,
              startTime: choice.startTime,
              allowMultiple: true,
            }),
            { success: t("item.sessionAddedToast") }
          );
          if (res.ok && res.value.entryId && choice.periodSettingId) {
            const { setEntryPeriodBySetting } = await import(
              "@/lib/lifeos/services/planning-service"
            );
            await run(
              setEntryPeriodBySetting(res.value.entryId, choice.periodSettingId),
              { quiet: true }
            );
          }
        }}
      />
    </section>
  );
}

/* ---------- project fields ---------- */

function ProjectFields({ itemId }: { itemId: string }) {
  const { t } = useT();
  const project = useLiveQuery(() => db.projectDetails.get(itemId), [itemId]);
  const [goal, setGoal] = useState("");
  const [target, setTarget] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (project !== undefined && loadedFor !== itemId) {
    setLoadedFor(itemId);
    setGoal(project?.goal ?? "");
    setTarget(project?.targetDate ?? "");
  }
  const save = () =>
    run(
      (async () => {
        await db.projectDetails.put({
          itemId,
          goal: goal || undefined,
          targetDate: target || undefined,
        });
        return { ok: true as const, value: undefined };
      })(),
      { quiet: true }
    );
  return (
    <section>
      <SectionLabel>{t("item.project")}</SectionLabel>
      <div className="mt-1.5 grid gap-3">
        <Textarea
        dir="auto"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onBlur={save}
          placeholder={t("item.projectPlaceholder")}
          className="min-h-[56px] rounded-xl border-border bg-surface"
        />
        <label className="flex items-center justify-between gap-3">
          <span className="text-[11.5px] font-medium text-ink-soft">{t("item.targetDate")}</span>
          <Input
            type="date"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setTimeout(save, 0);
            }}
            className="w-40 rounded-xl border-border bg-surface"
          />
        </label>
      </div>
    </section>
  );
}

/* ---------- repeat dialog ---------- */

function RepeatDialog({
  open,
  onOpenChange,
  itemId,
  weekAnchor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  weekAnchor: number;
}) {
  const [pattern, setPattern] = useState("weekly");
  const [interval, setIntervalValue] = useState("1");
  const [startDate, setStartDate] = useState(todayLocal());
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [monthDay, setMonthDay] = useState("1");
  const [lastDay, setLastDay] = useState(false);
  const { t } = useT();
  const dayLabels = [
    t("item.day.0"),
    t("item.day.1"),
    t("item.day.2"),
    t("item.day.3"),
    t("item.day.4"),
    t("item.day.5"),
    t("item.day.6"),
  ];
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPattern("weekly");
      setIntervalValue("1");
      setStartDate(todayLocal());
      setWeekdays([0, 1, 2, 3, 4]);
      setMonthDay("1");
      setLastDay(false);
    }
  }
  const busy = false;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{t("item.makeItRepeat")}</DialogTitle>
          <DialogDescription>
            {t("item.repeatDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-ink-soft">{t("item.pattern")}</span>
              <Select value={pattern} onValueChange={setPattern}>
                <SelectTrigger className="w-full rounded-xl border-border bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border bg-surface-raised">
                  <SelectItem value="daily">{t("notes.everyDay")}</SelectItem>
                  <SelectItem value="weekdays">{t("item.selectedWeekdays")}</SelectItem>
                  <SelectItem value="weekly">{t("qa.weekly")}</SelectItem>
                  <SelectItem value="monthly">{t("qa.monthly")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[12px] font-medium text-ink-soft">{t("item.everyLabel")}</span>
              <Input
                inputMode="numeric"
                value={interval}
                onChange={(e) => setIntervalValue(e.target.value.replace(/[^0-9]/g, ""))}
                className="rounded-xl border-border bg-surface"
              />
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-medium text-ink-soft">{t("item.starts")}</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border-border bg-surface"
            />
          </label>
          {pattern === "weekdays" ? (
            <div>
              <span className="text-[12px] font-medium text-ink-soft">{t("item.onDays")}</span>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {dayLabels.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={weekdays.includes(i)}
                    onClick={() =>
                      setWeekdays((days) =>
                        days.includes(i) ? days.filter((d) => d !== i) : [...days, i]
                      )
                    }
                    className={cn(
                      "h-8 w-11 rounded-full border text-[12px] font-medium transition-colors",
                      weekdays.includes(i)
                        ? "border-primary-soft bg-primary-soft/50 text-primary-deep"
                        : "border-border bg-surface text-muted-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {pattern === "monthly" ? (
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
                {t("item.dayOfMonth")}
                <Input
                  inputMode="numeric"
                  value={monthDay}
                  disabled={lastDay}
                  onChange={(e) => setMonthDay(e.target.value.replace(/[^0-9]/g, ""))}
                  className="w-20 rounded-xl border-border bg-surface"
                />
              </label>
              <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                <Switch checked={lastDay} onCheckedChange={setLastDay} />
                {t("item.lastDay")}
              </label>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              const res = await run(
                createRule({
                  itemId,
                  pattern: pattern as "daily" | "weekdays" | "weekly" | "monthly",
                  interval: Math.max(1, Number(interval) || 1),
                  byWeekday:
                    pattern === "weekdays"
                      ? (weekdays.filter((d) => d >= 0 && d <= 6) as (0 | 1 | 2 | 3 | 4 | 5 | 6)[])
                      : undefined,
                  byMonthDay:
                    pattern === "monthly" && !lastDay ? Number(monthDay) || 1 : undefined,
                  monthDayMode: pattern === "monthly" ? (lastDay ? "last" : "day") : undefined,
                  startDate,
                  weekAnchor: (weekAnchor % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
                }),
                { quiet: true }
              );
              if (res.ok) {
                const { toast } = await import("sonner");
                toast(t("item.repeatsNowToast"));
                onOpenChange(false);
              }
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {t("item.saveRepeat")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- postpone dialog ---------- */

function PostponeDialog({
  open,
  onOpenChange,
  itemId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
}) {
  const { t } = useT();
  const [date, setDate] = useState("");
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setDate("");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{t("weekly.postpone")}</DialogTitle>
          <DialogDescription>
            {t("item.postponeDesc")}
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5">
          <span className="text-[12px] font-medium text-ink-soft">
            {t("item.comeBackOn")}
          </span>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border-border bg-surface"
          />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">
            {t("common.cancel")}
          </Button>
          <Button
            onClick={async () => {
              await run(postponeItem(itemId, date || undefined), {
                success: date ? t("item.willSurfaceToast", { date }) : t("item.postponedGentlyToast"),
              });
              onOpenChange(false);
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {t("weekly.postpone")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { Film, Divider, TYPE_OPTIONS, ENT_STATUS_MAP };
