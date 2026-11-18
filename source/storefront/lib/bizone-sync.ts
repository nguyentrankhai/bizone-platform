import "server-only";
import { headers } from "next/headers";
import type { StoreRef } from "./store";
import type {
  Category,
  CreatedOrder,
  CustomerProfile,
  OrderDetail,
  OrderSummary,
  Paged,
  PointEntry,
  ProductDetail,
  ProductList,
  Quote,
  StoreInfo,
} from "./types";

/**
 * Client of BizOne's store API (P6.1) — the website's only link to BizOne. Products, prices and
 * stock are always read live (no copy kept here), orders are written straight into BizOne's
 * Orders module, so the shop's back office, POS stock and the website stay in sync.
 */

export class StoreApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "StoreApiError";
  }
}

const TIMEOUT_MS = 15_000;

interface CallOpts {
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  customerToken?: string | null;
  idempotencyKey?: string;
}

async function clientIp(): Promise<string> {
  if (process.env.TRUST_PROXY !== "true") return "storefront";
  const h = await headers();
  return (
    h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").pop()?.trim() || "storefront"
  );
}

async function call<T>(
  store: StoreRef,
  method: "GET" | "POST",
  path: string,
  opts: CallOpts = {},
): Promise<T> {
  const base = (process.env.BIZONE_API_URL ?? "http://localhost:3000/api/store/v1").replace(
    /\/+$/,
    "",
  );
  const url = new URL(`${base}/${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {}))
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "x-store-key": store.key,
        "x-client-ip": await clientIp(),
        ...(opts.customerToken ? { "x-customer-token": opts.customerToken } : {}),
        ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new StoreApiError(
      503,
      "UNREACHABLE",
      `Cửa hàng tạm thời không kết nối được, vui lòng thử lại (${e instanceof Error ? e.message : e})`,
    );
  }
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string; details?: unknown };
  } | null;
  if (!res.ok || !json?.success)
    throw new StoreApiError(
      res.status,
      json?.error?.code ?? "ERROR",
      json?.error?.message ?? `Lỗi máy chủ cửa hàng (HTTP ${res.status})`,
      json?.error?.details,
    );
  return json.data as T;
}

export interface CartItemInput {
  productId: number;
  variantId?: number | null;
  quantity: number;
}

export const bizone = {
  store: (s: StoreRef) => call<StoreInfo>(s, "GET", "store"),
  categories: (s: StoreRef) => call<Category[]>(s, "GET", "categories"),
  products: (
    s: StoreRef,
    q: { search?: string; category?: string; page?: number; limit?: number; sort?: string },
  ) => call<ProductList>(s, "GET", "products", { query: q }),
  product: (s: StoreRef, slug: string) =>
    call<ProductDetail>(s, "GET", `products/${encodeURIComponent(slug)}`),
  quote: (s: StoreRef, items: CartItemInput[], couponCode: string | null, token: string | null) =>
    call<Quote>(s, "POST", "cart/quote", { body: { items, couponCode }, customerToken: token }),

  registerStart: (s: StoreRef, phone: string) =>
    call<{ sent: boolean; expiresIn: number; devCode?: string }>(s, "POST", "auth/register/start", {
      body: { phone },
    }),
  registerVerify: (
    s: StoreRef,
    input: { phone: string; code: string; fullName: string; email?: string; password: string },
  ) =>
    call<{ token: string; customer: CustomerProfile }>(s, "POST", "auth/register/verify", {
      body: input,
    }),
  login: (s: StoreRef, phone: string, password: string) =>
    call<{ token: string; customer: CustomerProfile }>(s, "POST", "auth/login", {
      body: { phone, password },
    }),
  logout: (s: StoreRef, token: string) =>
    call<{ loggedOut: boolean }>(s, "POST", "auth/logout", { body: {}, customerToken: token }),
  me: (s: StoreRef, token: string) =>
    call<CustomerProfile>(s, "GET", "me", { customerToken: token }),
  points: (s: StoreRef, token: string, page = 1) =>
    call<Paged<PointEntry>>(s, "GET", "me/points", { customerToken: token, query: { page } }),

  orders: (s: StoreRef, token: string, page = 1) =>
    call<Paged<OrderSummary>>(s, "GET", "orders", { customerToken: token, query: { page } }),
  order: (s: StoreRef, code: string, who: { token?: string | null; phone?: string | null }) =>
    call<OrderDetail>(s, "GET", `orders/${encodeURIComponent(code)}`, {
      customerToken: who.token,
      query: { phone: who.phone },
    }),
  createOrder: (
    s: StoreRef,
    input: {
      items: CartItemInput[];
      couponCode?: string | null;
      contact: { name: string; phone: string; address: string; email?: string | null };
      note?: string | null;
      paymentMethod: "cod" | "payhub";
      returnUrl?: string;
    },
    opts: { token: string | null; idempotencyKey: string },
  ) =>
    call<CreatedOrder>(s, "POST", "orders", {
      body: input,
      customerToken: opts.token,
      idempotencyKey: opts.idempotencyKey,
    }),
  payOrder: (
    s: StoreRef,
    code: string,
    returnUrl: string,
    who: { token?: string | null; phone?: string | null },
  ) =>
    call<{ paymentUrl: string; txnCode: string | null }>(
      s,
      "POST",
      `orders/${encodeURIComponent(code)}/pay`,
      { body: { returnUrl }, customerToken: who.token, query: { phone: who.phone } },
    ),
  cancelOrder: (
    s: StoreRef,
    code: string,
    reason: string | null,
    who: { token?: string | null; phone?: string | null },
  ) =>
    call<OrderDetail>(s, "POST", `orders/${encodeURIComponent(code)}/cancel`, {
      body: { reason },
      customerToken: who.token,
      query: { phone: who.phone },
    }),
};
