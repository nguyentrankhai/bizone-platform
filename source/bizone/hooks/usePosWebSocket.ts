"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PosSyncClient, type PosSyncMode } from "@/lib/pos/sync-client";
import type {
  CartSnapshot,
  DisplayQr,
  PaymentCompleted,
  PosEnvelope,
  PosServerEvent,
  ScannedProduct,
} from "@/lib/pos/protocol";
import type { PaymentInput } from "@/lib/validators/pos";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";

interface LocalItem {
  id: string;
  productId: number;
  variantId: number | null;
  quantity: number;
  discountPercent: number;
}

interface LocalCart {
  items: LocalItem[];
  customerId: number | null;
  couponCode: string | null;
  version: number;
}

interface Options {
  sessionId: number;
  auth: ApiAuth;
  /** The customer display only listens */
  role: "cashier" | "display";
  onScanned?: (product: ScannedProduct) => void;
  onError?: (message: string) => void;
}

const newId = () => Math.random().toString(36).slice(2, 10);

function cartFromSnapshot(s: CartSnapshot | null): LocalCart {
  return {
    items: (s?.lines ?? []).map((l) => ({
      id: l.id,
      productId: l.productId,
      variantId: l.variantId,
      quantity: l.quantity,
      discountPercent: l.discountPercent,
    })),
    customerId: s?.customer?.id ?? null,
    couponCode: s?.couponCode ?? null,
    version: s?.version ?? 0,
  };
}

/**
 * POS cart state for one cash session, shared by the cashier and customer screens.
 * Online: every action is a WS event; the server owns the cart and both screens
 * render its `cart:updated`. Offline (WS down, HTTP still up): the cashier keeps a
 * local cart priced by `pos.quote` and mirrors it to the display over
 * BroadcastChannel; on reconnect the local cart is replayed to the server.
 */
export function usePosWebSocket({ sessionId, auth, role, onScanned, onError }: Options) {
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [mode, setMode] = useState<PosSyncMode>("connecting");
  const [completed, setCompleted] = useState<PaymentCompleted | null>(null);
  const [qr, setQr] = useState<DisplayQr | null>(null);
  const [sessionClosed, setSessionClosed] = useState(false);

  const clientRef = useRef<PosSyncClient | null>(null);
  const cartRef = useRef<CartSnapshot | null>(null);
  const localRef = useRef<LocalCart | null>(null);
  const dirtyRef = useRef(false);
  const cbRef = useRef({ onScanned, onError });
  useEffect(() => {
    cbRef.current = { onScanned, onError };
  });

  const applyCart = useCallback((s: CartSnapshot | null) => {
    cartRef.current = s;
    setCart(s);
  }, []);

  const fail = useCallback((e: unknown) => {
    const msg = errorMessage(e);
    cbRef.current.onError?.(msg);
    throw new Error(msg);
  }, []);

  // ── Local (fallback) cart ───────────────────────────────────────────────────

  const priceLocal = useCallback(
    async (local: LocalCart) => {
      const q = await trpc.pos.quote.query(
        { items: local.items, customerId: local.customerId, couponCode: local.couponCode },
        apiContext(auth),
      );
      const snap: CartSnapshot = {
        ...q,
        sessionId,
        couponCode: local.couponCode,
        version: local.version,
        customer: q.customer
          ? {
              id: q.customer.id,
              name: q.customer.fullName,
              phone: q.customer.phone,
              ranking: q.customer.ranking,
              points: q.customer.totalPoints,
            }
          : null,
      };
      applyCart(snap);
      clientRef.current?.broadcastLocal({ type: "cart:updated", data: snap });
      return snap;
    },
    [auth, sessionId, applyCart],
  );

  const mutateLocal = useCallback(
    async (fn: (c: LocalCart) => void | Promise<void>) => {
      const base = localRef.current ?? cartFromSnapshot(cartRef.current);
      const next: LocalCart = {
        ...base,
        items: base.items.map((i) => ({ ...i })),
        version: base.version + 1,
      };
      await fn(next);
      const snap = await priceLocal(next);
      if (snap.couponError && next.couponCode) {
        // Keep an invalid coupon out of the cart, like the server does
        next.couponCode = base.couponCode;
        await priceLocal(next);
        throw new Error(snap.couponError);
      }
      localRef.current = next;
      dirtyRef.current = true;
    },
    [priceLocal],
  );

  /** After reconnecting, push what was sold offline into the server cart */
  const replayLocal = useCallback(async () => {
    const local = localRef.current;
    const client = clientRef.current;
    if (!dirtyRef.current || !local || !client) return;
    dirtyRef.current = false;
    localRef.current = null;
    try {
      await client.send({ type: "cart:clear" });
      for (const it of local.items) {
        await client.send({
          type: "cart:add",
          data: { productId: it.productId, variantId: it.variantId, quantity: it.quantity },
        });
      }
      if (local.customerId)
        await client.send({ type: "cart:set-customer", data: { customerId: local.customerId } });
      if (local.couponCode)
        await client.send({ type: "cart:apply-coupon", data: { code: local.couponCode } });
    } catch (e) {
      cbRef.current.onError?.(`Đồng bộ lại giỏ hàng thất bại: ${errorMessage(e)}`);
    }
  }, []);

  // ── Connection ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !auth.authToken) return;
    const client = new PosSyncClient({
      sessionId,
      tenantId: auth.tenantId,
      getToken: () => auth.authToken,
      onMode: (m) => {
        setMode(m);
        if (m === "ws" && role === "cashier") void replayLocal();
      },
      onEvent: (e: PosEnvelope<PosServerEvent>, source) => {
        // The cashier ignores its own BroadcastChannel echo; the display takes both
        if (source === "local" && role === "cashier") return;
        switch (e.type) {
          case "cart:updated":
            if (!localRef.current || source === "local") applyCart(e.data);
            break;
          case "cart:cleared":
            applyCart(null);
            break;
          case "payment:completed":
            setCompleted(e.data);
            setQr(null);
            break;
          case "display:qr":
            setQr(e.data);
            break;
          case "product:scanned":
            cbRef.current.onScanned?.(e.data.product);
            break;
          case "session:status":
            if (e.data.status === "closed") setSessionClosed(true);
            break;
          case "error":
            cbRef.current.onError?.(e.data.message);
            break;
        }
      },
    }).start();
    clientRef.current = client;
    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [sessionId, auth.authToken, auth.tenantId, role, applyCart, replayLocal]);

  const online = () => clientRef.current?.mode === "ws";

  // ── Actions (cashier) ───────────────────────────────────────────────────────

  const add = useCallback(
    async (productId: number, variantId: number | null = null, quantity = 1) => {
      try {
        if (online())
          return await clientRef.current!.send({
            type: "cart:add",
            data: { productId, variantId, quantity },
          });
        await mutateLocal((c) => {
          const line = c.items.find((i) => i.productId === productId && i.variantId === variantId);
          if (line) line.quantity += quantity;
          else c.items.push({ id: newId(), productId, variantId, quantity, discountPercent: 0 });
        });
      } catch (e) {
        fail(e);
      }
    },
    [mutateLocal, fail],
  );

  const scan = useCallback(
    async (code: string) => {
      try {
        if (online()) return await clientRef.current!.send({ type: "cart:scan", data: { code } });
        const line = await trpc.pos.scan.query({ code }, apiContext(auth));
        await mutateLocal((c) => {
          const found = c.items.find(
            (i) => i.productId === line.productId && i.variantId === line.variantId,
          );
          if (found) found.quantity += 1;
          else
            c.items.push({
              id: newId(),
              productId: line.productId,
              variantId: line.variantId,
              quantity: 1,
              discountPercent: 0,
            });
        });
        cbRef.current.onScanned?.({
          productId: line.productId,
          variantId: line.variantId,
          name: line.name,
          sku: line.sku,
          unitPrice: line.unitPrice,
        });
      } catch (e) {
        fail(e);
      }
    },
    [auth, mutateLocal, fail],
  );

  const setQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      try {
        if (online())
          return await clientRef.current!.send({ type: "cart:update", data: { itemId, quantity } });
        await mutateLocal((c) => {
          c.items = quantity <= 0 ? c.items.filter((i) => i.id !== itemId) : c.items;
          const line = c.items.find((i) => i.id === itemId);
          if (line) line.quantity = quantity;
        });
      } catch (e) {
        fail(e);
      }
    },
    [mutateLocal, fail],
  );

  const remove = useCallback(
    async (itemId: string) => {
      try {
        if (online())
          return await clientRef.current!.send({ type: "cart:remove", data: { itemId } });
        await mutateLocal((c) => {
          c.items = c.items.filter((i) => i.id !== itemId);
        });
      } catch (e) {
        fail(e);
      }
    },
    [mutateLocal, fail],
  );

  const clear = useCallback(async () => {
    try {
      if (online()) return await clientRef.current!.send({ type: "cart:clear" });
      localRef.current = {
        items: [],
        customerId: null,
        couponCode: null,
        version: (localRef.current?.version ?? 0) + 1,
      };
      dirtyRef.current = true;
      applyCart(null);
      clientRef.current?.broadcastLocal({ type: "cart:cleared", data: {} });
    } catch (e) {
      fail(e);
    }
  }, [applyCart, fail]);

  const setCustomer = useCallback(
    async (customerId: number | null) => {
      try {
        if (online())
          return await clientRef.current!.send({ type: "cart:set-customer", data: { customerId } });
        await mutateLocal((c) => {
          c.customerId = customerId;
        });
      } catch (e) {
        fail(e);
      }
    },
    [mutateLocal, fail],
  );

  const applyCoupon = useCallback(
    async (code: string | null) => {
      try {
        if (online()) {
          return await clientRef.current!.send(
            code ? { type: "cart:apply-coupon", data: { code } } : { type: "cart:remove-coupon" },
          );
        }
        await mutateLocal((c) => {
          c.couponCode = code ? code.trim().toUpperCase() : null;
        });
      } catch (e) {
        fail(e);
      }
    },
    [mutateLocal, fail],
  );

  /** Show (or hide with null) a payment QR on every screen of the session */
  const showQr = useCallback(async (data: DisplayQr | null) => {
    setQr(data);
    try {
      if (online()) await clientRef.current!.send({ type: "display:qr", data });
      else clientRef.current?.broadcastLocal({ type: "display:qr", data });
    } catch {
      // the display just won't show the QR; the cashier screen still does
    }
  }, []);

  /**
   * Checkout always goes through tRPC (works in both modes and returns the invoice);
   * the server then pushes payment:completed + cart:cleared to every screen.
   */
  const pay = useCallback(
    async (payments: PaymentInput[], idempotencyKey: string, notes?: string | null) => {
      const snap = cartRef.current;
      if (!snap || snap.lines.length === 0) throw new Error("Giỏ hàng trống");
      try {
        const result = await trpc.pos.createInvoice.mutate(
          {
            cashSessionId: sessionId,
            customerId: snap.customer?.id ?? null,
            couponCode: snap.couponCode,
            items: snap.lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              quantity: l.quantity,
              discountPercent: l.discountPercent,
            })),
            payments,
            notes: notes ?? null,
            idempotencyKey,
          },
          apiContext(auth),
        );
        setCompleted(result);
        setQr(null);
        localRef.current = null;
        dirtyRef.current = false;
        applyCart(null);
        if (!online()) {
          clientRef.current?.broadcastLocal({ type: "payment:completed", data: result });
          clientRef.current?.broadcastLocal({ type: "cart:cleared", data: {} });
        }
        return result;
      } catch (e) {
        return fail(e);
      }
    },
    [auth, sessionId, applyCart, fail],
  );

  return {
    cart,
    mode,
    completed,
    qr,
    sessionClosed,
    dismissCompleted: () => setCompleted(null),
    add,
    scan,
    setQuantity,
    remove,
    clear,
    setCustomer,
    applyCoupon,
    showQr,
    pay,
  };
}
