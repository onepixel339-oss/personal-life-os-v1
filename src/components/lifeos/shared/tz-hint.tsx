/* Timezone-change hint (v1.2) — Egypt flips between summer and winter time
   every year, and a manual prayer schedule drifts a full hour silently.
   Calculated mode needs nothing (the device clock follows DST); manual mode
   gets this one gentle line. Dismissing stores the new offset. */

"use client";

import { Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/lifeos/i18n";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { setSetting } from "@/lib/lifeos/db";
import { SETTING_KEYS } from "@/lib/lifeos/defaults";

export function TzHintCard({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const navigate = useUIStore((s) => s.navigate);

  const dismiss = async () => {
    await setSetting(SETTING_KEYS.tzLastOffset, new Date().getTimezoneOffset());
    onDone();
  };

  return (
    <div className="mx-auto mt-4 max-w-[720px] rounded-2xl border border-sage/40 bg-surface-context px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-serif text-[16px] text-ink">
            <Clock3 className="h-4 w-4 text-sage" />
            {t("tz.title")}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("tz.body")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full border-border bg-surface"
              onClick={() => {
                void dismiss();
                navigate({ name: "settings", section: "prayer" });
              }}
            >
              {t("tz.openPrayer")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 rounded-full text-muted-foreground"
              onClick={() => void dismiss()}
            >
              {t("tz.ok")}
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("tz.dismiss")}
          onClick={() => void dismiss()}
          className="rounded-full p-1 text-muted-foreground/70 hover:text-ink-soft"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
