/**
 * Install-prompt rules (P6.4). Chromium (Android / desktop) fires `beforeinstallprompt` and
 * BizOne shows its own "Cài đặt" button; iOS has no prompt API — users add the app from the
 * Share menu ("Thêm vào MH chính"), which also unlocks Web Push on iOS 16.4+.
 */
export type InstallMode = "installed" | "prompt" | "ios" | "unavailable";

export function isIos(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac — tell it apart by the touch screen
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

export function installMode(opts: {
  standalone: boolean;
  hasPrompt: boolean;
  userAgent: string;
  maxTouchPoints?: number;
}): InstallMode {
  if (opts.standalone) return "installed";
  if (opts.hasPrompt) return "prompt";
  if (isIos(opts.userAgent, opts.maxTouchPoints)) return "ios";
  return "unavailable";
}

/** The banner stays hidden for this long after "Để sau" */
export const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function installSnoozed(snoozedAt: number | null, now = Date.now()): boolean {
  return snoozedAt !== null && now - snoozedAt < INSTALL_SNOOZE_MS;
}
