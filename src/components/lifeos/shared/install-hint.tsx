/* Install hint (v1.1) — a gentle card in the welcome stack teaching the
   one thing that protects local data on iOS/Android: installing the app
   to the home screen. Auto-hides once installed or dismissed. */

"use client";

import { useEffect, useState } from "react";
import { Check, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/lifeos/i18n";
import { db } from "@/lib/lifeos/db";
import { SETTING_KEYS } from "@/lib/lifeos/defaults";
import {
  getInstallPrompt,
  installPlatform,
  isStandalone,
  onInstallAvailabilityChange,
  triggerInstall,
} from "@/lib/lifeos/install-prompt";

export function InstallHintCard({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  // this card only mounts client-side (after registration), so lazy
  // initializers are safe — no hydration concerns, no sync setState in effects
  const [platform] = useState<"ios" | "android" | "desktop">(() =>
    installPlatform()
  );
  const [canPrompt, setCanPrompt] = useState(() => !!getInstallPrompt());
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    return onInstallAvailabilityChange(() => {
      setCanPrompt(!!getInstallPrompt());
    });
  }, []);

  const dismiss = async () => {
    await db.appSettings.put({
      key: SETTING_KEYS.installHintDismissed,
      value: true,
      updatedAt: Date.now(),
    });
    onDone();
  };

  // already installed on mount → persist the dismissal quietly, never show again
  useEffect(() => {
    if (installed) void dismiss();
  }, []);

  if (installed) return null;

  return (
    <div className="mx-auto mt-4 max-w-[720px] rounded-2xl border border-sage/40 bg-surface-context px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-serif text-[16px] text-ink">
            <Smartphone className="h-4 w-4 text-sage" />
            {t("install.title")}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("install.body")}
          </p>

          {platform === "ios" ? (
            <ol className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-ink-soft">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-sage">١.</span>
                <span>
                  {t("install.iosStep1")}{" "}
                  <Share className="mx-0.5 inline h-3.5 w-3.5 align-[-2px]" />
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-sage">٢.</span>
                <span>{t("install.iosStep2")}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-sage">٣.</span>
                <span>{t("install.iosStep3")}</span>
              </li>
            </ol>
          ) : platform === "android" ? (
            <div className="mt-3">
              {canPrompt ? (
                <Button
                  size="sm"
                  className="h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
                  onClick={async () => {
                    const result = await triggerInstall();
                    if (result === "accepted") {
                      setInstalled(true);
                      await dismiss();
                    }
                  }}
                >
                  <Check className="h-4 w-4" /> {t("install.installNow")}
                </Button>
              ) : (
                <ol className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-sage">١.</span>
                    <span>{t("install.androidStep1")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-sage">٢.</span>
                    <span>{t("install.androidStep2")}</span>
                  </li>
                </ol>
              )}
            </div>
          ) : (
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
              {t("install.desktopStep")}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={t("install.dismiss")}
          onClick={() => void dismiss()}
          className="rounded-full p-1 text-muted-foreground/70 hover:text-ink-soft"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
