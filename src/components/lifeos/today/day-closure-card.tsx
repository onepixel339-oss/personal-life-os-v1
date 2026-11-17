/* Day closure card (v1.2) — "قفلة اليوم": one gentle tap that ends the day.
   Closure, never a streak: an unclosed day simply passes with the night.
   A mis-tap can be quietly undone. */

"use client";

import { MoonStar, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/lifeos/i18n";
import { useDayClosed } from "@/lib/lifeos/hooks";
import { run } from "@/lib/lifeos/run";
import { closeDay, reopenDay } from "@/lib/lifeos/services/day-closure";

export function DayClosureCard({ date }: { date: string }) {
  const { t } = useT();
  const closed = useDayClosed(date);

  if (closed === undefined) return null;

  if (closed) {
    return (
      <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-sage/40 bg-surface-context px-4 py-3">
        <p className="flex min-w-0 items-baseline gap-2 font-serif text-[14.5px] text-ink">
          <MoonStar className="h-4 w-4 shrink-0 text-sage" />
          <span className="truncate">{t("closure.done")}</span>
        </p>
        <button
          type="button"
          onClick={() => void run(reopenDay(date), { quiet: true })}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-raised hover:text-ink-soft"
          title={t("closure.undoAria")}
        >
          <RotateCcw className="h-3 w-3" />
          {t("closure.undo")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-border-strong/70 bg-surface-context/60 px-4 py-3.5 text-center">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t("closure.hint")}
      </p>
      <Button
        variant="outline"
        className="mt-2.5 h-10 rounded-full border-border bg-surface px-5"
        onClick={() =>
          void run(closeDay(date), { quiet: true })
        }
      >
        <MoonStar className="h-4 w-4" /> {t("closure.cta")}
      </Button>
    </div>
  );
}
