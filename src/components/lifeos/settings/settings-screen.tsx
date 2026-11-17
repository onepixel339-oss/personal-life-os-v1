/* Settings — appearance, calendar, periods, prayer, data (§3.16, §14.11). */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  Check,
  Download,
  HardDriveDownload,
  History,
  Info,
  KeyRound,
  Lock,
  LockOpen,
  Monitor,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePeriodSettings,
  useRegisteredAt,
  useUserName,
  useViewPrefs,
} from "@/lib/lifeos/hooks";
import {
  calcMethodLabel,
  prayerLabel,
  rt,
  useT,
} from "@/lib/lifeos/i18n";
import { useUIStore, type SettingsSection } from "@/lib/lifeos/ui-store";
import { run } from "@/lib/lifeos/run";
import { db, getSetting } from "@/lib/lifeos/db";
import { SETTING_KEYS } from "@/lib/lifeos/defaults";
import {
  clearErrorLog,
  formatErrorLogText,
  readErrorLog,
  type ErrorLogEntry,
} from "@/lib/lifeos/error-log";
import {
  setCalendarSettings,
  setInboxBadgeEnabled,
} from "@/lib/lifeos/services/settings-service";
import {
  CALC_METHOD_LABELS,
  DEFAULT_MANUAL_TIMES,
  PRAYER_KEYS,
  type CalcMethod,
  type PrayerSettings,
} from "@/lib/lifeos/prayer";
import { resolvePrayerTimes } from "@/lib/lifeos/prayer";
import { formatDate, todayLocal } from "@/lib/lifeos/dates";
import type { Anchor, PeriodSetting } from "@/lib/lifeos/types";
import { uid } from "@/lib/lifeos/ids";
import { emitChange } from "@/lib/lifeos/events";
import { defaultPeriodSettings } from "@/lib/lifeos/defaults";
import {
  createAutoBackup,
  downloadBackup,
  getStorageInfo,
  listAutoBackups,
  restoreAutoBackup,
  undoRestore,
  validateBackupFile,
  applyRestore,
  type AutoBackupMeta,
  type StorageInfo,
  type ValidationSummary,
} from "@/lib/lifeos/services/backup-service";
import {
  changePin,
  hasPin,
  isValidPinFormat,
  removePin,
  setPin,
} from "@/lib/lifeos/services/pin-service";
import { checkIntegrity } from "@/lib/lifeos/services/integrity-service";
import { reSnapshotPeriods } from "@/lib/lifeos/services/planning-service";
import { toast } from "sonner";
import {
  Card,
  Chip,
  PageHeader,
  SectionLabel,
} from "../shared/primitives";
import { ConfirmDialog } from "../shared/dialogs";
import { cn } from "@/lib/utils";

const SECTIONS = [
  "account",
  "appearance",
  "calendar",
  "periods",
  "prayer",
  "reminders",
  "privacy",
  "data",
  "about",
] as const;

export function SettingsScreen({ section }: { section?: SettingsSection }) {
  const [active, setActive] = useState<SettingsSection | "data">(section ?? "appearance");
  const [prevSection, setPrevSection] = useState<SettingsSection | undefined>(section);
  const { t } = useT();
  if (section !== prevSection) {
    setPrevSection(section);
    if (section) setActive(section);
  }

  return (
    <div>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <Chip
            key={s}
            tone={active === s ? "terracotta" : "neutral"}
            onClick={() => setActive(s)}
          >
            {t(`settings.${s}`)}
          </Chip>
        ))}
      </div>
      <div>
        {active === "account" ? <AccountSection /> : null}
        {active === "appearance" ? <AppearanceSection /> : null}
        {active === "calendar" ? <CalendarSection /> : null}
        {active === "periods" ? <PeriodsSection /> : null}
        {active === "prayer" ? <PrayerSection /> : null}
        {active === "reminders" ? <RemindersSection /> : null}
        {active === "privacy" ? <PrivacySection /> : null}
        {active === "data" ? <DataSection /> : null}
        {active === "about" ? <AboutSection /> : null}
      </div>
    </div>
  );
}

/* ---------- account (name-only registration) ---------- */

function AccountSection() {
  const { t, lang, setLang: switchLang } = useT();
  const userName = useUserName();
  const registeredAt = useRegisteredAt();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [prevUser, setPrevUser] = useState<string | null | undefined>(undefined);

  // Adjust during render (same pattern as SettingsScreen) instead of an effect.
  if (userName !== prevUser) {
    setPrevUser(userName);
    if (userName !== undefined) setName(userName ?? "");
  }

  const save = async () => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return;
    await db.appSettings.put({
      key: SETTING_KEYS.userName,
      value: clean,
      updatedAt: Date.now(),
    });
    setSaved(true);
    toast(t("account.saved"));
  };

  return (
    <div className="space-y-4">
      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("settings.account")}</SectionLabel>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {t("account.desc")}
        </p>
        <label className="mt-3 block max-w-sm">
          <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
            {t("account.name")}
          </span>
          <div className="flex gap-2">
            <Input
              value={name}
              maxLength={40}
              dir="auto"
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              placeholder={t("account.namePlaceholder")}
              className="h-10 rounded-xl border-border bg-surface"
            />
            <Button
              className="h-10 shrink-0 rounded-full bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary-deep"
              disabled={!name.trim()}
              onClick={() => void save()}
            >
              {t("account.save")}
            </Button>
          </div>
        </label>
        {saved ? (
          <p className="mt-2 text-[12px] text-sage">{t("account.saved")}</p>
        ) : null}
        {registeredAt ? (
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            {t("account.memberSince", {
              date: new Date(registeredAt).toLocaleDateString(
                lang === "ar" ? "ar-EG" : undefined
              ),
            })}
          </p>
        ) : null}
      </Card>

      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("account.language")}</SectionLabel>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {t("account.languageDesc")}
        </p>
        <div className="mt-3 flex gap-1.5">
          {(
            [
              { key: "ar", label: t("account.langAr") },
              { key: "en", label: t("account.langEn") },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => void switchLang(o.key)}
              className={cn(
                "h-10 flex-1 rounded-xl border text-[13.5px] font-medium transition-colors",
                lang === o.key
                  ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                  : "border-border bg-surface text-ink-soft"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- appearance ---------- */

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { t, lang, setLang: switchLang } = useT();
  const [badge, setBadge] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    void db.appSettings.get(SETTING_KEYS.inboxBadge).then((row) => {
      if (row) setBadge(!!row.value);
    });
  }, []);
  const options = [
    { key: "light", label: t("appearance.light"), icon: Sun },
    { key: "dark", label: t("appearance.dark"), icon: Moon },
    { key: "system", label: t("appearance.system"), icon: Monitor },
  ] as const;
  return (
    <div className="space-y-4">
      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("settings.appearance")}</SectionLabel>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("appearance.desc")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTheme(key)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13.5px] font-medium transition-colors",
                theme === key
                  ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                  : "border-border bg-surface text-ink-soft hover:border-border-strong"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </Card>
      <Card className="flex items-center justify-between gap-4 px-4 py-3.5 md:px-5">
        <div>
          <p className="text-[14px] text-ink">{t("appearance.inboxBadge")}</p>
          <p className="text-[12.5px] text-muted-foreground">
            {t("appearance.inboxBadgeDesc")}
          </p>
        </div>
        <Switch
          checked={badge ?? true}
          onCheckedChange={async (v) => {
            setBadge(v);
            await setInboxBadgeEnabled(v);
          }}
          aria-label={t("appearance.inboxBadgeAria")}
        />
      </Card>
      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("account.language")}</SectionLabel>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("account.languageDesc")}
        </p>
        <div className="mt-3 flex gap-1.5">
          {(
            [
              { key: "ar", label: t("account.langAr") },
              { key: "en", label: t("account.langEn") },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => void switchLang(o.key)}
              className={cn(
                "h-10 flex-1 rounded-xl border text-[13.5px] font-medium transition-colors",
                lang === o.key
                  ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                  : "border-border bg-surface text-ink-soft"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- calendar ---------- */

function CalendarSection() {
  const prefs = useViewPrefs();
  const { t } = useT();
  if (!prefs) return null;
  const days = [0, 1, 2, 3, 4, 5, 6];
  return (
    <Card className="px-4 py-4 md:px-5">
      <SectionLabel>{t("settings.calendar")}</SectionLabel>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">{t("calendar.firstDay")}</span>
          <Select
            value={String(prefs.calendar.firstDayOfWeek)}
            onValueChange={async (v) => {
              await setCalendarSettings({ firstDayOfWeek: Number(v) as 0 });
            }}
          >
            <SelectTrigger className="w-full rounded-xl border-border bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border bg-surface-raised">
              {days.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {t(`calendar.day.${d}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">{t("calendar.dateFormat")}</span>
          <Select
            value={prefs.calendar.dateFormat}
            onValueChange={async (v) => {
              await setCalendarSettings({
                dateFormat: v as "dmy" | "mdy" | "ymd",
              });
            }}
          >
            <SelectTrigger className="w-full rounded-xl border-border bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border bg-surface-raised">
              <SelectItem value="dmy">{formatDate("2026-11-13", "dmy")}</SelectItem>
              <SelectItem value="mdy">{formatDate("2026-11-13", "mdy")}</SelectItem>
              <SelectItem value="ymd">{formatDate("2026-11-13", "ymd")}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div className="grid gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">{t("calendar.timeFormat")}</span>
          <div className="flex gap-1.5">
            {[
              { v: false, label: "12h" },
              { v: true, label: "24h" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setCalendarSettings({ timeFormat24: o.v })}
                className={cn(
                  "h-10 flex-1 rounded-xl border text-[13px] font-medium transition-colors",
                  prefs.calendar.timeFormat24 === o.v
                    ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                    : "border-border bg-surface text-ink-soft"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {t("calendar.note")}
      </p>
    </Card>
  );
}

/* ---------- daily periods editor ---------- */

function PeriodsSection() {
  const settings = usePeriodSettings();
  const { t } = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  if (settings === undefined) return null;

  const persist = async (next: PeriodSetting[]) => {
    await db.transaction("rw", db.periodSettings, async () => {
      await db.periodSettings.clear();
      await db.periodSettings.bulkPut(
        next.map((s, i) => ({ ...s, order: i + 1 }))
      );
    });
    emitChange(["periodSettings"]);
  };

  const update = (id: string, patch: Partial<PeriodSetting>) => {
    void persist(
      settings.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = settings.findIndex((s) => s.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= settings.length) return;
    const next = [...settings];
    [next[idx], next[target]] = [next[target], next[idx]];
    void persist(next);
  };

  return (
    <div className="space-y-4">
      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("settings.periods")}</SectionLabel>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {t("periods.desc")}
        </p>
        <ul className="mt-3 space-y-2">
          {settings.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                "rounded-xl border bg-surface px-3.5 py-3",
                s.enabled ? "border-border" : "border-border/60 opacity-60"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex flex-col">
                    <button
                      type="button"
                      aria-label={t("periods.moveUp")}
                      className="text-muted-foreground/60 hover:text-ink-soft"
                      onClick={() => move(s.id, -1)}
                      disabled={i === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={t("periods.moveDown")}
                      className="text-muted-foreground/60 hover:text-ink-soft"
                      onClick={() => move(s.id, 1)}
                      disabled={i === settings.length - 1}
                    >
                      ↓
                    </button>
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-serif text-[15.5px] text-ink">
                      {s.name}
                    </p>
                    {s.tagline ? (
                      <p className="truncate text-[12px] italic text-muted-foreground">
                        {s.tagline}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {anchorLabel(s.startAnchor, t)} → {anchorLabel(s.endAnchor, t)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-soft">
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={(v) => update(s.id, { enabled: v })}
                      aria-label={t("periods.enableAria", { name: s.name })}
                    />
                    {s.enabled ? t("periods.shown") : t("periods.hidden")}
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full px-2.5 text-[12px] text-muted-foreground"
                    onClick={() => setEditing(editing === s.id ? null : s.id)}
                  >
                    {editing === s.id ? t("common.close") : t("common.edit")}
                  </Button>
                  {!s.isDefault ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 rounded-full p-0 text-muted-foreground/60 hover:text-[#a5533c]"
                      aria-label={t("periods.deleteAria", { name: s.name })}
                      onClick={() => {
                        void persist(settings.filter((x) => x.id !== s.id));
                        toast(t("periods.removedToast", { name: s.name }));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {editing === s.id ? (
                <div className="mt-3 grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-[11.5px] font-medium text-ink-soft">{t("periods.name")}</span>
                    <Input
                      dir="auto"
                      value={s.name}
                      onChange={(e) => update(s.id, { name: e.target.value })}
                      className="h-9 rounded-xl border-border bg-surface"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11.5px] font-medium text-ink-soft">{t("periods.tagline")}</span>
                    <Input
                      dir="auto"
                      value={s.tagline ?? ""}
                      onChange={(e) => update(s.id, { tagline: e.target.value })}
                      className="h-9 rounded-xl border-border bg-surface"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11.5px] font-medium text-ink-soft">{t("periods.startsAt")}</span>
                    <Select
                      value={anchorValue(s.startAnchor)}
                      onValueChange={(v) =>
                        update(s.id, { startAnchor: parseAnchor(v, s.startAnchor) })
                      }
                    >
                      <SelectTrigger className="w-full rounded-xl border-border bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border bg-surface-raised">
                        {PRAYER_KEYS.map((p) => (
                          <SelectItem key={p} value={`prayer:${p}`}>
                            {prayerLabel(p)}
                          </SelectItem>
                        ))}
                        <SelectItem value="clock:">
                          {t("periods.clock")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {s.startAnchor?.kind === "clock" ? (
                      <Input
                        type="time"
                        value={s.startAnchor.time}
                        onChange={(e) =>
                          update(s.id, {
                            startAnchor: { kind: "clock", time: e.target.value },
                          })
                        }
                        className="mt-1 h-9 rounded-xl border-border bg-surface"
                      />
                    ) : null}
                    {s.startAnchor?.kind === "prayer" ? (
                      <Input
                        inputMode="numeric"
                        value={String(s.startAnchor.offsetMin)}
                        onChange={(e) => {
                          const current = s.startAnchor;
                          const prayer =
                            current && current.kind === "prayer" ? current : null;
                          update(s.id, {
                            startAnchor: {
                              kind: "prayer",
                              prayer: prayer?.prayer ?? "fajr",
                              offsetMin:
                                Number(e.target.value.replace(/[^0-9-]/g, "")) || 0,
                              nextDay: prayer?.nextDay,
                            },
                          });
                        }}
                        placeholder={t("periods.offset")}
                        className="mt-1 h-9 rounded-xl border-border bg-surface"
                      />
                    ) : null}
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11.5px] font-medium text-ink-soft">{t("periods.endsAt")}</span>
                    <Select
                      value={anchorValue(s.endAnchor)}
                      onValueChange={(v) =>
                        update(s.id, { endAnchor: parseAnchor(v, s.endAnchor, true) })
                      }
                    >
                      <SelectTrigger className="w-full rounded-xl border-border bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border bg-surface-raised">
                        {PRAYER_KEYS.map((p) => (
                          <SelectItem key={p} value={`prayer:${p}`}>
                            {prayerLabel(p)}
                            {p === "fajr" ? ` (${t("periods.nextDay")})` : ""}
                          </SelectItem>
                        ))}
                        <SelectItem value="clock:">{t("periods.clock")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {s.endAnchor?.kind === "clock" ? (
                      <Input
                        type="time"
                        value={s.endAnchor.time}
                        onChange={(e) =>
                          update(s.id, {
                            endAnchor: { kind: "clock", time: e.target.value },
                          })
                        }
                        className="mt-1 h-9 rounded-xl border-border bg-surface"
                      />
                    ) : null}
                    {s.endAnchor?.kind === "prayer" ? (
                      <Input
                        inputMode="numeric"
                        value={String(s.endAnchor.offsetMin)}
                        onChange={(e) => {
                          const current = s.endAnchor;
                          const prayer =
                            current && current.kind === "prayer" ? current : null;
                          update(s.id, {
                            endAnchor: {
                              kind: "prayer",
                              prayer: prayer?.prayer ?? "dhuhr",
                              offsetMin:
                                Number(e.target.value.replace(/[^0-9-]/g, "")) || 0,
                              nextDay:
                                prayer?.nextDay ??
                                (prayer?.prayer ?? "dhuhr") === "fajr",
                            },
                          });
                        }}
                        placeholder={t("periods.offset")}
                        className="mt-1 h-9 rounded-xl border-border bg-surface"
                      />
                    ) : null}
                  </label>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap justify-between gap-2">
          <Button
            variant="outline"
            className="rounded-full border-border bg-surface"
            onClick={() => {
              void persist([
                ...settings,
                {
                  id: uid(),
                  name: t("periods.newPeriod"),
                  order: settings.length + 1,
                  enabled: true,
                  mode: "fixed",
                  startAnchor: { kind: "clock", time: "09:00" },
                  endAnchor: { kind: "clock", time: "11:00" },
                  isDefault: false,
                },
              ]);
            }}
          >
            {t("periods.add")}
          </Button>
          <Button
            variant="ghost"
            className="rounded-full text-muted-foreground"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw className="h-4 w-4" /> {t("periods.reset")}
          </Button>
        </div>
      </Card>
      <Card className="px-4 py-3.5 md:px-5">
        <SectionLabel>{t("periods.preview")}</SectionLabel>
        <PeriodPreview />
      </Card>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t("periods.resetTitle")}
        description={t("periods.resetDesc")}
        confirmLabel={t("periods.resetConfirm")}
        onConfirm={async () => {
          await persist(defaultPeriodSettings());
          toast(t("periods.resetToast"));
        }}
      />
    </div>
  );
}

function anchorLabel(anchor: Anchor | undefined, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (!anchor) return "—";
  if (anchor.kind === "clock") return anchor.time;
  const offset =
    anchor.offsetMin > 0
      ? ` +${anchor.offsetMin}${t("common.min")}`
      : anchor.offsetMin < 0
        ? ` ${anchor.offsetMin}${t("common.min")}`
        : "";
  return `${prayerLabel(anchor.prayer)}${offset}`;
}

function anchorValue(anchor: Anchor | undefined): string {
  if (!anchor) return "clock:";
  return anchor.kind === "clock" ? "clock:" : `prayer:${anchor.prayer}`;
}

function parseAnchor(value: string, current: Anchor | undefined, isEnd = false): Anchor {
  if (value.startsWith("prayer:")) {
    const prayer = value.slice(7) as Anchor & { kind: "prayer" } extends never
      ? never
      : "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";
    return {
      kind: "prayer",
      prayer,
      offsetMin:
        current && current.kind === "prayer" && current.prayer === prayer
          ? current.offsetMin
          : 0,
      nextDay: isEnd && prayer === "fajr" ? true : undefined,
    };
  }
  return {
    kind: "clock",
    time: current?.kind === "clock" ? current.time : "09:00",
  };
}

function PeriodPreview() {
  const settings = usePeriodSettings();
  const prefs = useViewPrefs();
  const { t } = useT();
  const preview = useMemo(() => {
    if (!settings || !prefs) return null;
    const { times } = resolvePrayerTimes(todayLocal(), prefs.prayer);
    return { times, settings: settings.filter((s) => s.enabled) };
  }, [settings, prefs]);
  if (!preview) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PRAYER_KEYS.map((k) => (
        <div key={k} className="rounded-xl bg-surface-context/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {prayerLabel(k)}
          </p>
          <p className="tabular-nums text-[14.5px] text-ink">
            {preview.times[k]}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ---------- prayer times ---------- */

function PrayerSection() {
  const prefs = useViewPrefs();
  const { t } = useT();
  const [draft, setDraft] = useState<PrayerSettings | null>(null);
  const [lastSaved, setLastSaved] = useState<PrayerSettings | null>(null);
  useEffect(() => {
    if (prefs && !draft) {
      setDraft(prefs.prayer);
      setLastSaved(prefs.prayer);
    }
  }, [prefs, draft]);
  if (!prefs || !draft) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(lastSaved);
  const save = async () => {
    const { setPrayerSettings } = await import("@/lib/lifeos/services/settings-service");
    await setPrayerSettings(draft);
    setLastSaved(draft);
    toast(t("prayer.savedToast"));
  };
  return (
    <Card className="px-4 py-4 md:px-5">
      <SectionLabel>{t("prayer.title")}</SectionLabel>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {t("prayer.desc")}
      </p>
      <div className="mt-3 flex gap-1.5">
        {(
          [
            { key: "calculated", label: t("prayer.calculated") },
            { key: "manual", label: t("prayer.manual") },
          ] as const
        ).map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setDraft({ ...draft, mode: o.key })}
            className={cn(
              "h-10 flex-1 rounded-xl border text-[13px] font-medium transition-colors",
              draft.mode === o.key
                ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                : "border-border bg-surface text-ink-soft"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {draft.mode === "manual" ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PRAYER_KEYS.map((k) => (
            <label key={k} className="grid gap-1">
              <span className="text-[11.5px] font-medium text-ink-soft">
                {prayerLabel(k)}
              </span>
              <Input
                type="time"
                value={draft.manual[k]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    manual: { ...draft.manual, [k]: e.target.value },
                  })
                }
                className="h-9 rounded-xl border-border bg-surface"
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-[11.5px] font-medium text-ink-soft">{t("prayer.latitude")}</span>
              <Input
                inputMode="decimal"
                value={String(draft.calculated.latitude)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    calculated: {
                      ...draft.calculated,
                      latitude: Number(e.target.value.replace(/[^0-9.\-]/g, "")) || 0,
                    },
                  })
                }
                className="h-9 rounded-xl border-border bg-surface"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11.5px] font-medium text-ink-soft">{t("prayer.longitude")}</span>
              <Input
                inputMode="decimal"
                value={String(draft.calculated.longitude)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    calculated: {
                      ...draft.calculated,
                      longitude: Number(e.target.value.replace(/[^0-9.\-]/g, "")) || 0,
                    },
                  })
                }
                className="h-9 rounded-xl border-border bg-surface"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-[11.5px] font-medium text-ink-soft">{t("prayer.method")}</span>
            <Select
              value={draft.calculated.method}
              onValueChange={(v) =>
                setDraft({
                  ...draft,
                  calculated: {
                    ...draft.calculated,
                    method: v as CalcMethod,
                  },
                })
              }
            >
              <SelectTrigger className="w-full rounded-xl border-border bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72 rounded-xl border-border bg-surface-raised">
                {Object.entries(CALC_METHOD_LABELS).map(([k]) => (
                  <SelectItem key={k} value={k}>
                    {calcMethodLabel(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
            <div className="flex gap-1.5">
              {(
                [
                  { key: "shafi", label: t("prayer.asrShafi") },
                  { key: "hanafi", label: t("prayer.asrHanafi") },
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      calculated: {
                        ...draft.calculated,
                        madhab: o.key,
                      },
                    })
                  }
                  className={cn(
                    "h-10 flex-1 rounded-xl border text-[12px] font-medium transition-colors",
                    draft.calculated.madhab === o.key
                      ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                      : "border-border bg-surface text-ink-soft"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:col-span-2 sm:grid-cols-6">
            {PRAYER_KEYS.map((k) => (
              <label key={k} className="grid gap-1">
                <span className="text-[10.5px] font-medium text-muted-foreground">
                  {t("prayer.correction", { prayer: prayerLabel(k) })}
                </span>
                <Input
                  inputMode="numeric"
                  value={String(draft.calculated.corrections[k])}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      calculated: {
                        ...draft.calculated,
                        corrections: {
                          ...draft.calculated.corrections,
                          [k]: Number(e.target.value.replace(/[^0-9\-]/g, "")) || 0,
                        },
                      },
                    })
                  }
                  className="h-9 rounded-xl border-border bg-surface"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          {draft.mode === "calculated"
            ? t("prayer.offlineNote")
            : t("prayer.manualNote")}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="rounded-full text-muted-foreground"
            disabled={!dirty}
            onClick={() => {
              setDraft(lastSaved);
            }}
          >
            {t("prayer.revert")}
          </Button>
          <Button
            disabled={!dirty}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            onClick={save}
          >
            {t("prayer.save")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ---------- reminders ---------- */

function RemindersSection() {
  const { t } = useT();
  return (
    <Card className="px-4 py-4 md:px-5">
      <SectionLabel>{t("settings.reminders")}</SectionLabel>
      <div className="mt-2 flex items-start gap-3 rounded-xl bg-surface-context/70 px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {t("reminders.body")}
        </p>
      </div>
      <p className="mt-3 text-[12.5px] text-muted-foreground">
        {t("reminders.note")}
      </p>
    </Card>
  );
}

/* ---------- privacy & optional PIN lock (v1.1) ---------- */

function PrivacySection() {
  const { t, lang } = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"view" | "set" | "change" | "remove">("view");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => void hasPin().then(setEnabled);
  useEffect(() => {
    refresh();
  }, []);

  const digits = (setter: (v: string) => void) => (v: string) => {
    setter(v.replace(/\D/g, "").slice(0, 8));
    setError(null);
  };

  const localValidate = (): string | null => {
    if (!isValidPinFormat(next)) return t("privacy.errFormat");
    if (next !== confirm) return t("privacy.errMismatch");
    return null;
  };

  const submitSet = async () => {
    const bad = localValidate();
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    try {
      const res = await setPin(next);
      if (res.ok) {
        toast(t("privacy.savedToast"));
        setMode("view");
        setCurrent("");
        setNext("");
        setConfirm("");
        refresh();
      } else if (res.error.message === "The current PIN is wrong.") {
        setError(t("privacy.errCurrent"));
      } else {
        setError(rt(res.error.message));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitChange = async () => {
    const bad = localValidate();
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    try {
      const res = await changePin(current, next);
      if (res.ok) {
        toast(t("privacy.changedToast"));
        setMode("view");
        setCurrent("");
        setNext("");
        setConfirm("");
        refresh();
      } else if (res.error.message === "The current PIN is wrong.") {
        setError(t("privacy.errCurrent"));
      } else {
        setError(rt(res.error.message));
      }
    } finally {
      setBusy(false);
    }
  };

  const submitRemove = async () => {
    setBusy(true);
    try {
      const res = await removePin(current);
      if (res.ok) {
        toast(t("privacy.removedToast"));
        setMode("view");
        setCurrent("");
        refresh();
      } else {
        setError(t("privacy.errCurrent"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("settings.privacy")}</SectionLabel>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {t("privacy.desc")}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium",
              enabled
                ? "bg-sage/15 text-sage"
                : "bg-surface-raised text-muted-foreground"
            )}
          >
            {enabled ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            {enabled ? t("privacy.statusOn") : t("privacy.statusOff")}
          </span>
        </div>

        {mode === "view" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {enabled === false ? (
              <Button
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
                onClick={() => {
                  setMode("set");
                  setNext("");
                  setConfirm("");
                  setError(null);
                }}
              >
                <KeyRound className="h-4 w-4" /> {t("privacy.enable")}
              </Button>
            ) : null}
            {enabled ? (
              <>
                <Button
                  variant="outline"
                  className="rounded-full border-border bg-surface"
                  onClick={() => {
                    setMode("change");
                    setCurrent("");
                    setNext("");
                    setConfirm("");
                    setError(null);
                  }}
                >
                  {t("privacy.change")}
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-full text-muted-foreground"
                  onClick={() => {
                    setMode("remove");
                    setCurrent("");
                    setError(null);
                  }}
                >
                  {t("privacy.remove")}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        {mode === "set" || mode === "change" ? (
          <div className="mt-4 max-w-sm space-y-3">
            {mode === "change" ? (
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
                  {t("privacy.currentPin")}
                </span>
                <Input
                  value={current}
                  onChange={(e) => digits(setCurrent)(e.target.value)}
                  type="password"
                  inputMode="numeric"
                  className="h-10 rounded-xl border-border bg-surface"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
                {t("privacy.newPin")}
              </span>
              <Input
                value={next}
                onChange={(e) => digits(setNext)(e.target.value)}
                type="password"
                inputMode="numeric"
                placeholder="••••"
                className="h-10 rounded-xl border-border bg-surface"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
                {t("privacy.confirmPin")}
              </span>
              <Input
                value={confirm}
                onChange={(e) => digits(setConfirm)(e.target.value)}
                type="password"
                inputMode="numeric"
                placeholder="••••"
                className="h-10 rounded-xl border-border bg-surface"
              />
            </label>
            {error ? (
              <p className="text-[12.5px] text-[#a5533c]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="rounded-full text-muted-foreground"
                disabled={busy}
                onClick={() => setMode("view")}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
                disabled={busy || !next || !confirm || (mode === "change" && !current)}
                onClick={() =>
                  void (mode === "set" ? submitSet() : submitChange())
                }
              >
                <Lock className="h-4 w-4" />
                {mode === "set" ? t("privacy.set") : t("privacy.changeDo")}
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "remove" ? (
          <div className="mt-4 max-w-sm space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
                {t("privacy.currentPin")}
              </span>
              <Input
                value={current}
                onChange={(e) => digits(setCurrent)(e.target.value)}
                type="password"
                inputMode="numeric"
                className="h-10 rounded-xl border-border bg-surface"
              />
            </label>
            {error ? (
              <p className="text-[12.5px] text-[#a5533c]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="rounded-full text-muted-foreground"
                disabled={busy}
                onClick={() => setMode("view")}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-border bg-surface text-[#a5533c]"
                disabled={busy || !current}
                onClick={() => void submitRemove()}
              >
                <LockOpen className="h-4 w-4" /> {t("privacy.removeDo")}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("privacy.forgotTitle")}</SectionLabel>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {t("privacy.forgotBody")}
        </p>
      </Card>
      <span className="hidden">{lang}</span>
    </div>
  );
}

/* ---------- data & backup ---------- */

function DataSection() {
  const { t, lang } = useT();
  const registeredAt = useRegisteredAt();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [validation, setValidation] = useState<(ValidationSummary & { data: Record<string, unknown[]>; settings?: Record<string, unknown> }) | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [autos, setAutos] = useState<AutoBackupMeta[]>([]);
  const [autoRestoreId, setAutoRestoreId] = useState<string | null>(null);
  // v1.2: monthly export nudge + local error log
  const [nudge, setNudge] = useState(false);
  const [errors, setErrors] = useState<ErrorLogEntry[] | null>(null);

  const DAY = 24 * 60 * 60 * 1000;

  const refresh = useCallback(() => {
    void getStorageInfo().then(setInfo);
    void listAutoBackups().then(setAutos);
  }, []);

  const downloadNow = useCallback(async () => {
    const res = await run(downloadBackup(true), { quiet: true });
    if (res.ok) {
      toast(t("data.backupSaved", { filename: res.value.filename }));
      setNudge(false);
      refresh();
    }
  }, [refresh, t]);

  useEffect(() => {
    refresh();
    setErrors(readErrorLog());
    // v1.2: the monthly gentle nudge — a line, never a modal, never a badge
    void (async () => {
      const snapshot = await getStorageInfo();
      const dismissedAt = await getSetting<number | null>(
        SETTING_KEYS.backupNudgeDismissed,
        null
      );
      if (dismissedAt !== null && Date.now() - dismissedAt < 30 * DAY) {
        setNudge(false);
        return;
      }
      const hasContent = (snapshot.counts.items ?? 0) > 0;
      const exportedStale =
        snapshot.lastBackupAt !== null &&
        Date.now() - snapshot.lastBackupAt > 30 * DAY;
      const neverExportedAndOldUser =
        snapshot.lastBackupAt === null &&
        registeredAt !== null &&
        registeredAt !== undefined &&
        Date.now() - Date.parse(registeredAt) > 30 * DAY;
      setNudge(hasContent && (exportedStale || neverExportedAndOldUser));
    })();
  }, [refresh, registeredAt]);

  return (
    <div className="space-y-4">
      {nudge ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-primary-soft bg-primary-soft/20 px-4 py-2.5">
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-soft">
            {t("data.nudge")}
          </p>
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full text-[12px] text-muted-foreground"
              onClick={() => {
                void db.appSettings.put({
                  key: SETTING_KEYS.backupNudgeDismissed,
                  value: Date.now(),
                  updatedAt: Date.now(),
                });
                setNudge(false);
              }}
            >
              {t("data.notNow")}
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-full bg-primary px-3.5 text-[12px] text-primary-foreground hover:bg-primary-deep"
              onClick={() => void downloadNow()}
            >
              <Download className="h-3.5 w-3.5" /> {t("data.nudgeDo")}
            </Button>
          </div>
        </div>
      ) : null}
      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("data.title")}</SectionLabel>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {t("data.desc")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
            onClick={async () => {
              const res = await run(downloadBackup(true), { quiet: true });
              if (res.ok) {
                toast(t("data.backupSaved", { filename: res.value.filename }));
                refresh();
              }
            }}
          >
            <Download className="h-4 w-4" /> {t("data.export")}
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 100 * 1024 * 1024) {
                  toast.error(t("data.tooLarge"));
                  return;
                }
                let text: string;
                try {
                  text = await file.text();
                } catch (readError) {
                  // the file vanished or is unreadable (renamed/removed
                  // after picking it) — never leave the user without feedback
                  console.error("backup file read failed", readError);
                  toast.error(t("data.unreadableFile"));
                  return;
                }
                const res = await validateBackupFile(text);
                if (!res.ok) {
                  toast.error(rt(res.error.message));
                  return;
                }
                setValidation(res.value);
              }}
            />
            <Button
              variant="outline"
              className="rounded-full border-border bg-surface"
              asChild
              onClick={(e) => {
                // trigger the hidden input via sibling label
                const input = (e.currentTarget.parentElement?.querySelector(
                  "input[type=file]"
                )) as HTMLInputElement | null;
                input?.click();
                e.preventDefault();
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <Upload className="h-4 w-4" /> {t("data.restore")}
              </span>
            </Button>
          </label>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">
          {t("data.lastBackup")}{" "}
          {info?.lastBackupAt
            ? new Date(info.lastBackupAt).toLocaleString(
                lang === "ar" ? "ar-EG" : undefined
              )
            : t("data.never")}
        </p>
        <p className="mt-2 text-[12px] italic leading-relaxed text-muted-foreground">
          {t("data.honestyFile")}
        </p>
      </Card>

      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("data.autoTitle")}</SectionLabel>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {t("data.autoDesc")}
        </p>
        <p className="mt-3 text-[12px] text-muted-foreground">
          {t("data.autoLast")}{" "}
          {info?.lastAutoBackupAt
            ? new Date(info.lastAutoBackupAt).toLocaleString(
                lang === "ar" ? "ar-EG" : undefined
              )
            : t("data.autoNever")}
        </p>
        {autos.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {autos.map((auto) => (
              <li
                key={auto.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface/60 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-soft">
                  <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {new Date(auto.at).toLocaleString(
                      lang === "ar" ? "ar-EG" : undefined
                    )}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-full border-border bg-surface text-[12px]"
                  onClick={() => setAutoRestoreId(auto.id)}
                >
                  {t("data.autoRestore")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[12px] italic text-muted-foreground">
            {t("data.autoEmpty")}
          </p>
        )}
        <div className="mt-3">
          <Button
            variant="outline"
            className="rounded-full border-border bg-surface"
            onClick={async () => {
              const res = await run(createAutoBackup(), { quiet: true });
              if (res.ok) {
                toast(t("data.autoCreatedToast"));
                refresh();
              }
            }}
          >
            <Download className="h-4 w-4" /> {t("data.autoCreateNow")}
          </Button>
        </div>
        <p className="mt-2 text-[12px] italic leading-relaxed text-muted-foreground">
          {t("data.honestyAuto")}
        </p>
      </Card>

      {validation ? (
        <Card className="px-4 py-4 md:px-5">
          <SectionLabel>{t("data.preview")}</SectionLabel>
          <p className="mt-1 text-[13px] text-ink-soft">
            {t("data.replaceWarn", {
              items: info?.counts.items ?? 0,
              spaces: info?.counts.spaces ?? 0,
            })}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-[12.5px] text-muted-foreground sm:grid-cols-3">
            {Object.entries(validation.counts)
              .filter(([, n]) => n > 0)
              .map(([store, n]) => (
                <li key={store}>
                  {store}: {n}
                </li>
              ))}
          </ul>
          {validation.issues.length > 0 ? (
            <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto rounded-xl bg-[#f7e8e0] px-3 py-2 text-[12px] text-[#8a4a35] dark:bg-[#4a2f26] dark:text-[#e5b8a5]">
              {validation.issues.map((issue, i) => (
                <li key={i}>· {issue}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <Button
              variant="ghost"
              className="rounded-full text-muted-foreground"
              onClick={() => setValidation(null)}
            >
              {t("data.notNow")}
            </Button>
            <Button
              variant="destructive"
              className="rounded-full"
              onClick={() => setRestoreOpen(true)}
            >
              {t("data.replace")}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("data.device")}</SectionLabel>
        <ul className="mt-2 grid gap-1 text-[12.5px] text-muted-foreground sm:grid-cols-2">
          <li>
            {t("data.storageUsed")}{" "}
            {info?.usage != null
              ? `${(info.usage / 1024 / 1024).toFixed(1)} MB`
              : t("data.unknown")}
            {info?.quota != null
              ? t("data.ofQuota", { gb: (info.quota / 1024 / 1024 / 1024).toFixed(1) })
              : ""}
          </li>
          <li>
            {t("data.persistent")}{" "}
            {info?.persisted === true
              ? t("data.granted")
              : info?.persisted === false
                ? t("data.notGranted")
                : t("data.unknown")}
          </li>          <li>{t("data.itemsCount")} {info?.counts.items ?? t("common.loading")}</li>
          <li>{t("data.spacesCount")} {info?.counts.spaces ?? t("common.loading")}</li>
          <li>{t("data.dayPlans")} {info?.counts.dailyPlans ?? t("common.loading")}</li>
          <li>{t("data.weekPlans")} {info?.counts.weeklyPlans ?? t("common.loading")}</li>
        </ul>
        {info?.persisted === false ? (
          <div className="mt-3 rounded-xl border border-border/70 bg-surface/60 px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-ink-soft">
              {t("data.persistHonest")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-8 rounded-full border-border bg-surface text-[12px]"
              onClick={async () => {
                try {
                  await navigator.storage?.persist?.();
                } catch {
                  /* quiet */
                }
                toast(t("data.persistAsked"));
                refresh();
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5" /> {t("data.persistAsk")}
            </Button>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="rounded-full border-border bg-surface"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              try {
                const report = await checkIntegrity(true);
                if (report.issues.length === 0) {
                  toast(t("data.checkOk"));
                } else {
                  toast(t("data.checkFixed", { count: report.issues.length }));
                }
                refresh();
              } finally {
                setChecking(false);
              }
            }}
          >
            <ShieldCheck className="h-4 w-4" /> {t("data.check")}
          </Button>
          <Button
            variant="outline"
            className="rounded-full border-border bg-surface"
            onClick={async () => {
              const res = await run(undoRestore(), { quiet: true });
              if (res.ok) toast(t("data.undoRestoreToast"));
              refresh();
            }}
          >
            <HardDriveDownload className="h-4 w-4" /> {t("data.undoRestore")}
          </Button>
        </div>
      </Card>

      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("data.errorLog")}</SectionLabel>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {t("data.errorLogDesc")}
        </p>
        {errors !== null && errors.length > 0 ? (
          <>
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-xl bg-surface-raised px-3 py-2 text-[12px] text-ink-soft">
              {errors.slice(0, 10).map((e, i) => (
                <li key={i} dir="auto" className="truncate">
                  · {e.message}
                  <span className="text-muted-foreground">
                    {" "}
                    {new Date(e.t).toLocaleString(
                      lang === "ar" ? "ar-EG" : undefined
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-border bg-surface text-[12px]"
                onClick={async () => {
                  const text = formatErrorLogText();
                  try {
                    await navigator.clipboard.writeText(text);
                    toast(t("data.errorLogCopied"));
                  } catch {
                    toast(text);
                  }
                }}
              >
                {t("data.errorLogCopy")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full text-[12px] text-muted-foreground"
                onClick={() => {
                  clearErrorLog();
                  setErrors(readErrorLog());
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> {t("data.errorLogClear")}
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-[12px] italic text-muted-foreground">
            {t("data.errorLogEmpty")}
          </p>
        )}
      </Card>

      <Card className="px-4 py-4 md:px-5">
        <SectionLabel>{t("data.archivedInfoTitle")}</SectionLabel>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {t("data.archivedInfo")}
        </p>
      </Card>

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={t("data.confirmTitle")}
        description={t("data.confirmDesc")}
        confirmLabel={t("data.replace")}
        danger
        onConfirm={async () => {
          if (!validation) return;
          const res = await run(
            applyRestore(validation.data, validation.settings),
            { quiet: true }
          );
          if (res.ok) {
            toast(t("data.restoredToast", { count: res.value.counts.items ?? 0 }));
            setValidation(null);
            refresh();
          }
        }}
      />

      <ConfirmDialog
        open={autoRestoreId !== null}
        onOpenChange={(open) => {
          if (!open) setAutoRestoreId(null);
        }}
        title={t("data.autoConfirmTitle")}
        description={t("data.autoConfirmDesc")}
        confirmLabel={t("data.autoRestore")}
        danger
        onConfirm={async () => {
          if (!autoRestoreId) return;
          const res = await run(restoreAutoBackup(autoRestoreId), { quiet: true });
          setAutoRestoreId(null);
          if (res.ok) {
            toast(t("data.restoredToast", { count: res.value.counts.items ?? 0 }));
            refresh();
          }
        }}
      />
      <span className="hidden">{lastBackup}</span>
    </div>
  );
}

/* ---------- about ---------- */

function AboutSection() {
  const prefs = useViewPrefs();
  const { t } = useT();
  return (
    <Card className="px-4 py-4 md:px-5">
      <SectionLabel>{t("settings.about")}</SectionLabel>
      <p className="mt-1 font-serif text-[15px] text-ink">{t("app.name")}</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">
        {t("about.version")}
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        {t("about.body")} {prefs ? "" : ""}
      </p>
      <ul className="mt-3 space-y-1 text-[12.5px] text-muted-foreground">
        <li>· {t("about.bullet1")}</li>
        <li>· {t("about.bullet2")}</li>
        <li>· {t("about.bullet3")}</li>
      </ul>
    </Card>
  );
}

export { Check };
