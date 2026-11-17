/* Weekly backup nudge (v1.3) — the one honest alarm in the app: not a
   streak, not a scolding — a single line that says a full week passed and
   the life inside this device deserves five minutes of copying.
   The button exports immediately; no detour through Settings.
   The nudge marks itself seen (backup.weeklyNudge.at) whether exported
   or dismissed, and stays quiet for the rest of the week. */

"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/lifeos/i18n";
import { run } from "@/lib/lifeos/run";
import { SETTING_KEYS } from "@/lib/lifeos/defaults";
import { setSetting } from "@/lib/lifeos/db";
import { toast } from "sonner";

export function BackupNudgeCard({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  const markSeen = async () => {
    try {
      await setSetting(SETTING_KEYS.backupWeeklyNudgeAt, Date.now());
    } catch {
      /* quiet — a courtesy is not a ledger */
    }
  };

  const exportNow = async () => {
    setBusy(true);
    const { downloadBackup } = await import(
      "@/lib/lifeos/services/backup-service"
    );
    const res = await run(downloadBackup(true), { quiet: true });
    setBusy(false);
    if (res.ok) {
      toast(t("backup.nudgeExportedToast"));
      await markSeen();
      onDone();
    }
  };

  return (
    <div className="rounded-2xl border border-primary-soft bg-surface-context px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-[15.5px] text-ink">
            {t("backup.nudgeTitle")}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("backup.nudgeBody")}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("backup.nudgeLater")}
          onClick={() => {
            void markSeen();
            onDone();
          }}
          className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-raised hover:text-ink-soft"
        >
          {t("backup.nudgeLater")}
        </button>
      </div>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => void exportNow()}
        className="mt-3 h-9 rounded-full bg-primary px-4 text-[12.5px] text-primary-foreground hover:bg-primary-deep"
      >
        <Download className="h-4 w-4" />
        {busy ? t("backup.nudgeAction") + "…" : t("backup.nudgeAction")}
      </Button>
    </div>
  );
}
