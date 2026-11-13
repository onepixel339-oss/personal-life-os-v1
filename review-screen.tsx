/* Review screen — optional weekly reflection (§3.14, §14). */

"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useReviewData, useViewPrefs, useWeeklyData } from "@/lib/lifeos/hooks";
import { addDays, formatWeekRange, weekStart } from "@/lib/lifeos/dates";
import { todayLocal } from "@/lib/lifeos/dates";
import { run } from "@/lib/lifeos/run";
import { saveReview } from "@/lib/lifeos/services/review-service";
import { addEntryToWeek } from "@/lib/lifeos/services/planning-service";
import { t, useT } from "@/lib/lifeos/i18n";
import type { WeeklyReviewAnswers } from "@/lib/lifeos/types";
import { Card, Chip, EmptyState, PageHeader, SectionLabel } from "../shared/primitives";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";

export function ReviewScreen() {
  const reviewWeekStart = useUIStore((s) => s.reviewWeekStart);
  const setReviewWeek = useUIStore((s) => s.setReviewWeek);
  const prefs = useViewPrefs();
  const { t } = useT();
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
  const realToday = todayLocal();

  const completedList = useMemo(() => {
    if (!weekly) return [];
    return weekly.rows.filter(
      (r) => r.item.status === "completed" || r.item.status === "cancelled"
    );
  }, [weekly]);
  const incompleteList = useMemo(() => {
    if (!weekly) return [];
    return weekly.rows.filter(
      (r) => r.item.status !== "completed" && r.item.status !== "cancelled"
    );
  }, [weekly]);

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

      <div className="space-y-4">
        {questions.map((q, i) => (
          <Card key={q.key} className="px-4 py-3.5 md:px-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-serif text-[15.5px] text-ink">{q.label}</h3>
              <span className="text-[11px] text-muted-foreground">{i + 1} / 5</span>
            </div>
            <p className="mt-0.5 text-[12.5px] italic text-muted-foreground">{q.hint}</p>
            {q.key === "accomplished" && completedList.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {completedList.map((r) => (
                  <li key={r.key}>
                    <Chip tone="sage">{r.item.title}</Chip>
                  </li>
                ))}
              </ul>
            ) : null}
            {q.key === "incomplete" && incompleteList.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {incompleteList.map((r) => (
                  <li key={r.key}>
                    <Chip tone="muted">{r.item.title}</Chip>
                  </li>
                ))}
              </ul>
            ) : null}
            <Textarea
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
              {incompleteList.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-soft">
                    {r.item.title}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 rounded-full border-border bg-surface text-[12px]"
                    onClick={async () => {
                      await run(
                        addEntryToWeek({ weekStartDate: nextWeekStart, itemId: r.item.id }),
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
