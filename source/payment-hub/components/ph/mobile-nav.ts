"use client";

import { useSyncExternalStore } from "react";

/**
 * Open state of the admin sidebar as a drawer on small screens (< 768 px, #27 — P7.1). Shared by
 * the header's menu button and the sidebar without a context provider (PHLayout is a server
 * component).
 */
let open = false;
const listeners = new Set<() => void>();

export function setMobileNav(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
}

export function useMobileNav(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => false,
  );
}
