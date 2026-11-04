/**
 * POS 2-screen sync protocol (API-Design §3.3) — shared by the WebSocket server
 * (server/ws/pos.ts), the tRPC app and the browser client (lib/pos/sync-client.ts).
 * Every message is `{ type, data, requestId?, at }`.
 */
import type { CartTotals } from "./cart";
import type { PaymentMethod } from "@/lib/validators/pos";

export const POS_WS_PATH = "/ws/pos";
/** WebSocket subprotocol; the access token travels as the second protocol value */
export const POS_WS_PROTOCOL = "bizone-pos";
/** Redis pub/sub channel per cash session — fans events out to every WS instance */
/** Redis pub/sub channel of one cash session — namespaced by tenant (session ids are per-DB). */
export const posChannel = (tenantId: string, sessionId: number) =>
  `bizone:pos:${tenantId}:${sessionId}`;
export const POS_CHANNEL_PATTERN = "bizone:pos:*";

/** Inverse of posChannel(); null for anything that is not a session channel. */
export function parsePosChannel(channel: string): { tenantId: string; sessionId: number } | null {
  const m = /^bizone:pos:([A-Za-z0-9_-]+):(\d+)$/.exec(channel);
  return m ? { tenantId: m[1], sessionId: Number(m[2]) } : null;
}

export interface CartSnapshot extends CartTotals {
  sessionId: number;
  customer: { id: number; name: string; phone: string; ranking: string; points: number } | null;
  couponCode: string | null;
  version: number;
}

export interface PaymentCompleted {
  invoiceId: number;
  invoiceCode: string;
  amount: number;
  paid: number;
  change: number;
  pointsEarned: number;
}

/** QR the cashier wants the customer to scan (null hides it) */
export interface DisplayQr {
  amount: number;
  payload: string;
  bankName: string;
  accountNo: string;
  accountName: string;
}

export interface ScannedProduct {
  productId: number;
  variantId: number | null;
  name: string;
  sku: string;
  unitPrice: number;
}

/** Server → client */
export type PosServerEvent =
  | { type: "cart:updated"; data: CartSnapshot }
  | { type: "cart:cleared"; data: Record<string, never> }
  | { type: "payment:completed"; data: PaymentCompleted }
  | { type: "product:scanned"; data: { barcode: string; product: ScannedProduct } }
  | { type: "session:status"; data: { status: "open" | "closed"; summary?: unknown } }
  | { type: "display:qr"; data: DisplayQr | null }
  | { type: "ack"; data: { ok: true } }
  | { type: "error"; data: { code: string; message: string } };

/** Client → server */
export type PosClientEvent =
  | { type: "cart:add"; data: { productId: number; variantId?: number | null; quantity?: number } }
  | { type: "cart:scan"; data: { code: string } }
  | { type: "cart:update"; data: { itemId: string; quantity?: number; discountPercent?: number } }
  | { type: "cart:remove"; data: { itemId: string } }
  | { type: "cart:clear"; data?: Record<string, never> }
  | { type: "cart:set-customer"; data: { customerId: number | null } }
  | { type: "cart:apply-coupon"; data: { code: string } }
  | { type: "cart:remove-coupon"; data?: Record<string, never> }
  | { type: "display:qr"; data: DisplayQr | null }
  | {
      type: "payment:process";
      data: {
        payments: { method: PaymentMethod; amount: number; referenceCode?: string | null }[];
        idempotencyKey: string;
        notes?: string | null;
      };
    };

export type PosEnvelope<E> = E & { requestId?: string; at: string };
