/* Registration gate — name-only sign-in (no email, no password, no account).
   The name lives in local appSettings on this device, nothing else. */

"use client";

import { useEffect, useRef, useState } from "react";
import { BookHeart, Check, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT, setLang, t } from "@/lib/lifeos/i18n";
import { db } from "@/lib/lifeos/db";
import { SETTING_KEYS } from "@/lib/lifeos/defaults";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function RegistrationGate() {
  const { t: tr, lang } = useT();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const clean = name.trim().slice(0, 40);
    if (!clean) {
      setError(tr("register.errorName"));
      inputRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      await db.appSettings.bulkPut([
        { key: SETTING_KEYS.userName, value: clean, updatedAt: now },
        { key: SETTING_KEYS.registeredAt, value: new Date(now).toISOString(), updatedAt: now },
      ]);
      toast(t("register.welcomeToast", { name: clean }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="daybook-paper flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-md">
        {/* language toggle */}
        <div className="mb-6 flex items-center justify-center gap-1.5">
          <span className="text-[11.5px] text-muted-foreground">
            {tr("register.langLabel")}
          </span>
          {(
            [
              { key: "ar", label: "العربية" },
              { key: "en", label: "English" },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => void setLang(o.key)}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                lang === o.key
                  ? "border-primary-soft bg-primary-soft/40 text-primary-deep"
                  : "border-border bg-surface text-ink-soft hover:border-border-strong"
              )}
            >
              {lang === o.key ? <Check className="h-3 w-3" /> : null}
              {o.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-surface px-6 py-7 shadow-[var(--shadow-warm)] sm:px-8">
          <div className="flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft/50 text-primary-deep">
              <BookHeart className="h-7 w-7" />
            </span>
          </div>
          <p className="mt-4 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {tr("register.kicker")}
          </p>
          <h1 className="mt-1.5 text-center font-serif text-[24px] leading-snug text-ink md:text-[27px]">
            {tr("register.heading")}
          </h1>
          <p className="mt-2.5 text-center text-[13.5px] leading-relaxed text-muted-foreground">
            {tr("register.body")}
          </p>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
                {tr("register.nameLabel")}
              </span>
              <Input
                ref={inputRef}
                value={name}
                maxLength={40}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder={tr("register.namePlaceholder")}
                className="h-12 rounded-xl border-border bg-surface-raised text-[15px]"
                autoComplete="name"
                dir="auto"
              />
            </label>
            {error ? (
              <p className="mt-2 text-[12.5px] text-[#a5533c]" role="alert">
                {error}
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">
                {tr("register.hint")}
              </p>
            )}
            <Button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-full bg-primary text-[14.5px] text-primary-foreground hover:bg-primary-deep"
            >
              <HeartHandshake className="h-4.5 w-4.5" />
              {tr("register.cta")}
            </Button>
          </form>

          <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
            {tr("register.privacy")}
          </p>
        </div>
      </div>
    </div>
  );
}
