/* Entertainment screen — movies, series, anime, games (§3.7, §14.8). */

"use client";

import { useState } from "react";
import { Film, Gamepad2, Plus, Sparkles, Tv } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useEntertainment } from "@/lib/lifeos/hooks";
import { run } from "@/lib/lifeos/run";
import { mediaTypeLabel, progressLabel, useT } from "@/lib/lifeos/i18n";
import { createMedia } from "@/lib/lifeos/services/entertainment-service";
import type { MediaType } from "@/lib/lifeos/types";
import {
  Card,
  Chip,
  EmptyState,
  PageHeader,
} from "../shared/primitives";
import { cn } from "@/lib/utils";

export function EntertainmentScreen() {
  const rows = useEntertainment();
  const openItem = useUIStore((s) => s.openItem);
  const { t } = useT();
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const filters = [
    { key: "all", label: t("search.filterAll") },
    { key: "movie", label: t("ent.movies") },
    { key: "series", label: t("ent.series") },
    { key: "anime", label: t("ent.anime") },
    { key: "game", label: t("ent.games") },
    { key: "in_progress", label: t("ent.watchingPlaying") },
    { key: "planned", label: progressLabel("planned") },
    { key: "completed", label: progressLabel("completed") },
  ] as const;

  const filtered = (rows ?? []).filter((r) => {
    if (filter === "all") return true;
    if (filter === "in_progress") return r.details.progressStatus === "in_progress";
    if (filter === "planned") return r.details.progressStatus === "planned";
    if (filter === "completed") return r.details.progressStatus === "completed";
    return r.details.mediaType === filter;
  });

  return (
    <div>
      <PageHeader
        title={t("ent.title")}
        subtitle={t("ent.subtitle")}
        actions={
          <Button
            size="sm"
            className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" /> {t("ent.add")}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <Chip
            key={f.key}
            tone={filter === f.key ? "terracotta" : "neutral"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      {rows === undefined ? (
        <div className="py-12 text-center font-serif italic text-muted-foreground">{t("common.loading")}</div>
      ) : filtered.length === 0 ? (
        <Card className="px-6 py-10">
          <EmptyState
            message={t("ent.empty")}
            action={
              <Button variant="outline" className="rounded-full" onClick={() => setAddOpen(true)}>
                {t("ent.addFirst")}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="px-2 py-1.5 md:px-3">
          <ul className="flex flex-col">
            {filtered.map(({ details, item }) => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-t border-border/60 px-2 py-2.5 first:border-t-0 md:px-2.5"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    details.mediaType === "game"
                      ? "bg-sage-soft/70 text-[#4d5340]"
                      : "bg-primary-soft/40 text-primary-deep"
                  )}
                  aria-hidden
                >
                  {details.mediaType === "movie" ? (
                    <Film className="h-4 w-4" />
                  ) : details.mediaType === "game" ? (
                    <Gamepad2 className="h-4 w-4" />
                  ) : details.mediaType === "anime" ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <Tv className="h-4 w-4" />
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => openItem(item.id)}
                  className="min-w-0 flex-1 text-start"
                >
                  <span className="block truncate text-[14.5px] text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Chip tone="neutral">{mediaTypeLabel(details.mediaType)}</Chip>
                    <Chip
                      tone={
                        details.progressStatus === "in_progress"
                          ? "terracotta"
                          : details.progressStatus === "completed"
                            ? "sage"
                            : "muted"
                      }
                    >
                      {details.progressStatus === "in_progress"
                        ? details.mediaType === "game"
                          ? t("ent.playing")
                          : t("ent.watching")
                        : progressLabel(details.progressStatus)}
                    </Chip>
                    {details.mediaType !== "movie" && details.currentSeason ? (
                      <Chip tone="neutral">
                        S{details.currentSeason}
                        {details.currentEpisode ? ` · E${details.currentEpisode}` : ""}
                      </Chip>
                    ) : null}
                    {details.rating ? (
                      <span className="text-[12px] text-muted-foreground" title={t("ent.rating")}>
                        {"●".repeat(details.rating / 2)}
                        {details.rating % 2 ? "◐" : ""}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AddMediaDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AddMediaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("series");
  const [progress, setProgress] = useState("planned");
  const [busy, setBusy] = useState(false);
  const { t } = useT();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setTitle("");
          setMediaType("series");
          setProgress("planned");
        }
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-raised">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{t("ent.addTitle")}</DialogTitle>
          <DialogDescription>
            {t("ent.addDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
          dir="auto"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("ent.titlePlaceholder")}
            className="h-11 rounded-xl border-border bg-surface"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select value={mediaType} onValueChange={(v) => setMediaType(v as MediaType)}>
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
            <Select value={progress} onValueChange={setProgress}>
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
          </div>
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
                const res = await run(
                  createMedia({
                    title,
                    mediaType,
                    progressStatus: progress as "planned" | "in_progress" | "paused" | "completed" | "dropped",
                  }),
                  { quiet: true }
                );
                if (res.ok) {
                  const { toast } = await import("sonner");
                  toast(t("ent.addedToast", { title }));
                  onOpenChange(false);
                }
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
          >
            {t("ent.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
