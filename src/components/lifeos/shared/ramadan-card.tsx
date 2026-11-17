/* Ramadan rhythm card (v1.2) — one gentle, once-a-season suggestion to
   rename the five default periods to the Ramadan rhythm (Suhoor → Taraweeh).
   Names and taglines only: prayer anchors stay exactly where they are.
   The original settings are backed up and restored automatically after
   Ramadan ends. */

"use client";

import { useState } from "react";
import { MoonStar, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/lifeos/i18n";
import { toast } from "sonner";
import {
  applyRamadanPeriods,
  markRamadanPromptShown,
} from "@/lib/lifeos/services/ramadan-service";
import { run } from "@/lib/lifeos/run";

export function RamadanCard({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  const dismiss = async () => {
    await markRamadanPromptShown();
    onDone();
  };

  return (
    <div className="mx-auto mt-4 max-w-[720px] rounded-2xl border border-primary-soft bg-surface-context px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-serif text-[16px] text-ink">
            <MoonStar className="h-4 w-4 text-primary-deep" />
            {t("ramadan.cardTitle")}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("ramadan.cardBody")}
          </p>
          <p className="mt-1 text-[11.5px] italic leading-relaxed text-muted-foreground/80">
            {t("ramadan.cardNote")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await run(applyRamadanPeriods(), { quiet: true });
                await markRamadanPromptShown();
                setBusy(false);
                if (res.ok) toast(t("ramadan.appliedToast"));
                onDone();
              }}
            >
              {t("ramadan.apply")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 rounded-full text-muted-foreground"
              onClick={() => void dismiss()}
            >
              {t("ramadan.notNow")}
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("ramadan.dismiss")}
          onClick={() => void dismiss()}
          className="rounded-full p-1 text-muted-foreground/70 hover:text-ink-soft"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
