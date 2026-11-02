import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { REALTIME_CHANNEL } from "@/lib/events";
import { createRedis } from "@/lib/redis";

const port = Number(process.env.WS_PORT ?? 4001);

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: true, data: { status: "ok", clients: wss.clients.size } }));
    return;
  }
  res.writeHead(404).end();
});

// Unauthenticated until Keycloak token checks land (P1.5); publish nothing sensitive before then.
const wss = new WebSocketServer({ server: http, path: "/ws" });
const alive = new WeakMap<WebSocket, boolean>();

wss.on("connection", (socket) => {
  alive.set(socket, true);
  socket.on("pong", () => alive.set(socket, true));
  socket.send(JSON.stringify({ type: "connected", data: null, at: new Date().toISOString() }));
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
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
  for (const socket of wss.clients) {
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
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
