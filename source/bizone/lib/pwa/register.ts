/**
 * Service worker registration shared by the mobile shell (P6.4) and the push settings (P4.7).
 * One script URL for both: registering a different URL for the same scope replaces the worker.
 * Production builds register `/sw.js?cache=1` (offline cache on); `next dev` registers plain
 * `/sw.js` (push only — cached dev chunks would break hot reload).
 */
export const SW_URL = process.env.NODE_ENV === "production" ? "/sw.js?cache=1" : "/sw.js";

export function serviceWorkerSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!serviceWorkerSupported()) return null;
  return navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
}
