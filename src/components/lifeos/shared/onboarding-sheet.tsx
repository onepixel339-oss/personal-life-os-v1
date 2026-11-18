/* Onboarding sheet (v1.5) — three light cards right after the name:
     1. بدايتك: theme + week start + where the day flips.
     2. فترات يومك: rename / quiet the five seeded periods.
     3. أول حاجة: one capture, so the first habit is born on day one.
   Every step is skippable, nothing is forced, and existing users
   (welcomeDismissed already set) never see it. F1 stays intact:
   nothing is seeded content-wise beyond what the app already owns. */

"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ArrowLeft, ArrowRight, Sunrise } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/lifeos/db";
import { SETTING_KEYS, DEFAULT_FIRST_DAY } from "@/lib/lifeos/defaults";
import { run } from "@/lib/lifeos/run";
import { capture } from "@/lib/lifeos/services/inbox-service";
import {
  renamePeriodSetting,
  setDayStart,
  setPeriodEnabled,
} from "@/lib/lifeos/services/settings-service";
import { periodName, useT } from "@/lib/lifeos/i18n";
import { cn } from "@/lib/utils";

export function OnboardingSheet({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const { theme, setTheme } = useTheme();
  const prefs = useLiveQuery(async () => {
    const rows = await db.appSettings.toArray();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      firstDay:
        (map.get(SETTING_KEYS.firstDayOfWeek) as number) ?? DEFAULT_FIRST_DAY,
      dayStart: (map.get(SETTING_KEYS.dayStart) as string) ?? "fajr",
    };
  }, []);
  const periods = useLiveQuery(
    () => db.periodSettings.orderBy("order").toArray(),
    []
  );

  const [step, setStep] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [firstDay, setFirstDay] = useState<string>("6");
  const [dayStart, setDayStartState] = useState<"fajr" | "midnight">("fajr");
  const [firstThing, setFirstThing] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (prefs) {
      setFirstDay(String(prefs.firstDay));
      setDayStartState(prefs.dayStart === "midnight" ? "midnight" : "fajr");
    }
  }, [prefs]);

  const totalSteps = 3;

  const finish = async (captured: boolean) => {
    setBusy(true);
    try {
      await db.appSettings.bulkPut([
        { key: SETTING_KEYS.onboardingDone, value: true, updatedAt: Date.now() },
        { key: SETTING_KEYS.welcomeDismissed, value: true, updatedAt: Date.now() },
      ]);
      const { toast } = await import("sonner");
      toast(
        captured
          ? t("onboarding.doneCapturedToast")
          : t("onboarding.doneToast")
      );
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(42,31,23,0.35)] backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.title")}
    >
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface-raised px-5 pb-6 pt-5 shadow-[var(--shadow-warm)] sm:rounded-2xl">
        {/* progress dots */}
        <div className="mb-3 flex items-center justify-center gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i + 1 === step ? "w-5 bg-primary" : "w-1.5 bg-border-strong/60"
              )}
              aria-hidden
            />
          ))}
        </div>

        {step === 1 ? (
          <div>
            <p className="font-serif text-[19px] text-ink">
              {t("onboarding.step1Title")}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("onboarding.step1Subtitle")}
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[12px] font-medium text-ink-soft">
                  {t("miy.appearance")}
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  {(
                    [
                      { key: "light", label: t("miy.light") },
                      { key: "dark", label: t("miy.dark") },
                      { key: "system", label: t("miy.system") },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setTheme(o.key)}
                      className={cn(
                        "h-10 flex-1 rounded-xl border text-[13px] font-medium transition-colors",
                        mounted && theme === o.key
                          ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                          : "border-border bg-surface text-ink-soft"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-ink-soft">
                  {t("miy.weekStarts")}
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  {[
                    { v: "0", label: t("miy.sunday") },
                    { v: "1", label: t("miy.monday") },
                    { v: "6", label: t("miy.saturday") },
                  ].map((d) => (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() => setFirstDay(d.v)}
                      className={cn(
                        "h-10 flex-1 rounded-xl border text-[13px] font-medium transition-colors",
                        firstDay === d.v
                          ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                          : "border-border bg-surface text-ink-soft"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-ink-soft">
                  {t("onboarding.dayStarts")}
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  {(
                    [
                      { key: "fajr", label: t("onboarding.dayStartFajr") },
                      { key: "midnight", label: t("onboarding.dayStartMidnight") },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setDayStartState(o.key)}
                      className={cn(
                        "h-10 flex-1 rounded-xl border text-[13px] font-medium transition-colors",
                        dayStart === o.key
                          ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                          : "border-border bg-surface text-ink-soft"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  <Sunrise className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                  {dayStart === "fajr"
                    ? t("onboarding.dayStartFajrNote")
                    : t("onboarding.dayStartMidnightNote")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <p className="font-serif text-[19px] text-ink">
              {t("onboarding.step2Title")}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("onboarding.step2Subtitle")}
            </p>
            <ul className="mt-4 space-y-2">
              {(periods ?? []).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2"
                >
                  <Input
                    key={p.id}
                    dir="auto"
                    defaultValue={p.name}
                    aria-label={t("onboarding.periodNameAria")}
                    className="h-9 flex-1 rounded-lg border-transparent bg-transparent px-1 text-[14px] focus-visible:border-border"
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== p.name) {
                        void renamePeriodSetting(p.id, e.target.value);
                      }
                    }}
                  />
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(v) => void setPeriodEnabled(p.id, v)}
                    aria-label={t("onboarding.periodToggleAria", {
                      name: periodName(p.name),
                    })}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {t("onboarding.step2Note")}
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <p className="font-serif text-[19px] text-ink">
              {t("onboarding.step3Title")}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("onboarding.step3Subtitle")}
            </p>
            <form
              className="mt-4 flex items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!firstThing.trim() || busy) return;
                setBusy(true);
                try {
                  const res = await run(capture(firstThing), { quiet: true });
                  if (res.ok) await finish(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Input
                dir="auto"
                autoFocus
                value={firstThing}
                onChange={(e) => setFirstThing(e.target.value)}
                placeholder={t("onboarding.firstThingPlaceholder")}
                className="h-11 rounded-xl border-border bg-surface text-[15px]"
              />
              <Button
                type="submit"
                disabled={!firstThing.trim() || busy}
                className="h-11 shrink-0 rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary-deep"
              >
                {t("onboarding.captureIt")}
              </Button>
            </form>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {t("onboarding.step3Note")}
            </p>
          </div>
        ) : null}

        {/* footer */}
        <div className="mt-5 flex items-center justify-between">
          <Button
            variant="ghost"
            className="rounded-full text-muted-foreground"
            onClick={() =>
              void (async () => {
                if (step === 1) {
                  // v1.5.1 (review N5): "skip all" still keeps the picks the
                  // user already made on this step — silently throwing them
                  // away was the opposite of gentle.
                  const { setCalendarSettings } = await import(
                    "@/lib/lifeos/services/settings-service"
                  );
                  await setCalendarSettings({
                    firstDayOfWeek: Number(firstDay) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
                  });
                  await setDayStart(dayStart);
                  await finish(false);
                } else {
                  setStep(step - 1);
                }
              })()
            }
          >
            {step === 1 ? t("onboarding.skipAll") : (
              <span className="flex items-center gap-1">
                <ArrowRight className="h-3.5 w-3.5 rtl:hidden" />
                <ArrowLeft className="h-3.5 w-3.5 ltr:hidden" />
                {t("onboarding.back")}
              </span>
            )}
          </Button>
          {step < totalSteps ? (
            <Button
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
              onClick={async () => {
                // commit step 1 choices before moving on
                if (step === 1) {
                  const { setCalendarSettings } = await import(
                    "@/lib/lifeos/services/settings-service"
                  );
                  await setCalendarSettings({
                    firstDayOfWeek: Number(firstDay) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
                  });
                  await setDayStart(dayStart);
                }
                setStep(step + 1);
              }}
            >
              <span className="flex items-center gap-1">
                {t("onboarding.next")}
                <ArrowLeft className="h-3.5 w-3.5 rtl:hidden" />
                <ArrowRight className="h-3.5 w-3.5 ltr:hidden" />
              </span>
            </Button>
          ) : (
            <Button
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
              disabled={busy}
              onClick={() => void finish(false)}
            >
              {t("miy.done")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
