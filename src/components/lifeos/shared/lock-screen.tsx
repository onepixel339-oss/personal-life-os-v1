/* Lock screen — optional PIN privacy gate (v1.1).
   Shown before any app content when a PIN is set. The PIN is verified
   against the vault (salt + SHA-256); nothing about the user's data is
   rendered here. Unlock state lives in memory only — reloading or
   backgrounding the app for a while re-locks. */

"use client";

import { useEffect, useRef, useState } from "react";
import { Fingerprint, HeartHandshake, Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/lifeos/i18n";
import { hasPin, verifyPin, wipeEverything } from "@/lib/lifeos/services/pin-service";
import { cn } from "@/lib/utils";

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const { t } = useT();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // safety net: if the PIN was removed elsewhere (stale shell state),
    // never trap the user behind a lock that no longer exists.
    void hasPin().then((p) => {
      if (!p) onUnlocked();
    });
  }, [onUnlocked]);

  const submit = async () => {
    if (!pin) return;
    setChecking(true);
    try {
      const good = await verifyPin(pin);
      if (good) {
        onUnlocked();
      } else {
        setError(t("lock.wrong"));
        setPin("");
        inputRef.current?.focus();
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="daybook-paper flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-surface px-6 py-7 shadow-[var(--shadow-warm)] sm:px-8">
          <div className="flex justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft/50 text-primary-deep">
              <Lock className="h-7 w-7" />
            </span>
          </div>
          <h1 className="mt-4 text-center font-serif text-[22px] leading-snug text-ink">
            {t("lock.title")}
          </h1>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
            {t("lock.subtitle")}
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
                {t("lock.inputLabel")}
              </span>
              <Input
                ref={inputRef}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
                  setError(null);
                }}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="••••"
                aria-label={t("lock.inputLabel")}
                className={cn(
                  "h-12 rounded-xl border-border bg-surface-raised text-center text-[18px] tracking-[0.5em]",
                  error ? "border-[#a5533c]" : ""
                )}
              />
            </label>
            {error ? (
              <p className="mt-2 text-[12.5px] text-[#a5533c]" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={checking || !pin}
              className="mt-5 h-12 w-full rounded-full bg-primary text-[14.5px] text-primary-foreground hover:bg-primary-deep"
            >
              <Fingerprint className="h-4.5 w-4.5" />
              {t("lock.unlock")}
            </Button>
          </form>

          <div className="mt-5 border-t border-border/70 pt-4">
            {confirmWipe ? (
              <div className="rounded-xl bg-[#f9ece6] px-3.5 py-3 dark:bg-[#3d2a23]">
                <p className="text-[12.5px] leading-relaxed text-[#8a4a35] dark:text-[#e5b8a5]">
                  {t("lock.forgotDesc")}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full text-[12px] text-muted-foreground"
                    disabled={wiping}
                    onClick={() => setConfirmWipe(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 rounded-full text-[12px]"
                    disabled={wiping}
                    onClick={async () => {
                      setWiping(true);
                      await wipeEverything();
                      window.location.reload();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("lock.forgotConfirm")}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmWipe(true)}
                className="mx-auto flex items-center gap-1.5 text-[12px] text-muted-foreground underline-offset-2 hover:text-ink-soft hover:underline"
              >
                <HeartHandshake className="h-3.5 w-3.5" />
                {t("lock.forgot")}
              </button>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
          {t("register.privacy")}
        </p>
      </div>
    </div>
  );
}
