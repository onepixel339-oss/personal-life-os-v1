/* More screen — secondary destinations (§2.2, §14.6) + your profile card. */

"use client";

import {
  Archive,
  BookHeart,
  Database,
  Film,
  NotebookPen,
  Repeat,
  Settings as SettingsIcon,
  UserRound,
} from "lucide-react";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { useRegisteredAt, useUserName } from "@/lib/lifeos/hooks";
import { formatDate } from "@/lib/lifeos/dates";
import { useT } from "@/lib/lifeos/i18n";
import { Card } from "../shared/primitives";
import { cn } from "@/lib/utils";

export function MoreScreen() {
  const navigate = useUIStore((s) => s.navigate);
  const { t } = useT();
  const userName = useUserName();
  const registeredAt = useRegisteredAt();

  const destinations = [
    {
      name: t("more.notes"),
      icon: NotebookPen,
      description: t("more.notesDesc"),
      route: { name: "notes" } as const,
    },
    {
      name: t("more.entertainment"),
      icon: Film,
      description: t("more.entertainmentDesc"),
      route: { name: "entertainment" } as const,
    },
    {
      name: t("more.review"),
      icon: BookHeart,
      description: t("more.reviewDesc"),
      route: { name: "review" } as const,
    },
    {
      name: t("more.routines"),
      icon: Repeat,
      description: t("more.routinesDesc"),
      route: { name: "routines" } as const,
    },
    {
      name: t("more.settings"),
      icon: SettingsIcon,
      description: t("more.settingsDesc"),
      route: { name: "settings" } as const,
    },
    {
      name: t("more.backup"),
      icon: Database,
      description: t("more.backupDesc"),
      route: { name: "settings", section: "data" } as const,
    },
    {
      name: t("more.archived"),
      icon: Archive,
      description: t("more.archivedDesc"),
      route: { name: "archived" } as const,
    },
  ] as const;

  const memberSince = registeredAt
    ? t("more.profile.memberSince", {
        date: formatDate(registeredAt.slice(0, 10)),
      })
    : null;

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-serif text-[26px] leading-tight text-foreground md:text-[32px]">
          {t("more.title")}
        </h1>
        <p className="mt-1 max-w-xl font-serif italic text-[15px] text-muted-foreground">
          {t("more.subtitle")}
        </p>
      </header>

      {/* your profile — name-only account */}
      <button
        type="button"
        onClick={() => navigate({ name: "settings", section: "account" })}
        className="mb-4 flex w-full items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3.5 text-start transition-shadow hover:shadow-[var(--shadow-warm)]"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft/50 font-serif text-[19px] text-primary-deep"
          aria-hidden
        >
          {userName ? userName.trim().charAt(0) : <UserRound className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-[16.5px] text-ink" dir="auto">
            {userName ?? t("common.loading")}
          </span>
          {memberSince ? (
            <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
              {memberSince}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 rounded-full border border-border bg-surface-context px-3 py-1 text-[12px] text-ink-soft">
          {t("more.profile.edit")}
        </span>
      </button>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {destinations.map(({ name, icon: Icon, description, route }) => (
          <button
            key={name}
            type="button"
            onClick={() => navigate(route)}
            className={cn(
              "flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-start",
              "transition-shadow hover:shadow-[var(--shadow-warm)]"
            )}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft/40 text-primary-deep"
              aria-hidden
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block font-serif text-[16px] text-ink">{name}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
                {description}
              </span>
            </span>
          </button>
        ))}
      </div>
      <Card className="mt-4 px-4 py-3">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          {t("more.remindersNote")}
        </p>
      </Card>
    </div>
  );
}
