import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { verifyJwt } from "@/lib/auth";
import { REALTIME_CHANNEL, canReceive, type RealtimeEvent } from "@/lib/events";
import { createRedis } from "@/lib/redis";
import { ADMIN_READ_ROLES } from "@/server/middleware/adminAuth";

/**
 * Admin realtime relay. Clients authenticate with a Keycloak access token (realm payment-hub)
 * sent as the second subprotocol: `new WebSocket(url, ["payhub-events", token])`.
 * Requires role payhub-admin | payhub-viewer; a token carrying `merchant_id` only receives
 * events of that merchant. The socket is closed when the token expires.
 */

const port = Number(process.env.WS_PORT ?? 4001);
const WS_PATH = "/ws";
export const PAYHUB_WS_PROTOCOL = "payhub-events";

interface Client {
  userId: string;
  merchantId?: number;
  expiresAt: number; // epoch ms
}

const clients = new Map<WebSocket, Client>();
const alive = new WeakMap<WebSocket, boolean>();

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: true, data: { status: "ok", clients: clients.size } }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => (protocols.has(PAYHUB_WS_PROTOCOL) ? PAYHUB_WS_PROTOCOL : false),
});

function reject(socket: Duplex, status: number, message: string) {
  socket.write(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${message}`,
  );
  socket.destroy();
}

async function authorize(
  req: IncomingMessage,
): Promise<Client | { status: number; message: string }> {
  const url = new URL(req.url ?? "", "http://localhost");
  if (url.pathname !== WS_PATH) return { status: 404, message: "Not Found" };

  const protocols = (req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim());
  const token = protocols.find((p) => p && p !== PAYHUB_WS_PROTOCOL);
  if (!protocols.includes(PAYHUB_WS_PROTOCOL) || !token) {
    return { status: 401, message: "Missing token" };
  }

  const verified = await verifyJwt(token);
  if (!verified.ok) return { status: 401, message: "Invalid token" };
  const { user } = verified;
  if (!user.roles.some((r) => (ADMIN_READ_ROLES as readonly string[]).includes(r))) {
    return { status: 403, message: "Forbidden" };
  }

  let merchantId: number | undefined;
  if (user.merchantId) {
    merchantId = Number(user.merchantId);
    if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
      return { status: 403, message: "Invalid merchant_id claim" };
    }
  }

  return { userId: user.id, merchantId, expiresAt: user.expiresAt * 1000 };
}

http.on("upgrade", (req, socket, head) => {
  authorize(req)
    .then((result) => {
      if ("status" in result) return reject(socket, result.status, result.message);
      wss.handleUpgrade(req, socket, head, (ws) => {
        clients.set(ws, result);
        alive.set(ws, true);
        ws.on("pong", () => alive.set(ws, true));
        ws.on("close", () => clients.delete(ws));
        ws.send(JSON.stringify({ type: "connected", data: null, at: new Date().toISOString() }));
      });
    })
    .catch((err) => {
      console.error("[realtime] upgrade failed:", err);
      reject(socket, 500, "Internal Server Error");
    });
});

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const [socket, client] of clients) {
    if (client.expiresAt <= now) {
      socket.close(4401, "token expired");
      continue;
    }
    if (!alive.get(socket)) {
      socket.terminate();
      continue;
    }
    alive.set(socket, false);
    socket.ping();
  }
}, 30_000);

const subscriber = createRedis();
subscriber.on("message", (_channel, message) => {
  let event: RealtimeEvent;
  try {
    event = JSON.parse(message) as RealtimeEvent;
  } catch {
    return;
  }
  const now = Date.now();
  for (const [socket, client] of clients) {
    if (socket.readyState !== WebSocket.OPEN || client.expiresAt <= now) continue;
    if (canReceive(client, event)) socket.send(message);
  }
});

subscriber
  .subscribe(REALTIME_CHANNEL)
  .then(() => {
    http.listen(port, () => {
      console.log(`[realtime] ws://0.0.0.0:${port}/ws relaying "${REALTIME_CHANNEL}"`);
    });
  })
  .catch((err) => {
    console.error("[realtime] failed to subscribe to Redis:", err);
    process.exit(1);
  });

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[realtime] ${signal} received, closing…`);
  clearInterval(heartbeat);
  for (const socket of wss.clients) socket.close(1001, "server shutting down");
  wss.close();
  http.close();
  subscriber.disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
