/* Today Timeline — period bands, timed blocks, flexible chips, current line (§9.7). */

"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";
import type { TodayRow } from "@/lib/lifeos/hooks";
import type { ResolvedPeriod } from "@/lib/lifeos/types";
import { formatTime, nowMinutes, timeToMinutes } from "@/lib/lifeos/dates";
import { periodName, periodTagline, useT } from "@/lib/lifeos/i18n";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { Chip, EmptyState } from "../shared/primitives";
import { cn } from "@/lib/utils";

const PX_PER_MIN = 1.15;
const MIN_BLOCK = 34;

interface Placed {
  row: TodayRow;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

function laneLayout(items: { row: TodayRow; start: number; end: number }[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const laneEnds: number[] = [];
  const result: Placed[] = [];
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    result.push({ ...item, lane, lanes: 1 });
  }
  // count lanes among overlapping neighbours for side-by-side columns
  for (const p of result) {
    p.lanes =
      result.filter(
        (q) => q.row !== p.row && q.start < p.end && p.start < q.end
      ).length + 1;
  }
  return result;
}

export function TodayTimeline({
  date,
  periods,
  byPeriod,
  unplaced,
  timeFormat24,
  isToday,
}: {
  date: string;
  periods: (ResolvedPeriod & { settingId?: string })[];
  byPeriod: Map<string, TodayRow[]>;
  unplaced: TodayRow[];
  timeFormat24: boolean;
  isToday: boolean;
}) {
  const openItem = useUIStore((s) => s.openItem);
  const { t } = useT();

  const model = useMemo(() => {
    const fixedPeriods = periods.filter((p) => p.startTime);
    let axisStart = fixedPeriods.length
      ? Math.min(...fixedPeriods.map((p) => timeToMinutes(p.startTime as string)))
      : 6 * 60;
    let axisEnd = Math.max(
      ...fixedPeriods.map(
        (p) =>
          timeToMinutes(p.endTime ?? p.startTime ?? "23:59") +
          (p.endDayOffset ?? 0) * 1440
      ),
      axisStart + 8 * 60
    );
    // clamp the overnight tail to keep the Night band readable
    axisStart = Math.max(0, axisStart);
    axisEnd = Math.min(axisEnd, 24 * 60 + 6 * 60);
    // snap to whole hours so the first/last hour labels are fully visible
    axisStart = Math.floor(axisStart / 60) * 60;
    axisEnd = Math.ceil(axisEnd / 60) * 60;

    const bands = periods.map((p) => {
      const start = p.startTime ? timeToMinutes(p.startTime) : axisStart;
      const end = p.endTime
        ? timeToMinutes(p.endTime) + (p.endDayOffset ?? 0) * 1440
        : start + (p.durationMinutes ?? 90);
      return { period: p, start: Math.max(start, axisStart), end: Math.min(Math.max(end, start + 30), axisEnd) };
    });

    const placedByPeriod = new Map<string, Placed[]>();
    const chipsByPeriod = new Map<string, TodayRow[]>();
    for (const band of bands) {
      const rows = byPeriod.get(band.period.id) ?? [];
      const timed: { row: TodayRow; start: number; end: number }[] = [];
      const chips: TodayRow[] = [];
      for (const row of rows) {
        if (row.startTime) {
          const start = timeToMinutes(row.startTime) + ((row.entry?.startDayOffset ?? 0) * 1440);
          const dur =
            row.durationMinutes ??
            (row.endTime ? Math.max(15, timeToMinutes(row.endTime) - timeToMinutes(row.startTime)) : 30);
          timed.push({ row, start, end: start + dur });
        } else {
          chips.push(row);
        }
      }
      placedByPeriod.set(band.period.id, laneLayout(timed));
      chipsByPeriod.set(band.period.id, chips);
    }
    const height = (axisEnd - axisStart) * PX_PER_MIN;
    return { axisStart, axisEnd, bands, placedByPeriod, chipsByPeriod, height };
  }, [periods, byPeriod]);

  const now = nowMinutes();
  const showNow = isToday && now >= model.axisStart && now <= model.axisEnd;

  return (
    <div className="rounded-2xl border border-border bg-surface p-3 md:p-4">
      <div className="relative" style={{ height: model.height + 8 }}>
        {/* hour lines */}
        {Array.from({ length: Math.floor((model.axisEnd - model.axisStart) / 60) + 1 }, (_, i) => {
          const minutes = model.axisStart + i * 60;
          if (minutes > model.axisEnd) return null;
          const top = (minutes - model.axisStart) * PX_PER_MIN;
          const hour = Math.floor(minutes / 60) % 24;
          return (
            <div key={i} className="absolute inset-x-0" style={{ top }}>
              <div className="h-px w-full bg-border/60" />
              <span className="absolute start-0 -top-2 text-[10px] tabular-nums text-muted-foreground/80">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
          );
        })}

        {/* period bands */}
        {model.bands.map((band, idx) => {
          const top = (band.start - model.axisStart) * PX_PER_MIN;
          const height = Math.max((band.end - band.start) * PX_PER_MIN, 44);
          const rows = byPeriod.get(band.period.id) ?? [];
          return (
            <div
              key={band.period.id}
              className={cn(
                "absolute start-14 end-1 rounded-xl border",
                idx % 2 === 0 ? "bg-surface-context/80" : "bg-sage-soft/40",
                "border-border/70"
              )}
              style={{ top, height }}
            >
              <div className="flex items-baseline justify-between gap-2 px-3 pt-1.5">
                <span className="font-serif text-[13.5px] text-ink">{periodName(band.period.name)}</span>
                <span className="text-[10.5px] tabular-nums text-muted-foreground">
                  {band.period.startTime ? formatTime(band.period.startTime, timeFormat24) : ""}
                  {band.period.endTime ? ` – ${formatTime(band.period.endTime, timeFormat24)}` : ""}
                </span>
              </div>
              {band.period.tagline ? (
                <p className="px-3 font-serif text-[11px] italic text-muted-foreground/90">
                  {periodTagline(band.period.tagline, band.period.name)}
                </p>
              ) : null}

              {/* timed blocks */}
              {(model.placedByPeriod.get(band.period.id) ?? []).map((placed) => {
                const blockTop = (placed.start - band.start) * PX_PER_MIN + 34;
                const blockHeight = Math.max(
                  (placed.end - placed.start) * PX_PER_MIN - 2,
                  MIN_BLOCK
                );
                const width = `calc(${100 / placed.lanes}% - 6px)`;
                const insetStart = `calc(${(100 / placed.lanes) * placed.lane}% + 3px)`;
                return (
                  <button
                    key={placed.row.key}
                    type="button"
                    onClick={() => {
                      if (placed.row.item) openItem(placed.row.item.id);
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded-lg border px-2 py-1 text-start",
                      placed.row.executionStatus === "completed"
                        ? "border-sage/40 bg-sage-soft/60 text-muted-foreground"
                        : "border-primary-soft bg-primary-soft/35 text-ink"
                    )}
                    style={{
                      top: Math.max(blockTop, 34),
                      height: Math.min(blockHeight, height - 38),
                      width,
                      insetInlineStart: insetStart,
                    }}
                  >
                    <span className="block truncate text-[11.5px] font-medium leading-tight">
                      {placed.row.title}
                    </span>
                    {placed.row.startTime ? (
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTime(placed.row.startTime, timeFormat24)}
                      </span>
                    ) : null}
                  </button>
                );
              })}

              {/* untimed chips */}
              <div className="absolute inset-x-2 bottom-1.5 flex flex-wrap gap-1">
                {(model.chipsByPeriod.get(band.period.id) ?? []).map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => {
                      if (row.item) openItem(row.item.id);
                    }}
                    className={cn(
                      "max-w-full truncate rounded-full border px-2 py-0.5 text-[11px]",
                      row.executionStatus === "completed"
                        ? "border-sage/40 bg-sage-soft/60 text-muted-foreground"
                        : "border-border bg-surface text-ink-soft"
                    )}
                    title={row.title}
                  >
                    {row.title}
                  </button>
                ))}
              </div>
              {rows.length === 0 ? (
                <p className="absolute bottom-1.5 start-3 font-serif text-[11px] italic text-muted-foreground/70">
                  {t("timeline.openSpace")}
                </p>
              ) : null}
            </div>
          );
        })}

        {/* current time line */}
        {showNow ? (
          <div
            className="pointer-events-none absolute start-10 end-0 z-10"
            style={{ top: (now - model.axisStart) * PX_PER_MIN }}
          >
            <div className="h-0.5 w-full bg-primary/70" />
            <span className="absolute end-0 -top-2 rounded-full bg-primary px-1.5 text-[9.5px] font-semibold text-primary-foreground">
              {formatTime(
                `${String(Math.floor(now / 60) % 24).padStart(2, "0")}:${String(now % 60).padStart(2, "0")}`,
                timeFormat24
              )}
            </span>
          </div>
        ) : null}
      </div>

      {/* unplaced lane */}
      <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-context/60 p-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {t("today.unplaced")}
        </p>
        {unplaced.length === 0 ? (
          <EmptyState message={t("timeline.nothingWaiting")} compact />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {unplaced.map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => {
                  if (row.item) openItem(row.item.id);
                }}
                className={cn(
                  "max-w-full truncate rounded-full border px-2.5 py-1 text-[12px]",
                  row.executionStatus === "completed"
                    ? "border-sage/40 bg-sage-soft/60 text-muted-foreground"
                    : "border-border bg-surface text-ink-soft"
                )}
              >
                {row.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
        {t("timeline.caption", { date })}
      </p>
      <span className="hidden">
        <Chip>·</Chip>
      </span>
    </div>
  );
}
