/* Global Search — one local, offline search over everything (§10.1, §14.10). */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search as SearchIcon } from "lucide-react";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { search as runSearch, makeSnippet } from "@/lib/lifeos/services/search-service";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
} from "@/lib/lifeos/services/settings-service";
import { capture } from "@/lib/lifeos/services/inbox-service";
import { typeLabel, useT } from "@/lib/lifeos/i18n";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";
import { toast } from "sonner";
import type { Item, ItemType, ItemStatus, Space } from "@/lib/lifeos/types";
import { Chip, EmptyState } from "../shared/primitives";
import { cn } from "@/lib/utils";

export function SearchDialog() {
  const open = useUIStore((s) => s.searchOpen);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const openItem = useUIStore((s) => s.openItem);
  const navigate = useUIStore((s) => s.navigate);
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  const typeFilters = [
    { key: "all", label: t("search.filterAll") },
    { key: "space", label: t("nav.spaces") },
    { key: "task", label: typeLabel("task") },
    { key: "project", label: typeLabel("project") },
    { key: "note", label: typeLabel("note") },
    { key: "idea", label: typeLabel("idea") },
    { key: "entertainment", label: typeLabel("entertainment") },
    { key: "event", label: typeLabel("event") },
    { key: "activity", label: typeLabel("activity") },
    { key: "outcome", label: typeLabel("outcome") },
  ];

  const items = useLiveQuery(() => db.items.toArray(), []);
  const spaces = useLiveQuery(() => db.spaces.toArray(), []);

  useEffect(() => {
    if (open) void getRecentSearches().then(setRecent);
  }, [open]);

  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setTypeFilter("all");
      setIncludeArchived(false);
    }
  }

  // full data for appearance chips (computed once per data change)
  const appearanceMap = useLiveQuery(async () => {
    const [links, spacesAll, inbox, dailyEntries, dailyPlans, weeklyEntries, weeklyPlans] =
      await Promise.all([
        db.itemSpaceLinks.toArray(),
        db.spaces.toArray(),
        db.inboxEntries.toArray(),
        db.dailyEntries.toArray(),
        db.dailyPlans.toArray(),
        db.weeklyEntries.toArray(),
        db.weeklyPlans.toArray(),
      ]);
    const spaceById = new Map(spacesAll.map((s) => [s.id, s]));
    const dateByPlan = new Map(dailyPlans.map((p) => [p.id, p.date]));
    const weekByPlan = new Map(weeklyPlans.map((p) => [p.id, p.startDate]));
    const map = new Map<string, { spaces: string[]; inInbox: boolean; today: boolean; week: boolean }>();
    const ensure = (id: string) => {
      let entry = map.get(id);
      if (!entry) {
        entry = { spaces: [], inInbox: false, today: false, week: false };
        map.set(id, entry);
      }
      return entry;
    };
    for (const link of links) {
      const name = spaceById.get(link.spaceId)?.name;
      if (name) ensure(link.itemId).spaces.push(name);
    }
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
    for (const e of inbox) ensure(e.itemId).inInbox = true;
    for (const e of dailyEntries) {
      if (e.itemId && dateByPlan.get(e.dailyPlanId) === todayStr) ensure(e.itemId).today = true;
    }
    for (const e of weeklyEntries) {
      if (e.itemId && weekByPlan.get(e.weeklyPlanId)) ensure(e.itemId).week = true;
    }
    return map;
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return runSearch(query, {
      type:
        typeFilter === "all"
          ? undefined
          : (typeFilter as ItemType | "space"),
      includeArchived,
    });
  }, [query, typeFilter, includeArchived]);

  if (!open) return null;

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const spaceById = new Map((spaces ?? []).map((s) => [s.id, s]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(42,31,23,0.35)] px-3 pt-[8vh] backdrop-blur-sm"
      onClick={closeSearch}
      role="dialog"
      aria-modal="true"
      aria-label={t("shell.search")}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-[var(--shadow-warm)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border/70 px-4 py-3">
          <SearchIcon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
          <input
          dir="auto"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && results.length > 0) {
                const first = results[0];
                void addRecentSearch(query);
                if (first.kind === "item" && first.itemId) openItem(first.itemId);
                else if (first.kind === "space" && first.spaceId)
                  navigate({ name: "space", spaceId: first.spaceId });
                closeSearch();
              }
              if (e.key === "Escape") closeSearch();
            }}
            placeholder={t("search.placeholder")}
            className="h-9 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
            aria-label={t("search.queryAria")}
          />
          <button
            type="button"
            onClick={() => setIncludeArchived((v) => !v)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              includeArchived
                ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                : "border-border text-muted-foreground"
            )}
          >
            {t("search.archivedToo")}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-border/70 px-4 py-2">
          {typeFilters.map((f) => (
            <Chip
              key={f.key}
              tone={typeFilter === f.key ? "terracotta" : "neutral"}
              onClick={() => setTypeFilter(f.key)}
            >
              {f.label}
            </Chip>
          ))}
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-2 py-2">
          {!query.trim() ? (
            recent.length > 0 ? (
              <div className="px-2 py-1">
                <div className="flex items-center justify-between px-1 pb-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("search.recent")}
                  </p>
                  <button
                    type="button"
                    className="text-[11.5px] text-muted-foreground hover:text-ink-soft"
                    onClick={async () => {
                      await clearRecentSearches();
                      setRecent([]);
                    }}
                  >
                    {t("search.clear")}
                  </button>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {recent.map((r) => (
                    <li key={r}>
                      <Chip onClick={() => setQuery(r)}>{r}</Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyState compact message={t("search.typeToSearch")} />
            )
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="font-serif italic text-[15px] text-muted-foreground">
                {t("search.nothingFound")}
              </p>
              <button
                type="button"
                onClick={async () => {
                  const res = await capture(query.trim());
                  if (res.ok) {
                    toast(t("search.addedToInbox", { title: query.trim() }));
                    void addRecentSearch(query.trim());
                    closeSearch();
                  }
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:border-border-strong"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("search.addToInbox", { title: query.trim() })}
              </button>
            </div>
          ) : (
            <ul className="flex flex-col">
              {results.map((hit) => {
                const item: Item | undefined =
                  hit.kind === "item" && hit.itemId ? itemById.get(hit.itemId) : undefined;
                const space: Space | undefined =
                  hit.kind === "space" && hit.spaceId ? spaceById.get(hit.spaceId) : undefined;
                const appearances =
                  hit.itemId && appearanceMap ? appearanceMap.get(hit.itemId) : undefined;
                const description =
                  item?.description || (hit.kind === "space" ? space?.description : "");
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void addRecentSearch(query);
                        if (hit.kind === "item" && hit.itemId) openItem(hit.itemId);
                        else if (hit.kind === "space" && hit.spaceId)
                          navigate({ name: "space", spaceId: hit.spaceId });
                        closeSearch();
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-surface-context"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14.5px] text-foreground">
                          {hit.title}
                        </span>
                        <span className="shrink-0 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                          {hit.kind === "space"
                            ? t("nav.spaces")
                            : item
                              ? typeLabel(item.type as ItemType)
                              : ""}
                        </span>
                      </span>
                      {description ? (
                        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                          {makeSnippet(description, query)}
                        </span>
                      ) : null}
                      {appearances && hit.kind === "item" ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {appearances.spaces.map((s) => (
                            <Chip key={s} tone="lavender">
                              {s}
                            </Chip>
                          ))}
                          {appearances.inInbox ? <Chip tone="muted">{t("nav.inbox")}</Chip> : null}
                          {appearances.today ? <Chip tone="terracotta">{t("common.today")}</Chip> : null}
                          {appearances.week ? <Chip tone="neutral">{t("weekly.thisWeek")}</Chip> : null}
                          {hit.archived ? <Chip tone="muted">{t("search.archivedChip")}</Chip> : null}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="border-t border-border/70 px-4 py-2 text-center text-[11px] text-muted-foreground">
          {t("search.footer")}
        </p>
      </div>
    </div>
  );
}

export type { ItemStatus };
