/**
 * POS 2-screen realtime process — WS /ws/pos/{sessionId} (API-Design §3.3).
 *
 * Auth: browsers can't set headers on a WebSocket, so the Keycloak access token is
 * sent as the second subprotocol: `new WebSocket(url, ["bizone-pos", token])`, and the
 * tenant as `?tenant=`. The cart lives in Redis (server/services/posCart.ts); every
 * change is published on `bizone:pos:{sessionId}` and fanned out to all sockets of
 * that session on every instance, so the cashier and customer screens stay identical.
 */
import { createServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { verifyJwt } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import {
  POS_CHANNEL_PATTERN,
  POS_WS_PATH,
  POS_WS_PROTOCOL,
  type PosClientEvent,
  type PosServerEvent,
} from "@/lib/pos/protocol";
import type { AuthUser } from "@/types/auth";
import { createInvoice } from "@/server/services/invoice.service";
import type { PosActor } from "@/server/services/cashSession.service";
import {
  loadCart,
  saveCart,
  snapshotCart,
  clearCart,
  type StoredCart,
} from "@/server/services/posCart";
import { publishPosEvent } from "@/server/services/posEvents";
import {
  findProductByCode,
  loadCartLines,
  resolveCoupon,
  loadCustomer,
} from "@/server/services/pricing.service";
import { ensureDbUserId } from "@/server/services/user.service";

const port = Number(process.env.POS_WS_PORT ?? 3002);
const MANAGER_ROLES = ["bizone-admin", "bizone-manager"];

interface Client {
  sessionId: number;
  user: AuthUser;
  tenantId: string;
  canWrite: boolean;
  actor?: PosActor;
}

const clients = new Map<WebSocket, Client>();
const rooms = new Map<number, Set<WebSocket>>();
const alive = new WeakMap<WebSocket, boolean>();

// ─── HTTP + upgrade (auth before the socket exists) ───────────────────────────

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        data: { status: "ok", clients: clients.size, sessions: rooms.size },
      }),
    );
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => (protocols.has(POS_WS_PROTOCOL) ? POS_WS_PROTOCOL : false),
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
  const match = url.pathname.match(new RegExp(`^${POS_WS_PATH}/(\\d+)$`));
  if (!match) return { status: 404, message: "Not Found" };
  const sessionId = Number(match[1]);

  const protocols = (req.headers["sec-websocket-protocol"] ?? "").split(",").map((s) => s.trim());
  const token = protocols.find((p) => p && p !== POS_WS_PROTOCOL);
  if (!protocols.includes(POS_WS_PROTOCOL) || !token)
    return { status: 401, message: "Missing token" };

  const verified = await verifyJwt(token);
  if (!verified.ok) return { status: 401, message: "Invalid token" };
  const tenantId = url.searchParams.get("tenant");
  if (!tenantId || tenantId !== verified.user.tenantId)
    return { status: 403, message: "Tenant mismatch" };
  if (!hasPermission(verified.user, "pos:read")) return { status: 403, message: "Forbidden" };

  const session = await getPrisma().cashSession.findUnique({
    where: { id: sessionId },
    select: { status: true },
  });
  if (!session) return { status: 404, message: "Cash session not found" };
  if (session.status !== "open") return { status: 409, message: "Cash session closed" };

  return {
    sessionId,
    user: verified.user,
    tenantId,
    canWrite: hasPermission(verified.user, "pos:write"),
  };
}

http.on("upgrade", (req, socket, head) => {
  authorize(req)
    .then((result) => {
      if ("status" in result) return reject(socket, result.status, result.message);
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, result));
    })
    .catch((err) => {
      console.error("[pos-ws] upgrade failed:", err);
      reject(socket, 500, "Internal Server Error");
    });
});

// ─── Rooms ────────────────────────────────────────────────────────────────────

function send(ws: WebSocket, event: PosServerEvent, requestId?: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        ...event,
        ...(requestId ? { requestId } : {}),
        at: new Date().toISOString(),
      }),
    );
  }
}

wss.on("connection", async (ws: WebSocket, client: Client) => {
  clients.set(ws, client);
  if (!rooms.has(client.sessionId)) rooms.set(client.sessionId, new Set());
  rooms.get(client.sessionId)!.add(ws);
  alive.set(ws, true);
  ws.on("pong", () => alive.set(ws, true));
  ws.on("close", () => {
    clients.delete(ws);
    const room = rooms.get(client.sessionId);
    room?.delete(ws);
    if (room?.size === 0) rooms.delete(client.sessionId);
  });
  ws.on("message", (raw) => onMessage(ws, client, raw.toString()));

  // A screen that (re)connects gets the current state straight away
  send(ws, { type: "session:status", data: { status: "open" } });
  try {
    const cart = await loadCart(client.sessionId);
    send(ws, { type: "cart:updated", data: await snapshotCart(client.sessionId, cart) });
  } catch (err) {
    send(ws, { type: "error", data: { code: "INTERNAL_ERROR", message: errorText(err) } });
  }
});

// Redis → local sockets of that session (covers events from the tRPC app and other instances)
const subscriber = getRedis().duplicate();
subscriber.on("pmessage", (_pattern, channel, message) => {
  const sessionId = Number(channel.split(":").pop());
  for (const ws of rooms.get(sessionId) ?? []) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
});

// ─── Client events ────────────────────────────────────────────────────────────

/** Serialize cart mutations per session so concurrent screens can't lose updates */
const queues = new Map<number, Promise<unknown>>();
function serial<T>(sessionId: number, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(sessionId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(
    sessionId,
    next.catch(() => {}),
  );
  return next;
}

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  try {
    return (JSON.parse(msg) as { message?: string }).message ?? msg;
  } catch {
    return msg;
  }
}

function errorCode(err: unknown): string {
  try {
    return (JSON.parse((err as Error).message) as { code?: string }).code ?? "INTERNAL_ERROR";
  } catch {
    return "INTERNAL_ERROR";
  }
}

async function actorFor(client: Client): Promise<PosActor> {
  client.actor ??= {
    userId: await ensureDbUserId(client.user),
    tenantId: client.tenantId,
    canManage:
      hasPermission(client.user, "admin:*") ||
      client.user.roles.some((r) => MANAGER_ROLES.includes(r)),
  };
  return client.actor;
}

async function commit(sessionId: number, cart: StoredCart) {
  const saved = await saveCart(sessionId, cart);
  await publishPosEvent(sessionId, {
    type: "cart:updated",
    data: await snapshotCart(sessionId, saved),
  });
}

async function addItem(
  cart: StoredCart,
  productId: number,
  variantId: number | null,
  quantity: number,
) {
  // Validates the product (active, variant belongs to it) before it reaches the cart
  await loadCartLines([{ productId, variantId, quantity, discountPercent: 0 }]);
  const line = cart.items.find((i) => i.productId === productId && i.variantId === variantId);
  if (line) line.quantity += quantity;
  else
    cart.items.push({
      id: randomUUID().slice(0, 8),
      productId,
      variantId,
      quantity,
      discountPercent: 0,
    });
}

async function handle(client: Client, event: PosClientEvent): Promise<void> {
  const { sessionId } = client;
  if (!client.canWrite)
    throw new Error(JSON.stringify({ code: "FORBIDDEN", message: "Màn hình chỉ xem" }));

  switch (event.type) {
    case "cart:add": {
      const cart = await loadCart(sessionId);
      await addItem(
        cart,
        event.data.productId,
        event.data.variantId ?? null,
        event.data.quantity ?? 1,
      );
      return commit(sessionId, cart);
    }
    case "cart:scan": {
      const hit = await findProductByCode(event.data.code);
      if (!hit) {
        throw new Error(
          JSON.stringify({
            code: "NOT_FOUND",
            message: `Không tìm thấy sản phẩm "${event.data.code}"`,
          }),
        );
      }
      const cart = await loadCart(sessionId);
      await addItem(cart, hit.productId, hit.variantId, 1);
      const [line] = await loadCartLines([{ ...hit, quantity: 1, discountPercent: 0 }]);
      await publishPosEvent(sessionId, {
        type: "product:scanned",
        data: {
          barcode: event.data.code,
          product: {
            productId: line.productId,
            variantId: line.variantId,
            name: line.name,
            sku: line.sku,
            unitPrice: line.unitPrice,
          },
        },
      });
      return commit(sessionId, cart);
    }
    case "cart:update": {
      const cart = await loadCart(sessionId);
      const line = cart.items.find((i) => i.id === event.data.itemId);
      if (!line)
        throw new Error(
          JSON.stringify({ code: "NOT_FOUND", message: "Dòng hàng không còn trong giỏ" }),
        );
      if (event.data.quantity !== undefined) {
        if (event.data.quantity <= 0) cart.items = cart.items.filter((i) => i !== line);
        else line.quantity = event.data.quantity;
      }
      if (event.data.discountPercent !== undefined) {
        line.discountPercent = Math.min(100, Math.max(0, event.data.discountPercent));
      }
      return commit(sessionId, cart);
    }
    case "cart:remove": {
      const cart = await loadCart(sessionId);
      cart.items = cart.items.filter((i) => i.id !== event.data.itemId);
      return commit(sessionId, cart);
    }
    case "cart:clear": {
      await clearCart(sessionId);
      await publishPosEvent(sessionId, { type: "cart:cleared", data: {} });
      return commit(sessionId, { items: [], customerId: null, couponCode: null, version: 0 });
    }
    case "cart:set-customer": {
      if (event.data.customerId) await loadCustomer(event.data.customerId);
      const cart = await loadCart(sessionId);
      cart.customerId = event.data.customerId;
      return commit(sessionId, cart);
    }
    case "cart:apply-coupon": {
      const cart = await loadCart(sessionId);
      const { error } = await resolveCoupon(event.data.code, cart.customerId);
      if (error) throw new Error(JSON.stringify({ code: "VALIDATION_ERROR", message: error }));
      cart.couponCode = event.data.code.trim().toUpperCase();
      return commit(sessionId, cart);
    }
    case "cart:remove-coupon": {
      const cart = await loadCart(sessionId);
      cart.couponCode = null;
      return commit(sessionId, cart);
    }
    case "payment:process": {
      const cart = await loadCart(sessionId);
      if (cart.items.length === 0)
        throw new Error(JSON.stringify({ code: "VALIDATION_ERROR", message: "Giỏ hàng trống" }));
      // createInvoice publishes payment:completed + cart:cleared to the session
      await createInvoice(
        {
          cashSessionId: sessionId,
          customerId: cart.customerId,
          items: cart.items,
          payments: event.data.payments,
          couponCode: cart.couponCode,
          notes: event.data.notes ?? null,
          idempotencyKey: event.data.idempotencyKey,
        },
        await actorFor(client),
      );
      return;
    }
    default:
      throw new Error(
        JSON.stringify({ code: "VALIDATION_ERROR", message: "Sự kiện không hỗ trợ" }),
      );
  }
}

function onMessage(ws: WebSocket, client: Client, raw: string) {
  let msg: PosClientEvent & { requestId?: string };
  try {
    msg = JSON.parse(raw);
    if (typeof msg?.type !== "string") throw new Error("type");
  } catch {
    return send(ws, {
      type: "error",
      data: { code: "VALIDATION_ERROR", message: "Thông điệp không hợp lệ" },
    });
  }
  serial(client.sessionId, () => handle(client, msg))
    .then(() => send(ws, { type: "ack", data: { ok: true } }, msg.requestId))
    .catch((err) =>
      send(
        ws,
        { type: "error", data: { code: errorCode(err), message: errorText(err) } },
        msg.requestId,
      ),
    );
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

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

subscriber
  .psubscribe(POS_CHANNEL_PATTERN)
  .then(() => {
    http.listen(port, () => console.log(`[pos-ws] ws://0.0.0.0:${port}${POS_WS_PATH}/{sessionId}`));
  })
  .catch((err) => {
    console.error("[pos-ws] failed to subscribe to Redis:", err);
    process.exit(1);
  });

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[pos-ws] ${signal} received, closing…`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, "server shutting down");
  wss.close();
  http.close();
  subscriber.disconnect();
  getRedis().disconnect();
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
