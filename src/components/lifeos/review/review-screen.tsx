/* Review screen — optional weekly reflection (§3.14, §14). */

"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useUIStore } from "@/lib/lifeos/ui-store";
import {
  useLifeToday,
  usePeriodSettings,
  useReviewData,
  useReviewInsights,
  useViewPrefs,
  useWeekStripData,
  useWeeklyData,
} from "@/lib/lifeos/hooks";
import { addDays, dayOfWeek, formatWeekRange, weekdayName, weekStart } from "@/lib/lifeos/dates";
import { run } from "@/lib/lifeos/run";
import { saveReview } from "@/lib/lifeos/services/review-service";
import { addEntryToWeek } from "@/lib/lifeos/services/planning-service";
import {
  buildWeekStrip,
  densityLevel,
  type WeekStrip,
} from "@/lib/lifeos/services/week-strip";
import { periodName, useT } from "@/lib/lifeos/i18n";
import { toArabicDigits } from "@/lib/lifeos/lang-state";
import type { PeriodSetting, WeeklyReviewAnswers } from "@/lib/lifeos/types";
import type { InsightSentence } from "@/lib/lifeos/services/review-insights";
import { groupRowsByItem, pluralClass } from "@/lib/lifeos/services/review-insights";
import { Card, Chip, EmptyState, PageHeader, SectionLabel } from "../shared/primitives";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";
import { cn } from "@/lib/utils";

export function ReviewScreen() {
  const reviewWeekStart = useUIStore((s) => s.reviewWeekStart);
  const setReviewWeek = useUIStore((s) => s.setReviewWeek);
  const prefs = useViewPrefs();
  const { t, lang } = useT();
  const fmtNum = (n: number) =>
    lang === "ar" ? toArabicDigits(String(n)) : String(n);
  const firstDay = prefs?.calendar.firstDayOfWeek ?? 6;
  const data = useReviewData(reviewWeekStart);
  const weekly = useWeeklyData(reviewWeekStart, firstDay);
  const [answers, setAnswers] = useState<WeeklyReviewAnswers>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const questions = [
    {
      key: "accomplished" as const,
      label: t("review.q1"),
      hint: t("review.q1Hint"),
    },
    {
      key: "incomplete" as const,
      label: t("review.q2"),
      hint: t("review.q2Hint"),
    },
    { key: "changed" as const, label: t("review.q3"), hint: t("review.q3Hint") },
    { key: "carry" as const, label: t("review.q4"), hint: t("review.q4Hint") },
    { key: "ideas" as const, label: t("review.q5"), hint: t("review.q5Hint") },
  ];

  if (loadedFor !== reviewWeekStart && data !== undefined) {
    setLoadedFor(reviewWeekStart);
    setAnswers(data.review?.answers ?? {});
  }

  useEffect(() => {
    if (loadedFor !== reviewWeekStart) return;
    const timer = setTimeout(() => {
      setSaveState("saving");
      void run(saveReview(reviewWeekStart, answers), { quiet: true }).then(() => {
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [answers, loadedFor, reviewWeekStart]);

  const nextWeekStart = addDays(reviewWeekStart, 7);
  const realToday = useLifeToday();
  const isFriday = dayOfWeek(realToday) === 5;
  const insights = useReviewInsights(reviewWeekStart, weekly?.days ?? []);

  const completedList = useMemo(() => {
    if (!weekly) return [];
    return groupRowsByItem(
      weekly.rows.filter(
        (r) => r.item.status === "completed" || r.item.status === "cancelled"
      )
    );
  }, [weekly]);
  const incompleteList = useMemo(() => {
    if (!weekly) return [];
    return groupRowsByItem(
      weekly.rows.filter(
        (r) => r.item.status !== "completed" && r.item.status !== "cancelled"
      )
    );
  }, [weekly]);
  // one warm phrase per count — مرتين / ٣ مرات / ١٢ مرة
  const timesLabel = (n: number) =>
    t(`review.timesThisWeek.${pluralClass(n)}`, { n: fmtNum(n) });

  const pastReviews = useLiveQuery(async () => {
    const reviews = await db.weeklyReviews.toArray();
    const plans = await db.weeklyPlans.toArray();
    const startByPlan = new Map(plans.map((p) => [p.id, p.startDate]));
    return reviews
      .map((r) => ({ review: r, weekStart: startByPlan.get(r.weeklyPlanId) ?? "" }))
      .filter((r) => r.weekStart && r.weekStart !== reviewWeekStart)
      .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
      .slice(0, 6);
  }, [reviewWeekStart]);

  const periodSettings = usePeriodSettings();
  const stripEntries = useWeekStripData(weekly?.days ?? []);

  const strip: WeekStrip | null = useMemo(() => {
    if (!weekly || weekly.days.length === 0 || stripEntries === undefined) {
      return null;
    }
    const knownOrders = (periodSettings ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((ps) => ps.order);
    return buildWeekStrip(weekly.days, stripEntries, knownOrders);
  }, [weekly, stripEntries, periodSettings]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setReviewWeek(addDays(reviewWeekStart, -7))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-ink-soft"
          aria-label={t("weekly.prevWeek")}
        >
          <ChevronRight className="h-4 w-4 rtl:hidden" />
          <ChevronLeft className="h-4 w-4 ltr:hidden" />
        </button>
        <button
          type="button"
          onClick={() => setReviewWeek(weekStart(realToday, firstDay))}
          className="text-[12.5px] text-muted-foreground hover:text-ink-soft"
        >
          {t("review.thisWeekReview")}
        </button>
        <button
          type="button"
          onClick={() => setReviewWeek(addDays(reviewWeekStart, 7))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-ink-soft"
          aria-label={t("weekly.nextWeek")}
        >
          <ChevronLeft className="h-4 w-4 rtl:hidden" />
          <ChevronRight className="h-4 w-4 ltr:hidden" />
        </button>
      </div>

      <PageHeader
        kicker={t("review.kicker")}
        title={t("review.title")}
        subtitle={t("review.subtitle")}
        actions={
          <span
            className="text-[11.5px] text-muted-foreground"
            aria-live="polite"
          >
            {saveState === "saving" ? t("review.saving") : saveState === "saved" ? t("review.saved") : ""}
          </span>
        }
      />
      <p className="-mt-2 mb-5 text-[13px] tabular-nums text-muted-foreground">
        {formatWeekRange(reviewWeekStart, addDays(reviewWeekStart, 6))}
      </p>

      {isFriday ? (
        <p className="-mt-3 mb-5 flex items-center gap-2 text-[12.5px] italic text-primary-deep">
          <Sparkle className="h-3.5 w-3.5" />
          {t("review.fridayNote")}
        </p>
      ) : null}

      {strip ? <WeekStripCard strip={strip} periodSettings={periodSettings} /> : null}

      {insights ? <InsightsCard insights={insights} /> : null}

      <div className="space-y-4">
        {questions.map((q, i) => (
          <Card key={q.key} className="px-4 py-3.5 md:px-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-serif text-[15.5px] text-ink">{q.label}</h3>
              <span className="text-[11px] text-muted-foreground">{fmtNum(i + 1)} / {fmtNum(5)}</span>
            </div>
            <p className="mt-0.5 text-[12.5px] italic text-muted-foreground">{q.hint}</p>
            {q.key === "accomplished" && completedList.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {completedList.map((g) => (
                  <li key={g.itemId}>
                    <Chip tone="sage">
                      {g.title}
                      {g.count > 1 ? (
                        <span className="ms-1 text-[10.5px] text-muted-foreground">
                          {timesLabel(g.count)}
                        </span>
                      ) : null}
                    </Chip>
                  </li>
                ))}
              </ul>
            ) : null}
            {q.key === "incomplete" && incompleteList.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {incompleteList.map((g) => (
                  <li key={g.itemId}>
                    <Chip tone="muted">
                      {g.title}
                      {g.count > 1 ? (
                        <span className="ms-1 text-[10.5px] text-muted-foreground">
                          {timesLabel(g.count)}
                        </span>
                      ) : null}
                    </Chip>
                  </li>
                ))}
              </ul>
            ) : null}
            <Textarea
            dir="auto"
              value={answers[q.key] ?? ""}
              onChange={(e) =>
                setAnswers((a) => ({ ...a, [q.key]: e.target.value }))
              }
              placeholder={t("review.placeholder")}
              className="mt-2 min-h-[72px] rounded-xl border-border bg-surface"
            />
          </Card>
        ))}

        {incompleteList.length > 0 ? (
          <Card className="px-4 py-3.5 md:px-5">
            <SectionLabel>{t("review.carryLabel")}</SectionLabel>
            <ul className="mt-2 space-y-1.5">
              {incompleteList.map((g) => (
                <li key={g.itemId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-soft">
                    {g.title}
                    {g.count > 1 ? (
                      <span className="ms-1.5 text-[11px] text-muted-foreground">
                        {timesLabel(g.count)}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 rounded-full border-border bg-surface text-[12px]"
                    onClick={async () => {
                      await run(
                        addEntryToWeek({ weekStartDate: nextWeekStart, itemId: g.itemId }),
                        { success: t("review.carriedToast") }
                      );
                    }}
                  >
                    {t("review.addToNextWeek")}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {pastReviews && pastReviews.length > 0 ? (
          <div>
            <SectionLabel>{t("review.earlier")}</SectionLabel>
            <ul className="mt-1.5 space-y-1">
              {pastReviews.map(({ review, weekStart: ws }) => (
                <li key={review.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadedFor(null);
                      setReviewWeek(ws);
                    }}
                    className="w-full rounded-xl border border-border/70 bg-surface/60 px-3 py-2 text-start transition-colors hover:bg-surface-context"
                  >
                    <span className="text-[13px] text-ink-soft">
                      {t("review.weekOf", { date: ws })}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {review.answers.accomplished || review.answers.changed || "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <EmptyState
          compact
          message={t("review.skippable")}
        />
      </div>
    </div>
  );
}

/* ---------- week insights (v1.2) — the week's three questions ---------- */

function InsightsCard({
  insights,
}: {
  insights: { sentences: InsightSentence[] };
}) {
  const { t, lang } = useT();
  const fmtNum = (n: number) =>
    lang === "ar" ? toArabicDigits(String(n)) : String(n);

  return (
    <Card className="mb-4 px-4 py-3.5 md:px-5">
      <SectionLabel>{t("insights.title")}</SectionLabel>
      <p className="mt-1 text-[12.5px] italic text-muted-foreground">
        {t("insights.desc")}
      </p>
      <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-ink-soft">
        {insights.sentences.map((s, i) => {
          const n = s.params?.n;
          // count-bearing sentences pick their grammatical variant
          // (one / two / many / plus) — "١ حاجات" is now impossible.
          const key =
            typeof n === "number" ? `${s.key}.${pluralClass(n)}` : s.key;
          return (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
              <span>
                {t(
                  key,
                  Object.fromEntries(
                    Object.entries(s.params ?? {}).map(([k, v]) => [
                      k,
                      typeof v === "number" ? fmtNum(v) : v,
                    ])
                  )
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- qualitative week strip (v1.1) — shapes, never numbers ---------- */
function WeekStripCard({
  strip,
  periodSettings,
}: {
  strip: WeekStrip;
  periodSettings: PeriodSetting[] | undefined;
}) {
  const { t, lang } = useT();

  const labelByOrder = new Map<number, string>();
  for (const ps of periodSettings ?? []) {
    labelByOrder.set(ps.order, periodName(ps.name));
  }
  const rowLabel = (order: number) =>
    order === 0
      ? t("strip.unplacedRow")
      : (labelByOrder.get(order) ?? t("strip.periodRow"));
  const fmtNum = (n: number) =>
    lang === "ar" ? toArabicDigits(String(n)) : String(n);

  const weekTotal = [...strip.dayTotals.values()].reduce((a, b) => a + b, 0);
  const gridCols = { gridTemplateColumns: "84px repeat(7, minmax(0, 1fr))" };

  return (
    <Card className="mb-4 px-4 py-3.5 md:px-5">
      <SectionLabel>{t("strip.title")}</SectionLabel>
      <p className="mt-1 text-[12.5px] italic text-muted-foreground">
        {t("strip.desc")}
      </p>

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[400px]">
          <div className="grid items-center gap-1" style={gridCols}>
            <span />
            {strip.days.map((d) => {
              const total = strip.dayTotals.get(d) ?? 0;
              const open = strip.dayOpen.get(d) ?? 0;
              return (
                <span
                  key={d}
                  className={cn(
                    "text-center text-[10.5px] leading-tight",
                    total === 0
                      ? "text-muted-foreground/60"
                      : open === 0
                        ? "font-medium text-sage"
                        : "text-ink-soft"
                  )}
                >
                  {weekdayName(d, true)}
                </span>
              );
            })}
          </div>
          {strip.orders.map((order) => (
            <div
              key={order}
              className="mt-1 grid items-center gap-1"
              style={gridCols}
            >
              <span
                className="truncate text-[11px] text-muted-foreground"
                title={rowLabel(order)}
              >
                {rowLabel(order)}
              </span>
              {strip.days.map((d) => {
                const level = densityLevel(strip.cells.get(`${d}|${order}`) ?? 0);
                return (
                  <span
                    key={d}
                    aria-hidden
                    className={cn(
                      "mx-auto block h-4 w-full max-w-[34px] rounded-md transition-colors",
                      level === 0
                        ? "bg-surface-raised"
                        : level === 1
                          ? "bg-primary/45"
                          : "bg-primary/85"
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <ul className="mt-3 space-y-1 text-[12.5px] leading-relaxed text-muted-foreground">
        {weekTotal === 0 ? (
          <li>· {t("strip.allQuiet")}</li>
        ) : (
          <>
            {strip.busiestDate && !strip.uniform ? (
              <li>
                · {t("strip.busiest", { day: weekdayName(strip.busiestDate) })}
              </li>
            ) : null}
            {strip.quietestDate && strip.quietestDate !== strip.busiestDate ? (
              <li>
                · {t("strip.quietest", { day: weekdayName(strip.quietestDate) })}
              </li>
            ) : null}
            {strip.fullestOrder !== null ? (
              <li>
                · {t("strip.fullest", { period: rowLabel(strip.fullestOrder) })}
              </li>
            ) : null}
            {strip.emptyDays > 0 ? (
              <li>· {t("strip.emptyDays", { count: fmtNum(strip.emptyDays) })}</li>
            ) : null}
            {strip.allDoneDays > 0 ? (
              <li>· {t("strip.allDone", { count: fmtNum(strip.allDoneDays) })}</li>
            ) : null}
          </>
        )}
      </ul>
    </Card>
  );
}
