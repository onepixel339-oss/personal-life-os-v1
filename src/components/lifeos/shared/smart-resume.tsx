/* Smart Resume card — at most one at a time, quiet, never destructive (§10.2). */

"use client";

import { useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";
import { run } from "@/lib/lifeos/run";
import { useUIStore } from "@/lib/lifeos/ui-store";
import {
  dismissSuggestion,
  laterSuggestion,
  type ResumeSuggestion,
} from "@/lib/lifeos/services/resume-service";
import { rt, useT } from "@/lib/lifeos/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SmartResumeCard({ suggestions }: { suggestions: ResumeSuggestion[] }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useT();
  const openItem = useUIStore((s) => s.openItem);
  const navigate = useUIStore((s) => s.navigate);
  if (suggestions.length === 0) return null;
  const first = suggestions[0];
  const rest = suggestions.slice(1);

  const open = (s: ResumeSuggestion) => {
    if (s.openNote) {
      navigate({ name: "note", itemId: s.openItemId });
    } else {
      openItem(s.openItemId);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface-context px-4 py-3",
        "shadow-[var(--shadow-warm)]"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => open(first)}
          className="flex min-w-0 items-start gap-3 text-start"
        >
          <Sparkles className="mt-1 h-4 w-4 shrink-0 text-sage" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t("resume.kicker")}
            </span>
            <span className="mt-0.5 block truncate font-serif text-[15.5px] text-ink">
              {first.title}
            </span>
            <span className="block text-[12.5px] text-muted-foreground">
              {rt(first.message)}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-[12.5px] text-ink-soft hover:bg-surface"
            onClick={() => open(first)}
          >
            {t("resume.open")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-[12.5px] text-muted-foreground hover:bg-surface"
            onClick={() =>
              void run(
                laterSuggestion(first.sourceKind, first.sourceId, first.presentationKey),
                { quiet: true }
              )
            }
          >
            {t("resume.later")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-[12.5px] text-muted-foreground hover:bg-surface"
            onClick={() =>
              void run(
                dismissSuggestion(first.sourceKind, first.sourceId, first.presentationKey),
                { quiet: true }
              )
            }
          >
            {t("resume.dismiss")}
          </Button>
        </div>
      </div>
      {rest.length > 0 ? (
        <div className="mt-1 border-t border-border/70 pt-1.5">
          {expanded ? (
            <ul className="space-y-1">
              {rest.map((s) => (
                <li key={s.presentationKey} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => open(s)}
                    className="min-w-0 flex-1 truncate text-start text-[13px] text-ink-soft hover:text-ink"
                  >
                    {s.title}
                    <span className="ms-2 text-[11.5px] text-muted-foreground">{rt(s.message)}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-2 text-[11.5px] text-muted-foreground hover:bg-surface"
                    onClick={() =>
                      void run(dismissSuggestion(s.sourceKind, s.sourceId, s.presentationKey), {
                        quiet: true,
                      })
                    }
                  >
                    {t("resume.dismiss")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-0.5 text-[12px] text-muted-foreground hover:text-ink-soft"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")}
            />
            {expanded ? t("resume.fewer") : t("resume.more", { count: rest.length })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
