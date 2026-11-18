/* ErrorBoundary (v1.4) — the safety net the app never had.
   A render crash used to mean a white screen with no way forward; now it
   means a calm line, an honest promise ("your data is safe, nothing was
   sent anywhere"), a retry, and a way back to today. Errors land in the
   local error log only — zero network, like everything else here.

   Two flavors:
   - <ScreenErrorBoundary> wraps each screen (keyed by route), so one broken
     screen never takes down navigation — the shell, the panels and the
     bottom bar stay alive.
   - <AppErrorBoundary> wraps the whole shell: the last-resort net for a
     crash outside the screen area (fallback asks for a page reload). */

"use client";

import { Component, type ReactNode } from "react";
import { RotateCcw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/lifeos/i18n";
import { logError } from "@/lib/lifeos/error-log";
import { useUIStore } from "@/lib/lifeos/ui-store";
import { Card, EmptyState } from "./primitives";

interface BoundaryState {
  error: Error | null;
}

class Boundary extends Component<
  { children: ReactNode; onError: (error: Error) => void; fallback: (retry: () => void) => ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // local log only — the philosophy allows no other telemetry
    this.props.onError(error);
  }

  retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) return this.props.fallback(this.retry);
    return this.props.children;
  }
}

/** Per-screen net: keep the shell alive, offer retry + a way back to today. */
export function ScreenErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Boundary
      onError={(e) => logError(e.message || "screen render error", "boundary")}
      fallback={(retry) => (
        <Card className="px-6 py-10">
          <EmptyState message={t("shell.crashTitle")} />
          <p className="mx-auto mt-2 max-w-md text-center text-[13px] leading-relaxed text-muted-foreground">
            {t("shell.crashBody")}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              className="rounded-full border-border bg-surface"
              onClick={retry}
            >
              <RotateCcw className="h-4 w-4" /> {t("shell.crashRetry")}
            </Button>
            <Button
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
              onClick={() => {
                retry();
                useUIStore.getState().goToday();
              }}
            >
              <Sun className="h-4 w-4" /> {t("shell.crashBackToday")}
            </Button>
          </div>
        </Card>
      )}
    >
      {children}
    </Boundary>
  );
}

/** Whole-app net: the shell itself failed — reload is the only honest way. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Boundary
      onError={(e) => logError(e.message || "app render error", "boundary")}
      fallback={() => (
        <div className="daybook-paper flex min-h-screen items-center justify-center bg-canvas px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface px-6 py-7 text-center shadow-[var(--shadow-warm)]">
            <h1 className="font-serif text-[20px] leading-snug text-ink">
              {t("shell.crashAppTitle")}
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {t("shell.crashAppBody")}
            </p>
            <Button
              className="mt-5 h-11 w-full rounded-full bg-primary text-primary-foreground hover:bg-primary-deep"
              onClick={() => window.location.reload()}
            >
              <RotateCcw className="h-4 w-4" /> {t("shell.crashRetry")}
            </Button>
          </div>
        </div>
      )}
    >
      {children}
    </Boundary>
  );
}
