"use client";

import { useCallback, useSyncExternalStore } from "react";
import { installMode, type InstallMode } from "@/lib/pwa/install";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Module-level store: `beforeinstallprompt` may fire before any component mounts, so the
// listener is attached as soon as this module loads in the browser.
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // BizOne shows its own button instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

const STANDALONE = "(display-mode: standalone)";

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia(STANDALONE);
  mq.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

function snapshot(): InstallMode {
  const nav = navigator as Navigator & { standalone?: boolean };
  return installMode({
    standalone: installedNow || window.matchMedia(STANDALONE).matches || nav.standalone === true,
    hasPrompt: deferred !== null,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

/**
 * PWA install state (P6.4): "prompt" → `install()` opens the browser's install dialog;
 * "ios" → show the Share → "Thêm vào MH chính" instructions; "installed" → running as the app.
 */
export function useInstallPrompt() {
  const mode = useSyncExternalStore(subscribe, snapshot, () => "unavailable" as InstallMode);

  const install = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    const ev = deferred;
    if (!ev) return "unavailable";
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    deferred = null; // a prompt event can be used once
    emit();
    return outcome;
  }, []);

  return { mode, install };
}
