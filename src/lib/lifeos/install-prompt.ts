/* PWA install helpers (v1.1) — capture the browser's beforeinstallprompt
   event so the welcome card can offer a one-tap install on Android/desktop
   Chrome, and detect standalone mode / platform for the manual iOS steps.
   SSR-safe: every window access is guarded. */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Notify = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Notify>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* listener errors must never break install flow */
    }
  }
}

export function initInstallPromptListener(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function onInstallAvailabilityChange(fn: Notify): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function triggerInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  if (!deferredPrompt) return "unavailable";
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === "accepted") {
    deferredPrompt = null;
    notify();
    return "accepted";
  }
  return "dismissed";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    nav.standalone === true
  );
}

export function installPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}
