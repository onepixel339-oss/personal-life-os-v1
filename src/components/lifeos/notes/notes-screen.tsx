/* Notes screen — regular notes + Return Notes (§3.6, §3.8, §14.7). */

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, ChevronLeft, ChevronRight, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useNoteEditor, useNotes, useSpaces } from "@/lib/lifeos/hooks";
import { run } from "@/lib/lifeos/run";
import { t, useT } from "@/lib/lifeos/i18n";
import { createNote, saveNoteContent, setNoteType, updateReturnNoteSettings } from "@/lib/lifeos/services/note-service";
import { isValidDateString, todayLocal } from "@/lib/lifeos/dates";
import type { Item } from "@/lib/lifeos/types";
import {
  Card,
  Chip,
  EmptyState,
  PageHeader,
  SectionLabel,
} from "../shared/primitives";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";
import { cn } from "@/lib/utils";

export function NotesScreen() {
  const notes = useNotes();
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const { t } = useT();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [isReturn, setIsReturn] = useState(false);

  const regular = (notes ?? []).filter((n) => n.details.noteType === "regular");
  const returns = (notes ?? []).filter((n) => n.details.noteType === "return");

  return (
    <div>
      <PageHeader
        title={t("notes.title")}
        subtitle={t("notes.subtitle")}
        actions={
          <Button
            size="sm"
            className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-4 w-4" /> {t("notes.newNote")}
          </Button>
        }
      />

      {creating ? (
        <Card className="mb-4 px-4 py-3.5">
          <Input
          dir="auto"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("notes.aboutPlaceholder")}
            className="h-10 rounded-xl border-border bg-surface"
            onKeyDown={async (e) => {
              if (e.key === "Enter" && title.trim()) {
                const res = await run(
                  createNote({ title, noteType: isReturn ? "return" : "regular" }),
                  { quiet: true }
                );
                if (res.ok) {
                  setCreating(false);
                  setTitle("");
                  setIsReturn(false);
                }
              }
            }}
          />
          <label className="mt-2.5 flex items-center gap-2 text-[13px] text-ink-soft">
            <Switch checked={isReturn} onCheckedChange={setIsReturn} />
            {t("notes.returnToMe")}
          </label>
          <div className="mt-2.5 flex justify-end gap-2">
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                setCreating(false);
                setTitle("");
                setIsReturn(false);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!title.trim()}
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
              onClick={async () => {
                const res = await run(
                  createNote({ title, noteType: isReturn ? "return" : "regular" }),
                  { quiet: true }
                );
                if (res.ok) {
                  setCreating(false);
                  setTitle("");
                  setIsReturn(false);
                }
              }}
            >
              {t("notes.create")}
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="space-y-5">
        {returns.length > 0 ? (
          <section>
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" /> {t("notes.returnNotes")}
              </span>
            </SectionLabel>
            <Card className="mt-1.5 px-2 py-1.5">
              <ul className="flex flex-col">
                {returns.map((n) => (
                  <NoteRow key={n.item.id} item={n.item} subtitle={returnSubtitle(n.settings)} />
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <section>
          <SectionLabel>{t("notes.title")}</SectionLabel>
          {regular.length === 0 && returns.length === 0 ? (
            <Card className="mt-1.5 px-6 py-8">
              <EmptyState
                message={t("notes.quietPage")}
                action={
                  <Button variant="outline" className="rounded-full" onClick={() => setCreating(true)}>
                    {t("notes.writeFirst")}
                  </Button>
                }
              />
            </Card>
          ) : regular.length === 0 ? (
            <Card className="mt-1.5 px-6 py-6">
              <EmptyState compact message={t("notes.noRegular")} />
            </Card>
          ) : (
            <Card className="mt-1.5 px-2 py-1.5">
              <ul className="flex flex-col">
                {regular.map((n) => (
                  <NoteRow
                    key={n.item.id}
                    item={n.item}
                    subtitle={snippet(n.details.content)}
                  />
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function returnSubtitle(settings?: {
  enabled: boolean;
  trigger: string;
  targetDate?: string;
  repeat: string;
}): string {
  if (!settings) return t("notes.returnNote");
  const when =
    settings.trigger === "app_open"
      ? t("notes.whenAppOpens")
      : settings.trigger === "space_open"
        ? t("notes.whenSpaceOpens")
        : settings.trigger === "project_open"
          ? t("notes.whenProjectOpens")
          : settings.targetDate
            ? t("notes.fromDate", { date: settings.targetDate })
            : t("notes.onChosenDate");
  return `${settings.enabled ? t("notes.active") : t("notes.paused")} · ${when}`;
}

function snippet(content: string): string {
  if (!content) return t("notes.emptyNote");
  return content.replace(/[#*`>\-]/g, "").slice(0, 90) || t("notes.emptyNote");
}

function NoteRow({ item, subtitle }: { item: Item; subtitle: string }) {
  const navigate = useUIStore((s) => s.navigate);
  return (
    <li className="border-t border-border/60 first:border-t-0">
      <button
        type="button"
        onClick={() => navigate({ name: "note", itemId: item.id })}
        className="w-full px-2.5 py-2.5 text-start transition-colors hover:bg-surface-context/70 md:px-3"
      >
        <span className="block truncate font-serif text-[15px] text-ink">{item.title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
          {subtitle}
        </span>
      </button>
    </li>
  );
}

/* ---------- note editor (auto-save, quiet) ---------- */

export function NoteEditorScreen({ itemId }: { itemId: string }) {
  const data = useNoteEditor(itemId);
  const navigate = useUIStore((s) => s.navigate);
  const spaces = useSpaces();
  const { t } = useT();
  const projects = useLiveQuery(
    () => db.items.where("type").equals("project").toArray(),
    []
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<"plain" | "markdown">("markdown");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [returnOpen, setReturnOpen] = useState(false);
  const [rTitle, setRTitle] = useState("");
  const [rTrigger, setRTrigger] = useState("app_open");
  const [rTargetId, setRTargetId] = useState("none");
  const [rDate, setRDate] = useState(todayLocal());
  const [rRepeat, setRRepeat] = useState("none");
  const [rEnabled, setREnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (data && !loaded) {
      setTitle(data.item.title);
      setContent(data.details.content);
      setFormat(data.details.format);
      if (data.settings) {
        setRTrigger(data.settings.trigger);
        setRTargetId(data.settings.targetId ?? "none");
        setRDate(data.settings.targetDate ?? todayLocal());
        setRRepeat(data.settings.repeat);
        setREnabled(data.settings.enabled);
        setReturnOpen(data.details.noteType === "return");
        setRTitle(data.item.title);
      }
      setLoaded(true);
    }
  }, [data, loaded]);

  // debounced auto-save (600 ms) + blur/visibilitychange (§3.6)
  useEffect(() => {
    if (!loaded || !data) return;
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(() => saveRef.current(), 600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [content, format, loaded, data]);

  useEffect(() => {
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      if (loaded) saveRef.current();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [loaded]);

  saveRef.current = () => {
    if (!data) return;
    const changed =
      content !== data.details.content || format !== data.details.format;
    if (!changed) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    void saveNoteContent(data.item.id, content, format).then((r) => {
      setStatus(r.ok ? "saved" : "idle");
      if (r.ok) setTimeout(() => setStatus("idle"), 1600);
    });
  };

  if (!data) {
    return (
      <div className="py-16 text-center font-serif italic text-muted-foreground">
        {t("notes.opening")}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate({ name: "notes" })}
          className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-ink-soft"
        >
          <ChevronLeft className="h-4 w-4 rtl:hidden" />
          <ChevronRight className="h-4 w-4 ltr:hidden" /> {t("nav.notes")}
        </button>
        <span
          className={cn(
            "text-[11.5px] transition-opacity",
            status === "idle" ? "opacity-0" : "opacity-100"
          )}
          aria-live="polite"
        >
          {status === "saving" ? t("notes.saving") : t("notes.savedQuietly")}
        </span>
      </div>

      <input
        value={title}
        onChange={async (e) => {
          setTitle(e.target.value);
          const next = e.target.value.trim();
          if (next && next !== data.item.title) {
            const { updateItem } = await import("@/lib/lifeos/services/item-service");
            await run(updateItem(data.item.id, { title: next }), { quiet: true });
          }
        }}
        aria-label={t("notes.titleAria")}
        className="w-full bg-transparent font-serif text-[24px] leading-snug text-foreground outline-none"
        placeholder={t("notes.titlePlaceholder")}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Select value={format} onValueChange={(v) => setFormat(v as "plain" | "markdown")}>
          <SelectTrigger className="h-8 w-32 rounded-full border-border bg-surface text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border bg-surface-raised">
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="plain">{t("notes.plainText")}</SelectItem>
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={async () => {
            const next = returnOpen ? "regular" : "return";
            await run(setNoteType(data.item.id, next as "regular" | "return"), { quiet: true });
            setReturnOpen(!returnOpen);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
            returnOpen
              ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
              : "border-border bg-surface text-muted-foreground"
          )}
        >
          <Bell className="h-3.5 w-3.5" />
          {returnOpen ? t("notes.returnsToMe") : t("notes.returnToMeShort")}
        </button>
      </div>

      <Textarea
      dir="auto"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => saveRef.current()}
        placeholder={t("notes.writeFreely")}
        className="mt-3 min-h-[46vh] rounded-2xl border-border bg-surface p-4 text-[14.5px] leading-relaxed"
      />
      {format === "markdown" && content.trim() ? (
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">
          {t("notes.renderedSafely")}
        </p>
      ) : null}

      {returnOpen ? (
        <Card className="mt-4 px-4 py-3.5">
          <SectionLabel>{t("notes.whenShouldItReturn")}</SectionLabel>
          <div className="mt-2 grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-ink-soft">{t("notes.trigger")}</span>
                <Select value={rTrigger} onValueChange={setRTrigger}>
                  <SelectTrigger className="w-full rounded-xl border-border bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-surface-raised">
                    <SelectItem value="app_open">{t("notes.whenAppOpens")}</SelectItem>
                    <SelectItem value="space_open">{t("notes.whenSpaceOpens2")}</SelectItem>
                    <SelectItem value="project_open">{t("notes.whenProjectOpens2")}</SelectItem>
                    <SelectItem value="date">{t("notes.fromDateOption")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-ink-soft">{t("notes.repeat")}</span>
                <Select value={rRepeat} onValueChange={setRRepeat}>
                  <SelectTrigger className="w-full rounded-xl border-border bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-surface-raised">
                    <SelectItem value="none">{t("notes.always")}</SelectItem>
                    <SelectItem value="daily">{t("notes.everyDay")}</SelectItem>
                    <SelectItem value="weekly">{t("notes.everyWeek")}</SelectItem>
                    <SelectItem value="monthly">{t("notes.everyMonth")}</SelectItem>
                    <SelectItem value="yearly">{t("notes.everyYear")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            {rTrigger === "space_open" ? (
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-ink-soft">{t("nav.spaces")}</span>
                <Select value={rTargetId} onValueChange={setRTargetId}>
                  <SelectTrigger className="w-full rounded-xl border-border bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-surface-raised">
                    <SelectItem value="none">{t("notes.chooseSpace")}</SelectItem>
                    {(spaces?.active ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            {rTrigger === "project_open" ? (
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-ink-soft">{t("notes.project")}</span>
                <Select value={rTargetId} onValueChange={setRTargetId}>
                  <SelectTrigger className="w-full rounded-xl border-border bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-surface-raised">
                    <SelectItem value="none">{t("notes.chooseProject")}</SelectItem>
                    {(projects ?? [])
                      .filter((p) => p.status !== "archived")
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            {rTrigger === "date" ? (
              <label className="grid gap-1">
                <span className="text-[12px] font-medium text-ink-soft">{t("notes.fromDateLabel")}</span>
                <Input
                  type="date"
                  value={rDate}
                  onChange={(e) => setRDate(e.target.value)}
                  className="rounded-xl border-border bg-surface"
                />
              </label>
            ) : null}
            <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-context/70 px-3 py-2.5">
              <span className="text-[13px] text-ink-soft">
                {t("notes.activeHint")}
              </span>
              <Switch checked={rEnabled} onCheckedChange={setREnabled} />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
              disabled={
                (rTrigger === "space_open" || rTrigger === "project_open") &&
                rTargetId === "none"
              }
              onClick={async () => {
                const res = await run(
                  updateReturnNoteSettings(data.item.id, {
                    enabled: rEnabled,
                    trigger: rTrigger as "app_open" | "space_open" | "project_open" | "date",
                    targetId:
                      rTrigger === "space_open" || rTrigger === "project_open"
                        ? rTargetId === "none"
                          ? undefined
                          : rTargetId
                        : undefined,
                    targetDate: rTrigger === "date" && isValidDateString(rDate) ? rDate : undefined,
                    repeat: rRepeat as "none" | "daily" | "weekly" | "monthly" | "yearly",
                  }),
                  { quiet: true }
                );
                if (res.ok) {
                  const { toast } = await import("sonner");
                  toast(t("notes.returnSaved"));
                }
              }}
            >
              {t("notes.saveReturn")}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export { ArrowLeft, Plus, Undo2, Chip };
