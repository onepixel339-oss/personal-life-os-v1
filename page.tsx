"use client";

import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/lifeos/app-shell";
import { useI18nStore } from "@/lib/lifeos/i18n";

function Splash() {
  const lang = useI18nStore((s) => s.lang);
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="text-center" suppressHydrationWarning>
        <p className="font-serif text-[22px] text-ink" suppressHydrationWarning>
          {lang === "ar" ? "نظام الحياة الشخصي" : "Personal Life OS"}
        </p>
        <p
          className="mt-1 font-serif text-[13.5px] text-muted-foreground"
          suppressHydrationWarning
        >
          {lang === "ar"
            ? "حياتك، بهيكلٍ من عندك — جارٍ الفتح…"
            : "Your life, your structure — opening…"}
        </p>
      </div>
    </div>
  );
}

/** Sonner toaster that follows the active language direction. */
function LocalizedToaster() {
  const dir = useI18nStore((s) => s.dir);
  return <Toaster position="bottom-center" richColors={false} dir={dir} />;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // PWA shortcut: /?quick-add=1 opens Quick Add immediately
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("quick-add") === "1") {
        import("@/lib/lifeos/ui-store").then(({ useUIStore }) => {
          useUIStore.getState().openQuickAdd();
        });
      }
    }
  }, []);

  if (!mounted) return <Splash />;

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AppShell />
      <LocalizedToaster />
    </ThemeProvider>
  );
}
