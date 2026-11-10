/**
 * POS 2-screen realtime process — WS /ws/pos/{sessionId} (API-Design §3.3).
 *
 * Auth: browsers can't set headers on a WebSocket, so the Keycloak access token is
 * sent as the second subprotocol: `new WebSocket(url, ["bizone-pos", token])`, and the
 * tenant as `?tenant=`. The cart lives in Redis (server/services/posCart.ts); every
 * change is published on `bizone:pos:{tenantId}:{sessionId}` and fanned out to all sockets
 * of that session on every instance, so the cashier and customer screens stay identical.
 * Every DB/Redis access runs inside runWithTenant() → the tenant's own database.
 */
import { createServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { authenticateToken } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { isKnownTenant, runWithTenant } from "@/lib/tenant";
import {
  parsePosChannel,
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
  listHeld,
  saveHeld,
  deleteHeld,
  heldSummaries,
  type StoredCart,
} from "@/server/services/posCart";
import { HeldCartError, MAX_HELD_CARTS, mergeLines, splitLines } from "@/lib/pos/held";
import { getStaffAccess } from "@/server/services/rbac.service";
import { DISPLAY_TOKEN_PREFIX, resolveDisplayToken } from "@/server/services/posPairing.service";
import { publishPosEvent } from "@/server/services/posEvents";
import {
  findProductByCode,
  loadCartLines,
  resolveCoupon,
  loadCustomer,
} from "@/server/services/pricing.service";
import { ensureDbUserId, resolveDbUserId } from "@/server/services/user.service";
import { resolveBranchScope } from "@/server/middleware/branchScope";
import { isPosManager, sessionAccess, type SessionAccess } from "@/lib/pos/access";
import { createNotificationHub } from "@/server/ws/notifications";
import { NOTIFY_WS_PATH } from "@/lib/notifications/events";

const port = Number(process.env.POS_WS_PORT ?? 3002);

interface Client {
  sessionId: number;
  /** `${tenantId}:${sessionId}` — session ids are only unique within one tenant DB */
  room: string;
  /** null for a customer display paired by PIN (read-only, no Keycloak user) */
  user: AuthUser | null;
  tenantId: string;
  canWrite: boolean;
  actor?: PosActor;
}

/** Staff check from the tenant DB: deactivated staff / custom roles apply to WS too (#58) */
async function staffCan(user: AuthUser, permission: "pos:read" | "pos:write") {
  const access = await getStaffAccess(user);
  return access.active && hasPermission(user, permission, access.capabilities);
}

const canManageOf = (user: AuthUser) => hasPermission(user, "admin:*") || isPosManager(user.roles);

/**
 * QA-3 (#93): what this user may do on this shift — its branch must be in the user's branch
 * scope; only the cashier who opened it and managers of the branch may write. Run in tenant.
 */
async function accessToSession(user: AuthUser, sessionId: number): Promise<SessionAccess> {
  const access = await getStaffAccess(user);
  if (!access.active || !hasPermission(user, "pos:read", access.capabilities)) return "none";
  const session = await getPrisma().cashSession.findUnique({
    where: { id: sessionId },
    select: { branchId: true, userId: true },
  });
  if (!session) return "none";
  const scope = await resolveBranchScope(user, access, null);
  return sessionAccess({
    allowedBranchIds: scope.allowed,
    sessionBranchId: session.branchId,
    sessionUserId: session.userId,
    userId: await resolveDbUserId(user),
    canManage: canManageOf(user),
    canWrite: hasPermission(user, "pos:write", access.capabilities),
  });
}

const clients = new Map<WebSocket, Client>();
const rooms = new Map<string, Set<WebSocket>>();
const roomKey = (tenantId: string, sessionId: number) => `${tenantId}:${sessionId}`;
const alive = new WeakMap<WebSocket, boolean>();

// ─── HTTP + upgrade (auth before the socket exists) ───────────────────────────

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        data: {
          status: "ok",
          clients: clients.size,
          sessions: rooms.size,
          notificationClients: notificationHub.clientCount(),
        },
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

  const tenantId = url.searchParams.get("tenant");

  // Customer display paired by PIN (P4.5): read-only token bound to one tenant + shift
  if (token.startsWith(DISPLAY_TOKEN_PREFIX)) {
    const grant = await resolveDisplayToken(token);
    if (!grant) return { status: 401, message: "Invalid display token" };
    if (grant.tenantId !== tenantId || grant.sessionId !== sessionId)
      return { status: 403, message: "Display is paired with another shift" };
    if (!isKnownTenant(tenantId)) return { status: 403, message: "Tenant is not provisioned" };
    const s = await runWithTenant(tenantId, () =>
      getPrisma().cashSession.findUnique({ where: { id: sessionId }, select: { status: true } }),
    );
    if (!s) return { status: 404, message: "Cash session not found" };
    if (s.status !== "open") return { status: 409, message: "Cash session closed" };
    return { sessionId, room: roomKey(tenantId, sessionId), user: null, tenantId, canWrite: false };
  }

  const verified = await authenticateToken(token); // DEV_BYPASS_TOKEN → dev user (P4.0)
  if (!verified.ok) return { status: 401, message: "Invalid token" };
  if (!tenantId || tenantId !== verified.user.tenantId)
    return { status: 403, message: "Tenant mismatch" };
  if (!isKnownTenant(tenantId)) return { status: 403, message: "Tenant is not provisioned" };
  if (!(await runWithTenant(tenantId, () => staffCan(verified.user, "pos:read"))))
    return { status: 403, message: "Forbidden" };

  const session = await runWithTenant(tenantId, () =>
    getPrisma().cashSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    }),
  );
  if (!session) return { status: 404, message: "Cash session not found" };
  if (session.status !== "open") return { status: 409, message: "Cash session closed" };
  // QA-3 (#93): another branch's shift is off limits; other cashiers' shifts are read-only
  const level = await runWithTenant(tenantId, () => accessToSession(verified.user, sessionId));
  if (level === "none") return { status: 403, message: "Shift belongs to another branch" };

  return {
    sessionId,
    room: roomKey(tenantId, sessionId),
    user: verified.user,
    tenantId,
    canWrite: level === "write",
  };
}

// P4.7: WS /ws/notifications lives in this process too
const notificationHub = createNotificationHub(reject);

http.on("upgrade", (req, socket, head) => {
  if (notificationHub.matches(req)) return notificationHub.upgrade(req, socket, head);
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
  if (!rooms.has(client.room)) rooms.set(client.room, new Set());
  rooms.get(client.room)!.add(ws);
  alive.set(ws, true);
  ws.on("pong", () => alive.set(ws, true));
  ws.on("close", () => {
    clients.delete(ws);
    const room = rooms.get(client.room);
    room?.delete(ws);
    if (room?.size === 0) rooms.delete(client.room);
  });
  ws.on("message", (raw) => onMessage(ws, client, raw.toString()));

  // A screen that (re)connects gets the current state straight away
  send(ws, { type: "session:status", data: { status: "open" } });
  try {
    const snapshot = await runWithTenant(client.tenantId, async () =>
      snapshotCart(client.sessionId, await loadCart(client.sessionId)),
    );
    send(ws, { type: "cart:updated", data: snapshot });
    if (client.user) {
      const held = await runWithTenant(client.tenantId, () => listHeld(client.sessionId));
      send(ws, { type: "held:updated", data: { held: heldSummaries(held) } });
    }
  } catch (err) {
    send(ws, { type: "error", data: { code: "INTERNAL_ERROR", message: errorText(err) } });
  }
});

// Redis → local sockets of that session (covers events from the tRPC app and other instances)
const subscriber = getRedis().duplicate();
subscriber.on("pmessage", (_pattern, channel, message) => {
  const parsed = parsePosChannel(channel);
  if (!parsed) return;
  for (const ws of rooms.get(roomKey(parsed.tenantId, parsed.sessionId)) ?? []) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
});

// ─── Client events ────────────────────────────────────────────────────────────

/** Serialize cart mutations per session so concurrent screens can't lose updates */
const queues = new Map<string, Promise<unknown>>();
function serial<T>(room: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(room) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => {});
  queues.set(room, tail);
  // Drop the entry once idle so the map doesn't grow with every session ever served
  void tail.then(() => {
    if (queues.get(room) === tail) queues.delete(room);
  });
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
  const user = client.user!;
  client.actor ??= {
    userId: await ensureDbUserId(user),
    tenantId: client.tenantId,
    canManage: canManageOf(user),
    branchIds: (await resolveBranchScope(user, await getStaffAccess(user), null)).allowed,
  };
  return client.actor;
}

const bad = (message: string, code = "VALIDATION_ERROR") =>
  new Error(JSON.stringify({ code, message }));

async function publishHeld(sessionId: number) {
  await publishPosEvent(sessionId, {
    type: "held:updated",
    data: { held: heldSummaries(await listHeld(sessionId)) },
  });
}

async function holdCart(sessionId: number, cart: StoredCart, label?: string) {
  const held = await listHeld(sessionId);
  if (held.length >= MAX_HELD_CARTS) throw bad(`Tối đa ${MAX_HELD_CARTS} đơn chờ mỗi ca`);
  await saveHeld(sessionId, {
    ...cart,
    id: randomUUID().slice(0, 8),
    label: label?.trim().slice(0, 50) || `Đơn chờ ${held.length + 1}`,
    createdAt: new Date().toISOString(),
  });
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
  if (!client.canWrite || !client.user)
    throw new Error(JSON.stringify({ code: "FORBIDDEN", message: "Màn hình chỉ xem" }));
  // Re-checked on every write (cached 60 s): deactivation / role / branch changes apply at once
  if ((await accessToSession(client.user, sessionId)) !== "write")
    throw new Error(
      JSON.stringify({ code: "FORBIDDEN", message: "Không có quyền thao tác trên ca này" }),
    );

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
    case "display:qr": {
      // Pure relay: the cashier asks every screen of the session to show/hide a QR
      await publishPosEvent(sessionId, { type: "display:qr", data: event.data });
      return;
    }
    case "cart:hold": {
      const cart = await loadCart(sessionId);
      if (cart.items.length === 0) throw bad("Giỏ hàng trống");
      await holdCart(sessionId, cart, event.data?.label);
      await publishHeld(sessionId);
      return commit(sessionId, { ...cart, items: [], customerId: null, couponCode: null });
    }
    case "cart:resume": {
      const held = (await listHeld(sessionId)).find((h) => h.id === event.data.heldId);
      if (!held) throw bad("Đơn chờ không còn tồn tại", "NOT_FOUND");
      const cart = await loadCart(sessionId);
      // The bill on screen is parked in place of the one brought back
      if (cart.items.length > 0) await holdCart(sessionId, cart);
      await deleteHeld(sessionId, held.id);
      await publishHeld(sessionId);
      return commit(sessionId, {
        items: held.items,
        customerId: held.customerId,
        couponCode: held.couponCode,
        version: cart.version,
      });
    }
    case "cart:split": {
      const cart = await loadCart(sessionId);
      let parts;
      try {
        parts = splitLines(cart.items, event.data.items ?? []);
      } catch (e) {
        if (e instanceof HeldCartError) throw bad(e.message);
        throw e;
      }
      // The split-off bill keeps the customer; the coupon stays on the current bill
      await holdCart(
        sessionId,
        { items: parts.moved, customerId: cart.customerId, couponCode: null, version: 0 },
        event.data.label ?? "Hoá đơn tách",
      );
      await publishHeld(sessionId);
      return commit(sessionId, { ...cart, items: parts.stay });
    }
    case "cart:merge": {
      const ids = [...new Set(event.data.heldIds ?? [])];
      if (ids.length === 0) throw bad("Chọn đơn chờ cần gộp");
      const all = await listHeld(sessionId);
      const picked = ids.map((id) => all.find((h) => h.id === id));
      if (picked.some((h) => !h)) throw bad("Đơn chờ không còn tồn tại", "NOT_FOUND");
      const cart = await loadCart(sessionId);
      const merged = mergeLines(cart.items, ...picked.map((h) => h!.items));
      await deleteHeld(sessionId, ...ids);
      await publishHeld(sessionId);
      return commit(sessionId, {
        ...cart,
        items: merged,
        customerId: cart.customerId ?? picked.find((h) => h!.customerId)?.customerId ?? null,
      });
    }
    case "held:discard": {
      await deleteHeld(sessionId, event.data.heldId);
      return publishHeld(sessionId);
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
  serial(client.room, () => runWithTenant(client.tenantId, () => handle(client, msg)))
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

// Staff deactivated / stripped of POS access while connected → drop their sockets (#58)
const accessCheck = setInterval(() => {
  for (const [ws, client] of clients) {
    if (!client.user) continue;
    const user = client.user;
    runWithTenant(client.tenantId, () => accessToSession(user, client.sessionId))
      .then((level) => {
        if (level === "none") ws.close(4403, "Forbidden");
        else client.canWrite = level === "write";
      })
      .catch(() => {
        /* DB/Redis hiccup: keep the socket, next round decides */
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

Promise.all([subscriber.psubscribe(POS_CHANNEL_PATTERN), notificationHub.start()])
  .then(() => {
    http.listen(port, () =>
      console.log(
        `[pos-ws] ws://0.0.0.0:${port}${POS_WS_PATH}/{sessionId} + ${NOTIFY_WS_PATH} (notifications)`,
      ),
    );
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
  clearInterval(accessCheck);
  for (const ws of wss.clients) ws.close(1001, "server shutting down");
  wss.close();
  notificationHub.close();
  http.close();
  subscriber.disconnect();
  getRedis().disconnect();
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
