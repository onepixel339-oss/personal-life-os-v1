/* Coach line (v1.5) — ONE quiet sentence per screen, first visit only.
   Not a tooltip layer, not a tour: a single dismissible line that says
   what this screen IS, then gets out of the way forever. */

"use client";

import { X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";
import { useT } from "@/lib/lifeos/i18n";

export function CoachLine({
  settingKey,
  messageKey,
}: {
  settingKey: string;
  messageKey: string;
}) {
  // v1.5.1 (review N4): a count, not the row — so the loading frame
  // (undefined) hides the line instead of flashing it every mount.
  const dismissedCount = useLiveQuery(
    () => db.appSettings.where("key").equals(settingKey).count(),
    [settingKey]
  );
  const { t } = useT();
  if (dismissedCount === undefined || dismissedCount > 0) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface-context/70 px-4 py-2.5">
      <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
        {t(messageKey)}
      </p>
      <button
        type="button"
        aria-label={t("coach.dismiss")}
        title={t("coach.dismiss")}
        onClick={() => {
          void db.appSettings.put({
            key: settingKey,
            value: true,
            updatedAt: Date.now(),
          });
        }}
        className="shrink-0 rounded-full p-1 text-muted-foreground/70 transition-colors hover:text-ink-soft"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
