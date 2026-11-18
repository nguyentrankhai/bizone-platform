import { callJson, chunk, money } from "../marketplace/http";
import {
  MarketplaceError,
  type ListingInput,
  type ListingResult,
  type ListingUpdate,
  type MarketCategory,
  type MarketOrder,
  type MarketOrderLine,
  type MarketplaceConnector,
  type PushEvent,
  type ShopContext,
  type ShopTokens,
} from "../marketplace/types";
import { tiktokSign, tiktokVerifyPush } from "./signing";

/**
 * TikTok Shop Partner API connector (P6.3) — API version 202309, Vietnam shops.
 *
 * Env: TIKTOK_APP_KEY, TIKTOK_APP_SECRET, TIKTOK_SERVICE_ID (the app's service id — the
 * authorize link), TIKTOK_API_URL (default https://open-api.tiktokglobalshop.com),
 * TIKTOK_AUTH_API_URL (token APIs, default https://auth.tiktok-shops.com), TIKTOK_AUTHORIZE_URL
 * (default https://services.tiktokshop.com/open/authorize). The redirect URL is the one
 * registered on the Partner Center ({APP_URL}/api/omni/oauth/tiktok/callback).
 *
 * Responses are `{ code: 0, message, request_id, data }`; any other code is a failure. Shop
 * calls carry `shop_cipher` (kept in `channel_connections.shop_ref`) and the access token in the
 * `x-tts-access-token` header. Every listing has SKU ids (even without variations); stock is
 * per warehouse (the shop's default sales warehouse). Order line items come one per unit.
 */

const VERSION = "202309";
const CURRENCY = "VND";

function env() {
  return {
    appKey: process.env.TIKTOK_APP_KEY ?? "",
    appSecret: process.env.TIKTOK_APP_SECRET ?? "",
    serviceId: process.env.TIKTOK_SERVICE_ID ?? "",
    api: (process.env.TIKTOK_API_URL || "https://open-api.tiktokglobalshop.com").replace(
      /\/+$/,
      "",
    ),
    authApi: (process.env.TIKTOK_AUTH_API_URL || "https://auth.tiktok-shops.com").replace(
      /\/+$/,
      "",
    ),
    authorize: (
      process.env.TIKTOK_AUTHORIZE_URL || "https://services.tiktokshop.com/open/authorize"
    ).replace(/\/+$/, ""),
  };
}

const nowSec = () => Math.floor(Date.now() / 1000);
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

type TtBody = {
  code?: number | string;
  message?: string;
  request_id?: string;
  data?: Record<string, unknown>;
  [k: string]: unknown;
};

function failure(label: string, b: TtBody, httpStatus: number): MarketplaceError {
  const code = s(b.code);
  const msg = `${label}: ${b.message || code || `HTTP ${httpStatus}`}`;
  // 105xxx = access token invalid / expired / revoked; 401/403 from the gateway
  if (
    /^105\d{3}$/.test(code) ||
    httpStatus === 401 ||
    /token|unauthori[sz]ed/i.test(b.message ?? "")
  )
    return new MarketplaceError("auth", msg, code);
  if (/too many|rate limit|frequen/i.test(b.message ?? "") || code === "36009004")
    return new MarketplaceError("rate_limit", msg, code);
  if (httpStatus === 400 || /invalid|param|required|not exist|not found/i.test(b.message ?? ""))
    return new MarketplaceError("invalid", msg, code);
  return new MarketplaceError("api", msg, code);
}

async function request(
  label: string,
  method: "GET" | "POST",
  path: string,
  opts: {
    shop?: ShopContext;
    /** Calls before a shop is picked (shop list) still need the token */
    token?: string;
    query?: Record<string, string | number>;
    body?: unknown;
    form?: FormData;
  },
): Promise<TtBody> {
  const e = env();
  const query: Record<string, string> = { app_key: e.appKey, timestamp: String(nowSec()) };
  if (opts.shop?.shopRef) query.shop_cipher = opts.shop.shopRef;
  for (const [k, v] of Object.entries(opts.query ?? {})) query[k] = String(v);
  const json = opts.form || opts.body === undefined ? null : JSON.stringify(opts.body);
  query.sign = tiktokSign(e.appSecret, path, query, json);
  const token = opts.shop?.accessToken ?? opts.token;
  const headers: Record<string, string> = {};
  if (token) headers["x-tts-access-token"] = token;
  if (!opts.form) headers["Content-Type"] = "application/json";
  const { status, body } = await callJson(`${e.api}${path}?${new URLSearchParams(query)}`, {
    label,
    method,
    headers,
    body: opts.form ?? json ?? undefined,
  });
  const b = (body ?? {}) as TtBody;
  if (Number(b.code ?? -1) !== 0 || status >= 400) throw failure(label, b, status);
  return b;
}

/** Token APIs (auth host, app_secret in the query — no signature) */
async function tokenCall(label: string, path: string, params: Record<string, string>) {
  const e = env();
  const qs = new URLSearchParams({ app_key: e.appKey, app_secret: e.appSecret, ...params });
  const { status, body } = await callJson(`${e.authApi}${path}?${qs}`, { label, method: "GET" });
  const b = (body ?? {}) as TtBody;
  if (Number(b.code ?? -1) !== 0) {
    const err = failure(label, b, status);
    // A rejected auth code / refresh token means "authorize again"
    throw err.kind === "invalid" || err.kind === "api"
      ? new MarketplaceError("auth", err.message, err.platformCode)
      : err;
  }
  return b.data ?? {};
}

function tokensFrom(d: Record<string, unknown>): Omit<ShopTokens, "shopId" | "shopName"> {
  const access = s(d.access_token);
  const refresh = s(d.refresh_token);
  if (!access || !refresh) throw new MarketplaceError("auth", "TikTok Shop không trả access token");
  // *_expire_in are unix timestamps (seconds)
  const at = Number(d.access_token_expire_in ?? 0);
  const rt = Number(d.refresh_token_expire_in ?? 0);
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: new Date(at > 1e9 ? at * 1000 : Date.now() + 7 * 86_400_000),
    refreshExpiresAt: rt > 1e9 ? new Date(rt * 1000) : null,
  };
}

/** Default sales warehouse of the shop (stock is set per warehouse) */
async function salesWarehouse(ctx: ShopContext): Promise<string> {
  const b = await request("Kho TikTok Shop", "GET", `/logistics/${VERSION}/warehouses`, {
    shop: ctx,
  });
  const list = ((b.data?.warehouses as Record<string, unknown>[] | undefined) ?? []).filter(
    (w) =>
      s(w.type || "SALES_WAREHOUSE") === "SALES_WAREHOUSE" &&
      s(w.effect_status || "ENABLED") === "ENABLED",
  );
  const wh = list.find((w) => w.is_default === true) ?? list[0];
  if (!wh) throw new MarketplaceError("invalid", "Shop TikTok chưa có kho bán hàng đang hoạt động");
  return s(wh.id);
}

const price = (amount: number) => ({ amount: String(Math.round(amount)), currency: CURRENCY });

function toOrder(o: Record<string, unknown>): MarketOrder {
  const pay = (o.payment as Record<string, unknown> | undefined) ?? {};
  const addr = (o.recipient_address as Record<string, unknown> | undefined) ?? {};
  // One line item per unit → group by SKU (cancelled units dropped)
  const grouped = new Map<string, MarketOrderLine>();
  for (const li of (o.line_items as Record<string, unknown>[] | undefined) ?? []) {
    if (/cancel/i.test(s(li.display_status))) continue;
    const skuId = s(li.sku_id);
    const key = skuId || s(li.seller_sku) || s(li.id);
    const prev = grouped.get(key);
    if (prev) {
      prev.quantity += Number(li.quantity ?? 1) || 1;
      continue;
    }
    const skuName = s(li.sku_name);
    grouped.set(key, {
      itemId: s(li.product_id),
      modelId: skuId || null,
      sku: s(li.seller_sku),
      name:
        skuName && skuName !== "Default"
          ? `${s(li.product_name)} — ${skuName}`
          : s(li.product_name),
      quantity: Number(li.quantity ?? 1) || 1,
      unitPrice: money(li.sale_price) || money(li.original_price),
    });
  }
  const status = s(o.status).toUpperCase();
  const lines = [...grouped.values()];
  const goods = lines.reduce((t, l) => t + l.unitPrice * l.quantity, 0);
  const total = money(pay.total_amount);
  const shipping = money(pay.shipping_fee);
  return {
    orderId: s(o.id),
    rawStatus: status,
    statuses: [status],
    createdAt: new Date(Number(o.create_time ?? nowSec()) * 1000),
    updatedAt: new Date(Number(o.update_time ?? o.create_time ?? nowSec()) * 1000),
    isCod: o.is_cod === true,
    paymentMethod: s(o.payment_method_name) || null,
    buyerName: s(addr.name) || null,
    phone: s(addr.phone_number) || null,
    address: s(addr.full_address) || null,
    shippingFee: shipping || Math.max(0, Math.round(total - goods)),
    total,
    carrier: s(o.shipping_provider) || null,
    trackingCode: s(o.tracking_number) || null,
    note: s(o.buyer_message) || null,
    lines,
  };
}

export const tiktokConnector: MarketplaceConnector = {
  code: "tiktok",
  name: "TikTok Shop",

  configured() {
    const e = env();
    return e.appKey.length >= 6 && e.appSecret.length >= 8 && e.serviceId.length > 0;
  },

  authorizeUrl(_callbackUrl, state) {
    // Redirect URL is fixed on the Partner Center; `state` comes back with the code
    const e = env();
    const qs = new URLSearchParams({ service_id: e.serviceId, state });
    return `${e.authorize}?${qs}`;
  },

  async exchangeCode(query) {
    const code = query.get("code");
    if (!code) throw new MarketplaceError("invalid", "TikTok Shop không trả mã uỷ quyền (code)");
    const d = await tokenCall("Lấy token TikTok Shop", "/api/v2/token/get", {
      auth_code: code,
      grant_type: "authorized_code",
    });
    const tokens = tokensFrom(d);
    // The authorized shop + its cipher (one shop per seller in Vietnam)
    const shops = await request(
      "Shop đã uỷ quyền TikTok",
      "GET",
      `/authorization/${VERSION}/shops`,
      { token: tokens.accessToken },
    );
    const list = (shops.data?.shops as Record<string, unknown>[] | undefined) ?? [];
    const region = query.get("shop_region")?.toUpperCase();
    const shop = list.find((x) => region && s(x.region).toUpperCase() === region) ?? list[0];
    if (!shop || !s(shop.id) || !s(shop.cipher))
      throw new MarketplaceError(
        "invalid",
        "Tài khoản TikTok chưa có shop nào uỷ quyền cho BizOne",
      );
    return {
      ...tokens,
      shopId: s(shop.id),
      shopName: s(shop.name) || s(d.seller_name) || null,
      shopRef: s(shop.cipher),
    };
  },

  async refresh(current) {
    const d = await tokenCall("Làm mới token TikTok Shop", "/api/v2/token/refresh", {
      refresh_token: current.refreshToken,
      grant_type: "refresh_token",
    });
    return { ...tokensFrom(d), shopId: current.shopId, shopName: null };
  },

  async categories(ctx) {
    const b = await request("Danh mục TikTok Shop", "GET", `/product/${VERSION}/categories`, {
      shop: ctx,
      query: { locale: "vi-VN" },
    });
    const list = (b.data?.categories as Record<string, unknown>[] | undefined) ?? [];
    return list.map((c): MarketCategory => ({
      id: s(c.id),
      name: s(c.local_name),
      parentId: c.parent_id && s(c.parent_id) !== "0" ? s(c.parent_id) : null,
      leaf: c.is_leaf === true,
    }));
  },

  async createListing(ctx, input: ListingInput): Promise<ListingResult> {
    const uris: string[] = [];
    for (const img of input.images) {
      const form = new FormData();
      form.append(
        "data",
        new Blob([new Uint8Array(img.data)], { type: img.contentType }),
        img.filename,
      );
      form.append("use_case", "MAIN_IMAGE");
      const up = await request(
        "Tải ảnh lên TikTok Shop",
        "POST",
        `/product/${VERSION}/images/upload`,
        {
          shop: ctx,
          form,
        },
      );
      const uri = s(up.data?.uri);
      if (!uri) throw new MarketplaceError("api", "TikTok Shop không trả uri ảnh");
      uris.push(uri);
    }
    const warehouseId = await salesWarehouse(ctx);
    const variants =
      input.variants.length > 0
        ? input.variants
        : [{ sku: input.sku, name: "", price: input.price, stock: input.stock }];
    const created = await request(
      "Đăng sản phẩm TikTok Shop",
      "POST",
      `/product/${VERSION}/products`,
      {
        shop: ctx,
        body: {
          title: input.name,
          description: `<p>${input.description.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</p>`,
          category_id: input.categoryId,
          main_images: uris.map((uri) => ({ uri })),
          package_weight: { value: String(input.weightKg), unit: "KILOGRAM" },
          package_dimensions: {
            length: String(input.packageCm.length),
            width: String(input.packageCm.width),
            height: String(input.packageCm.height),
            unit: "CENTIMETER",
          },
          skus: variants.map((v) => ({
            seller_sku: v.sku,
            price: price(v.price),
            inventory: [{ warehouse_id: warehouseId, quantity: v.stock }],
            ...(input.variants.length > 0
              ? { sales_attributes: [{ name: "Phân loại", value_name: v.name }] }
              : {}),
          })),
        },
      },
    );
    const productId = s(created.data?.product_id);
    if (!productId) throw new MarketplaceError("api", "TikTok Shop không trả product_id");
    const skus = (created.data?.skus as Record<string, unknown>[] | undefined) ?? [];
    const idOf = (sku: string, i: number) =>
      s((skus.find((x) => s(x.seller_sku) === sku) ?? skus[i])?.id) || null;
    if (input.variants.length === 0)
      return { itemId: productId, models: [{ sku: input.sku, modelId: idOf(input.sku, 0) }] };
    return {
      itemId: productId,
      models: input.variants.map((v, i) => ({ sku: v.sku, modelId: idOf(v.sku, i) })),
    };
  },

  async updateListings(ctx, updates: ListingUpdate[]) {
    const results = new Map<string, { sku: string; ok: boolean; error?: string }>();
    const mark = (u: ListingUpdate, error?: string) => {
      const prev = results.get(u.sku);
      if (!prev || prev.ok)
        results.set(u.sku, { sku: u.sku, ok: !error, ...(error ? { error } : {}) });
    };
    const missing = updates.filter((u) => !u.modelId);
    for (const u of missing) mark(u, "Thiếu SKU id TikTok — đăng lại sản phẩm");
    const byProduct = new Map<string, ListingUpdate[]>();
    for (const u of updates.filter((x) => x.modelId))
      byProduct.set(u.itemId, [...(byProduct.get(u.itemId) ?? []), u]);
    let warehouseId: string | null = null;
    for (const [productId, list] of byProduct) {
      const call = async (label: string, path: string, items: ListingUpdate[], body: unknown) => {
        try {
          await request(label, "POST", path, { shop: ctx, body });
          for (const u of items) mark(u);
        } catch (e) {
          if (e instanceof MarketplaceError && (e.kind === "auth" || e.retryable)) throw e;
          for (const u of items) mark(u, e instanceof Error ? e.message : String(e));
        }
      };
      const prices = list.filter((u) => u.price !== undefined);
      if (prices.length)
        await call(
          "Cập nhật giá TikTok Shop",
          `/product/${VERSION}/products/${productId}/prices/update`,
          prices,
          { skus: prices.map((u) => ({ id: u.modelId, price: price(u.price!) })) },
        );
      const stocks = list.filter((u) => u.stock !== undefined);
      if (stocks.length) {
        warehouseId ??= await salesWarehouse(ctx);
        await call(
          "Cập nhật tồn TikTok Shop",
          `/product/${VERSION}/products/${productId}/inventory/update`,
          stocks,
          {
            skus: stocks.map((u) => ({
              id: u.modelId,
              inventory: [{ warehouse_id: warehouseId, quantity: u.stock }],
            })),
          },
        );
      }
    }
    return [...results.values()];
  },

  async listOrderIds(ctx, from, to) {
    const ids: string[] = [];
    let pageToken = "";
    for (let page = 0; page < 200; page++) {
      const b = await request(
        "Danh sách đơn TikTok Shop",
        "POST",
        `/order/${VERSION}/orders/search`,
        {
          shop: ctx,
          query: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
          body: {
            update_time_ge: Math.floor(from.getTime() / 1000),
            update_time_lt: Math.ceil(to.getTime() / 1000),
          },
        },
      );
      for (const o of (b.data?.orders as Record<string, unknown>[] | undefined) ?? [])
        ids.push(s(o.id));
      pageToken = s(b.data?.next_page_token);
      if (!pageToken) break;
    }
    return [...new Set(ids.filter(Boolean))];
  },

  async getOrders(ctx, ids) {
    const out: MarketOrder[] = [];
    for (const group of chunk(ids, 50)) {
      const b = await request("Chi tiết đơn TikTok Shop", "GET", `/order/${VERSION}/orders`, {
        shop: ctx,
        query: { ids: group.join(",") },
      });
      for (const o of (b.data?.orders as Record<string, unknown>[] | undefined) ?? [])
        out.push(toOrder(o));
    }
    return out;
  },

  verifyPush(headers, rawBody) {
    const e = env();
    return tiktokVerifyPush(e.appKey, e.appSecret, rawBody, headers.get("authorization"));
  },

  parsePush(body): PushEvent | null {
    const b = (body ?? {}) as Record<string, unknown>;
    const shopId = s(b.shop_id);
    if (!shopId) return null;
    const type = Number(b.type);
    const data = (b.data as Record<string, unknown> | undefined) ?? {};
    // 1 order status, 2 return / refund, 3 address, 4 package; 6 seller deauthorization
    if (type >= 1 && type <= 4) {
      const id = s(data.order_id);
      return { shopId, kind: "order", orderIds: id ? [id] : [] };
    }
    if (type === 6) return { shopId, kind: "deauthorized", orderIds: [] };
    return { shopId, kind: "other", orderIds: [] };
  },
};
