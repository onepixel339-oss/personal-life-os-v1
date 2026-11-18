/* Friday alarm card (v1.2) — the app never notifies (by philosophy), but it
   can teach the one weekly ritual: borrow the phone's own clock. One-time
   suggestion with a copy button; during Ramadan the copy moves past
   Taraweeh. Auto-hides once done or dismissed. */

"use client";

import { useState } from "react";
import { AlarmClock, Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/lifeos/i18n";
import { db } from "@/lib/lifeos/db";
import { SETTING_KEYS } from "@/lib/lifeos/defaults";
import { isRamadan } from "@/lib/lifeos/ramadan";
import { toast } from "sonner";

export { shouldShowFridayAlarm } from "@/lib/lifeos/friday";

export function FridayAlarmCard({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [ramadan] = useState(() => isRamadan());

  const dismiss = async (done: boolean) => {
    await db.appSettings.bulkPut([
      { key: SETTING_KEYS.fridayAlarmDismissed, value: true, updatedAt: Date.now() },
      ...(done
        ? [
            {
              key: SETTING_KEYS.fridayAlarmDone,
              value: true,
              updatedAt: Date.now(),
            },
          ]
        : []),
    ]);
    onDone();
  };

  const copyAlarmText = async () => {
    const text = t(ramadan ? "friday.alarmTextRamadan" : "friday.alarmText");
    try {
      await navigator.clipboard.writeText(text);
      toast(t("friday.copied"));
    } catch {
      // clipboard denied (e.g. not-installed Safari) — show the text to copy
      toast(text);
    }
  };

  return (
    <div className="mx-auto mt-4 max-w-[720px] rounded-2xl border border-primary-soft bg-surface-context px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-serif text-[16px] text-ink">
            <AlarmClock className="h-4 w-4 text-primary-deep" />
            {t("friday.title")}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {t(ramadan ? "friday.bodyRamadan" : "friday.body")}
          </p>
          <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-[12.5px] text-ink-soft" dir="auto">
            {t(ramadan ? "friday.alarmTextRamadan" : "friday.alarmText")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full border-border bg-surface"
              onClick={() => void copyAlarmText()}
            >
              <Copy className="h-4 w-4" /> {t("friday.copy")}
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
              onClick={() => void dismiss(true)}
            >
              <Check className="h-4 w-4" /> {t("friday.done")}
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("friday.dismiss")}
          onClick={() => void dismiss(false)}
          className="rounded-full p-1 text-muted-foreground/70 hover:text-ink-soft"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
