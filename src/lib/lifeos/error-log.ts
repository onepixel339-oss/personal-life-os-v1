/* Local error log (v1.2) — the only "telemetry" the philosophy allows:
   the last 50 errors kept in localStorage (NOT IndexedDB, so a broken
   database can never hide its own cause). Zero network, ever. */

export interface ErrorLogEntry {
  t: number;
  message: string;
  source?: string;
}

const KEY = "lifeos.errorlog.v1";
export const ERROR_LOG_MAX = 50;

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    // accessing .length forces Safari private-mode failures to surface here
    void localStorage.length;
    return localStorage;
  } catch {
    return null;
  }
}

/** Append an error to the log (never throws; caps length; trims values). */
export function logError(message: string, source?: string): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const list = readErrorLog();
    list.unshift({
      t: Date.now(),
      message: String(message).slice(0, 500),
      ...(source ? { source: String(source).slice(0, 200) } : {}),
    });
    storage.setItem(KEY, JSON.stringify(list.slice(0, ERROR_LOG_MAX)));
  } catch {
    /* full or unavailable — the error logger must never throw */
  }
}

export function readErrorLog(): ErrorLogEntry[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ErrorLogEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as ErrorLogEntry).t === "number" &&
        typeof (e as ErrorLogEntry).message === "string"
    );
  } catch {
    return [];
  }
}

export function clearErrorLog(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Copy-ready plain text (one line per error). */
export function formatErrorLogText(): string {
  return readErrorLog()
    .map(
      (e) =>
        `${new Date(e.t).toISOString()}${e.source ? ` [${e.source}]` : ""} ${e.message}`
    )
    .join("\n");
}

/** Wire global handlers once (client only, idempotent). */
export function initErrorLogging(): void {
  if (typeof window === "undefined") return;
  const w = window as { __lifeosErrLog?: boolean };
  if (w.__lifeosErrLog) return;
  w.__lifeosErrLog = true;
  window.addEventListener("error", (e) => {
    logError(
      e.message || "window error",
      e.filename ? `${e.filename}:${e.lineno}` : "window"
    );
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason: unknown = e.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "unhandled rejection";
    logError(message, "promise");
  });
}
