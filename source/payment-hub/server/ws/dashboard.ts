import { WebSocket } from "ws";
import type { RealtimeEvent } from "@/lib/events";
import { getTodayStats, invalidateDashboardCache } from "@/server/services/dashboard.service";

/**
 * Dashboard realtime (P3.7, SRS-PH-DASH-01-08, API-Design §9 "Dashboard namespace").
 *
 * Runs inside the realtime process (server/ws/server.ts). A client on /dashboard sends
 * `{"type":"subscribe","channel":"dashboard"}` after connecting; from then on it receives:
 *   - `dashboard:stats`   today's top-bar numbers, computed from the DB for the client's scope
 *                         (all merchants, or the token's merchant_id) right after any
 *                         transaction event — throttled to one recompute per THROTTLE_MS;
 *   - `dashboard:refresh` hint to re-fetch /api/internal/dashboard: after transaction events
 *                         (the Redis aggregate cache is dropped first, so the re-fetch is fresh)
 *                         and every TICK_MS so alerts and webhook numbers, which have no event
 *                         of their own, are never older than ~30 s (AC-PH-DASH-02).
 */

export const THROTTLE_MS = 1_000;
export const TICK_MS = 15_000;

export interface DashboardScope {
  merchantId?: number;
}

function scopeKey(scope: DashboardScope): string {
  return scope.merchantId === undefined ? "all" : `m${scope.merchantId}`;
}

function message(type: string, data: unknown): string {
  return JSON.stringify({ type, data, at: new Date().toISOString() });
}

export class DashboardRelay {
  private readonly subscribers = new Map<WebSocket, DashboardScope>();
  private timer: NodeJS.Timeout | null = null;
  private tick: NodeJS.Timeout | null = null;
  private lastFlush = 0;
  private flushing = false;
  private dirty = false;
  private dirtyMerchants = new Set<number | "unknown">();

  get size(): number {
    return this.subscribers.size;
  }

  start(): void {
    this.tick ??= setInterval(
      () => this.broadcast("dashboard:refresh", { reason: "tick" }),
      TICK_MS,
    );
  }

  stop(): void {
    if (this.tick) clearInterval(this.tick);
    if (this.timer) clearTimeout(this.timer);
    this.tick = this.timer = null;
    this.subscribers.clear();
  }

  /** Returns true when the message was a dashboard control message. */
  handleClientMessage(ws: WebSocket, raw: string, scope: DashboardScope): boolean {
    let msg: { type?: unknown; channel?: unknown };
    try {
      msg = JSON.parse(raw) as typeof msg;
    } catch {
      return false;
    }
    if (msg.channel !== "dashboard") return false;
    if (msg.type === "subscribe") {
      this.subscribers.set(ws, scope);
      ws.once("close", () => this.subscribers.delete(ws));
      void this.sendStats(ws, scope);
      return true;
    }
    if (msg.type === "unsubscribe") {
      this.subscribers.delete(ws);
      return true;
    }
    return false;
  }

  remove(ws: WebSocket): void {
    this.subscribers.delete(ws);
  }

  /** Called for every event relayed from Redis `payhub:events`. */
  onEvent(event: RealtimeEvent): void {
    if (!event.type.startsWith("transaction.")) return;
    const merchantId = Number((event.data as { merchantId?: unknown } | null)?.merchantId);
    this.dirtyMerchants.add(Number.isSafeInteger(merchantId) ? merchantId : "unknown");
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer || this.flushing) return;
    const wait = Math.max(0, this.lastFlush + THROTTLE_MS - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, wait);
  }

  private async flush(): Promise<void> {
    if (!this.dirty) return;
    this.flushing = true;
    this.dirty = false;
    const merchants = this.dirtyMerchants;
    this.dirtyMerchants = new Set();
    this.lastFlush = Date.now();
    try {
      // The cache is shared by every scope, so drop it even with no subscriber connected here.
      await invalidateDashboardCache().catch((err: unknown) =>
        console.error("[realtime] dashboard cache invalidation failed:", err),
      );
      if (!this.subscribers.size) return;

      const byScope = new Map<string, { scope: DashboardScope; sockets: WebSocket[] }>();
      for (const [ws, scope] of this.subscribers) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        // A merchant-bound client only cares about its own merchant's events.
        if (
          scope.merchantId !== undefined &&
          !merchants.has(scope.merchantId) &&
          !merchants.has("unknown")
        ) {
          continue;
        }
        const key = scopeKey(scope);
        const group = byScope.get(key) ?? { scope, sockets: [] };
        group.sockets.push(ws);
        byScope.set(key, group);
      }

      await Promise.all(
        [...byScope.values()].map(async ({ scope, sockets }) => {
          try {
            const stats = message("dashboard:stats", await getTodayStats(scope));
            const refresh = message("dashboard:refresh", { reason: "transaction" });
            for (const ws of sockets) {
              if (ws.readyState !== WebSocket.OPEN) continue;
              ws.send(stats);
              ws.send(refresh);
            }
          } catch (err) {
            console.error("[realtime] dashboard stats failed:", err);
          }
        }),
      );
    } finally {
      this.flushing = false;
      if (this.dirty) this.schedule();
    }
  }

  private async sendStats(ws: WebSocket, scope: DashboardScope): Promise<void> {
    try {
      const stats = await getTodayStats(scope);
      if (ws.readyState === WebSocket.OPEN) ws.send(message("dashboard:stats", stats));
    } catch (err) {
      console.error("[realtime] dashboard stats failed:", err);
    }
  }

  private broadcast(type: string, data: unknown): void {
    if (!this.subscribers.size) return;
    const payload = message(type, data);
    for (const ws of this.subscribers.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}
