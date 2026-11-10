/**
 * Notification WebSocket — WS /ws/notifications (API-Design §16), served by the realtime process
 * next to the POS sync (server/ws/pos.ts hands it the upgrades for this path).
 *
 * Auth like POS: `new WebSocket(url, ["bizone-notify", token])` + `?tenant=`. Each socket keeps
 * the viewer computed at connect time (who may see which store-wide events, branches, muted
 * types) — refreshed every 60 s, closed with 4403 when the staff member is deactivated.
 * New notifications arrive on Redis `bizone:notify:{tenant}` (published by notify() in the app or
 * the worker) and are forwarded as `notification:new` to the sockets allowed to see them.
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { authenticateToken } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { isKnownTenant, runWithTenant } from "@/lib/tenant";
import {
  isVisibleTo,
  NOTIFY_CHANNEL_PATTERN,
  NOTIFY_WS_PATH,
  NOTIFY_WS_PROTOCOL,
  parseNotifyChannel,
  type NotificationPayload,
  type NotificationViewer,
} from "@/lib/notifications/events";
import { notificationViewer, unreadCount } from "@/server/services/notification.service";
import { getStaffAccess } from "@/server/services/rbac.service";
import type { AuthUser } from "@/types/auth";

interface NotifyClient {
  tenantId: string;
  user: AuthUser;
  viewer: NotificationViewer;
}

type Reject = (socket: Duplex, status: number, message: string) => void;

export function createNotificationHub(reject: Reject) {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) =>
      protocols.has(NOTIFY_WS_PROTOCOL) ? NOTIFY_WS_PROTOCOL : false,
  });
  const clients = new Map<WebSocket, NotifyClient>();
  const alive = new WeakMap<WebSocket, boolean>();
  const subscriber = getRedis().duplicate();

  function send(ws: WebSocket, type: string, data: unknown) {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type, data, at: new Date().toISOString() }));
  }

  async function authorize(
    req: IncomingMessage,
  ): Promise<NotifyClient | { status: number; message: string }> {
    const url = new URL(req.url ?? "", "http://localhost");
    const protocols = (req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim());
    const token = protocols.find((p) => p && p !== NOTIFY_WS_PROTOCOL);
    if (!protocols.includes(NOTIFY_WS_PROTOCOL) || !token)
      return { status: 401, message: "Missing token" };
    const verified = await authenticateToken(token);
    if (!verified.ok) return { status: 401, message: "Invalid token" };
    const tenantId = url.searchParams.get("tenant");
    if (!tenantId || tenantId !== verified.user.tenantId)
      return { status: 403, message: "Tenant mismatch" };
    if (!isKnownTenant(tenantId)) return { status: 403, message: "Tenant is not provisioned" };
    const user = verified.user;
    return runWithTenant(tenantId, async () => {
      const access = await getStaffAccess(user);
      if (!access.active) return { status: 403, message: "Forbidden" };
      return { tenantId, user, viewer: await notificationViewer(user) };
    });
  }

  function matches(req: IncomingMessage): boolean {
    return new URL(req.url ?? "", "http://localhost").pathname === NOTIFY_WS_PATH;
  }

  function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    authorize(req)
      .then((result) => {
        if ("status" in result) return reject(socket, result.status, result.message);
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, result));
      })
      .catch((err) => {
        console.error("[notify-ws] upgrade failed:", err);
        reject(socket, 500, "Internal Server Error");
      });
  }

  wss.on("connection", (ws: WebSocket, client: NotifyClient) => {
    clients.set(ws, client);
    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));
    ws.on("close", () => clients.delete(ws));
    ws.on("message", (raw) => {
      // only a keep-alive ping is accepted from clients
      if (raw.toString() === "ping") send(ws, "pong", null);
    });
    runWithTenant(client.tenantId, () => unreadCount(client.viewer))
      .then((unread) => send(ws, "notification:unread", { unread }))
      .catch(() => undefined);
  });

  subscriber.on("pmessage", (_pattern, channel, message) => {
    const tenantId = parseNotifyChannel(channel);
    if (!tenantId) return;
    let payload: NotificationPayload;
    try {
      payload = JSON.parse(message) as NotificationPayload;
    } catch {
      return;
    }
    for (const [ws, client] of clients) {
      if (client.tenantId === tenantId && isVisibleTo(payload, client.viewer))
        send(ws, "notification:new", payload);
    }
  });

  // Access / branch / mute changes reach open sockets within a minute
  const refresh = setInterval(() => {
    for (const [ws, client] of clients) {
      runWithTenant(client.tenantId, async () => {
        const access = await getStaffAccess(client.user);
        if (!access.active) return ws.close(4403, "Forbidden");
        client.viewer = await notificationViewer(client.user);
      }).catch(() => {
        /* DB/Redis hiccup: keep the previous viewer */
      });
    }
  }, 60_000);

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, 30_000);

  return {
    matches,
    upgrade,
    clientCount: () => clients.size,
    start: () => subscriber.psubscribe(NOTIFY_CHANNEL_PATTERN),
    close() {
      clearInterval(refresh);
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.close(1001, "server shutting down");
      wss.close();
      subscriber.disconnect();
    },
  };
}
