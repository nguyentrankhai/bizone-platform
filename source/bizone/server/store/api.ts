import { TRPCError } from "@trpc/server";
import { ZodError, type ZodType } from "zod";
import { isKnownTenant, runWithTenant } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { productIdFromSlug } from "@/lib/omni/website";
import { parseStoreKey } from "@/lib/omni/secrets";
import {
  cancelOrderSchema,
  createOrderSchema,
  loginSchema,
  orderLookupSchema,
  pageSchema,
  payOrderSchema,
  productListSchema,
  quoteSchema,
  registerStartSchema,
  registerVerifySchema,
} from "@/lib/validators/store";
import { channelForKey, type StoreChannel } from "@/server/services/omni/websiteChannel.service";
import {
  storeCategories,
  storeInfo,
  storeProduct,
  storeProducts,
} from "@/server/services/omni/storeCatalog.service";
import {
  completeRegistration,
  customerOfToken,
  customerProfile,
  login,
  logout,
  pointHistory,
  startRegistration,
} from "@/server/services/omni/storeCustomer.service";
import {
  cancelStoreOrder,
  createStoreOrder,
  findStoreOrder,
  getStoreOrder,
  listStoreOrders,
  startPayment,
  storeQuote,
} from "@/server/services/omni/storeOrder.service";
import { isStorefrontUrl } from "@/lib/omni/website";

/**
 * Store API for the website (P6.1) — `/api/store/v1/*`, called server-to-server by the
 * storefront. Headers:
 *   X-Store-Key        `bzs.{tenant}.{secret}` (channel key, required)
 *   X-Customer-Token   `cst_…` session of a logged-in customer (optional)
 *   X-Client-IP        end customer's IP as seen by the storefront (rate limits)
 *   Idempotency-Key    required for POST /orders
 * Responses follow the project format `{ success, data, meta }` / `{ success, error }`.
 */

interface Ctx {
  req: Request;
  url: URL;
  params: string[];
  channel: StoreChannel;
  tenantId: string;
  customerId: number | null;
  token: string | null;
  clientIp: string;
}

type Handler = (ctx: Ctx) => Promise<unknown>;

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const STATUS: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function fail(status: number, code: string, message: string, details?: unknown) {
  return json(status, {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}

async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "Body phải là JSON");
  }
  return schema.parse(raw);
}

const query = <T>(url: URL, schema: ZodType<T>) =>
  schema.parse(Object.fromEntries(url.searchParams));

function needCustomer(ctx: Ctx): number {
  if (!ctx.customerId) throw new ApiError(401, "UNAUTHORIZED", "Vui lòng đăng nhập");
  return ctx.customerId;
}

async function limit(key: string, max: number, windowSec: number) {
  const r = await rateLimit(key, max, windowSec);
  if (!r.allowed)
    throw new ApiError(429, "RATE_LIMITED", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
}

const authLimit = (ctx: Ctx) => limit(`rl:store:auth:${ctx.tenantId}:${ctx.clientIp}`, 10, 60);

async function orderIdOf(ctx: Ctx): Promise<number> {
  const code = ctx.params[1];
  if (!code || !/^[A-Z0-9-]{6,50}$/.test(code))
    throw new ApiError(404, "NOT_FOUND", "Không tìm thấy đơn hàng");
  const { phone } = query(ctx.url, orderLookupSchema);
  if (!ctx.customerId) await limit(`rl:store:lookup:${ctx.tenantId}:${ctx.clientIp}`, 30, 60);
  return findStoreOrder(code, { customerId: ctx.customerId, phone });
}

const ROUTES: { method: "GET" | "POST"; path: RegExp; handler: Handler }[] = [
  { method: "GET", path: /^store$/, handler: (c) => storeInfo(c.channel) },
  { method: "GET", path: /^categories$/, handler: () => storeCategories() },
  {
    method: "GET",
    path: /^products$/,
    handler: (c) => storeProducts(c.channel, query(c.url, productListSchema)),
  },
  {
    method: "GET",
    path: /^products\/[^/]+$/,
    handler: (c) => {
      const id = productIdFromSlug(c.params[1]);
      if (!id) throw new ApiError(404, "NOT_FOUND", "Sản phẩm không tồn tại");
      return storeProduct(c.channel, id);
    },
  },
  {
    method: "POST",
    path: /^cart\/quote$/,
    handler: async (c) => {
      const input = await body(c.req, quoteSchema);
      return (await storeQuote(c.channel, { ...input, customerId: c.customerId })).view;
    },
  },
  {
    method: "POST",
    path: /^auth\/register\/start$/,
    handler: async (c) => {
      await authLimit(c);
      const { phone } = await body(c.req, registerStartSchema);
      return startRegistration(phone, c.channel.config.storeName);
    },
  },
  {
    method: "POST",
    path: /^auth\/register\/verify$/,
    handler: async (c) => {
      await authLimit(c);
      return completeRegistration(await body(c.req, registerVerifySchema));
    },
  },
  {
    method: "POST",
    path: /^auth\/login$/,
    handler: async (c) => {
      await authLimit(c);
      const { phone, password } = await body(c.req, loginSchema);
      return login(phone, password);
    },
  },
  {
    method: "POST",
    path: /^auth\/logout$/,
    handler: async (c) => {
      if (c.token) await logout(c.token);
      return { loggedOut: true };
    },
  },
  { method: "GET", path: /^me$/, handler: (c) => customerProfile(needCustomer(c)) },
  {
    method: "GET",
    path: /^me\/points$/,
    handler: (c) => {
      const { page, limit } = query(c.url, pageSchema);
      return pointHistory(needCustomer(c), page, limit);
    },
  },
  {
    method: "GET",
    path: /^orders$/,
    handler: (c) => {
      const { page, limit } = query(c.url, pageSchema);
      return listStoreOrders(needCustomer(c), page, limit);
    },
  },
  {
    method: "POST",
    path: /^orders$/,
    handler: async (c) => {
      const key = c.req.headers.get("idempotency-key")?.trim();
      if (!key || !/^[A-Za-z0-9_-]{8,100}$/.test(key))
        throw new ApiError(400, "VALIDATION_ERROR", "Thiếu header Idempotency-Key (8–100 ký tự)");
      await limit(`rl:store:order:${c.tenantId}:${c.clientIp}`, 20, 600);
      const input = await body(c.req, createOrderSchema);
      return createStoreOrder(c.channel, input, { customerId: c.customerId, idempotencyKey: key });
    },
  },
  {
    method: "GET",
    path: /^orders\/[^/]+$/,
    handler: async (c) => getStoreOrder(await orderIdOf(c)),
  },
  {
    method: "POST",
    path: /^orders\/[^/]+\/pay$/,
    handler: async (c) => {
      const id = await orderIdOf(c);
      const { returnUrl } = await body(c.req, payOrderSchema);
      if (!isStorefrontUrl(returnUrl, c.channel.config.storefrontUrl))
        throw new ApiError(400, "VALIDATION_ERROR", "returnUrl phải thuộc website của cửa hàng");
      return startPayment(id, returnUrl);
    },
  },
  {
    method: "POST",
    path: /^orders\/[^/]+\/cancel$/,
    handler: async (c) => {
      const id = await orderIdOf(c);
      const { reason } = await body(c.req, cancelOrderSchema);
      return cancelStoreOrder(id, reason ?? null);
    },
  },
];

function toFailure(err: unknown): Response {
  if (err instanceof ApiError) return fail(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return fail(400, "VALIDATION_ERROR", `${where}${issue?.message ?? "Dữ liệu không hợp lệ"}`, {
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof TRPCError) {
    try {
      const e = JSON.parse(err.message) as { code: string; message: string; details?: unknown };
      return fail(STATUS[e.code] ?? 500, e.code, e.message, e.details);
    } catch {
      /* not a bizoneError */
    }
  }
  console.error("[store-api]", err);
  return fail(500, "INTERNAL_ERROR", "Lỗi hệ thống, vui lòng thử lại");
}

/** Entry point of `app/api/store/v1/[...path]/route.ts` */
export async function handleStoreRequest(req: Request, segments: string[]): Promise<Response> {
  const key = req.headers.get("x-store-key");
  const parsed = parseStoreKey(key);
  if (!key || !parsed || !isKnownTenant(parsed.tenantId))
    return fail(401, "UNAUTHORIZED", "Store key không hợp lệ");
  const path = segments.join("/");
  const route = ROUTES.find((r) => r.method === req.method && r.path.test(path));
  if (!route) return fail(404, "NOT_FOUND", `Không có API ${req.method} /${path}`);

  return runWithTenant(parsed.tenantId, async () => {
    try {
      const found = await channelForKey(key);
      if ("error" in found) {
        if (found.error === "UNAUTHORIZED")
          return fail(401, "UNAUTHORIZED", "Store key không hợp lệ");
        return fail(503, "SERVICE_UNAVAILABLE", "Website tạm ngừng bán hàng");
      }
      const clientIp = (req.headers.get("x-client-ip") ?? "").slice(0, 64) || "unknown";
      await limit(`rl:store:${parsed.tenantId}:${found.channel.id}`, 1200, 60);
      const token = req.headers.get("x-customer-token");
      const ctx: Ctx = {
        req,
        url: new URL(req.url),
        params: segments,
        channel: found.channel,
        tenantId: parsed.tenantId,
        token,
        customerId: await customerOfToken(token),
        clientIp,
      };
      const data = await route.handler(ctx);
      const status = req.method === "POST" && path === "orders" ? 201 : 200;
      return json(status, { success: true, data });
    } catch (err) {
      return toFailure(err);
    }
  });
}
