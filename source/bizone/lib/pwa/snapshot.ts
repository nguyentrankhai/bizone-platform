import superjson from "superjson";

/**
 * Last good API answer of a mobile screen, kept in localStorage (P6.4) so the app shows the
 * latest numbers instantly and while offline. The service worker never caches /api/* (auth
 * headers, per-branch data); this is the only copy of business data on the device.
 * Keyed by tenant + branch so switching either never shows another scope's numbers.
 */
const PREFIX = "bizone:pwa:";
/** Older snapshots are dropped rather than shown as "last known" */
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface Snapshot<T> {
  savedAt: number;
  data: T;
}

export function snapshotKey(tenantId: string, branch: string | null, name: string): string {
  return `${PREFIX}${tenantId}:${branch ?? "default"}:${name}`;
}

export function encodeSnapshot<T>(data: T, now = Date.now()): string {
  // superjson keeps Date / Decimal-as-string shapes the same as the tRPC answer
  return superjson.stringify({ savedAt: now, data });
}

export function decodeSnapshot<T>(
  raw: string | null,
  now = Date.now(),
  maxAgeMs = SNAPSHOT_MAX_AGE_MS,
): Snapshot<T> | null {
  if (!raw) return null;
  try {
    const s = superjson.parse<Snapshot<T>>(raw);
    if (!s || typeof s.savedAt !== "number" || now - s.savedAt > maxAgeMs) return null;
    return s;
  } catch {
    return null;
  }
}

export function loadSnapshot<T>(key: string): Snapshot<T> | null {
  try {
    const raw = localStorage.getItem(key);
    const snap = decodeSnapshot<T>(raw);
    if (raw && !snap) localStorage.removeItem(key);
    return snap;
  } catch {
    return null; // storage blocked (private mode)
  }
}

export function saveSnapshot<T>(key: string, data: T): number {
  const now = Date.now();
  try {
    localStorage.setItem(key, encodeSnapshot(data, now));
  } catch {
    /* quota / private mode: the screen still works, just not offline */
  }
  return now;
}

/** Remove every snapshot (e.g. on sign-out once browser login exists — P6.7) */
export function clearSnapshots(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
