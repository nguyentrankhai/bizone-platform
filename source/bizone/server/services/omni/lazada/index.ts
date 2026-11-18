import { callJson, chunk, money } from "../marketplace/http";
import {
  MarketplaceError,
  type ListingInput,
  type ListingResult,
  type ListingUpdate,
  type MarketCategory,
  type MarketOrder,
  type MarketplaceConnector,
  type PushEvent,
  type ShopTokens,
} from "../marketplace/types";
import { lazadaDate, lazadaIso, lazadaSign, lazadaVerifyPush, xml } from "./signing";

/**
 * Lazada Open Platform connector (P6.2) — Vietnam gateway.
 *
 * Env: LAZADA_APP_KEY, LAZADA_APP_SECRET, LAZADA_API_URL (default https://api.lazada.vn/rest),
 * LAZADA_AUTH_URL (default https://auth.lazada.com — authorize page + token APIs under /rest).
 *
 * Responses are `{ code: "0", data, request_id }`; any other code is a failure. Order items come
 * one row per unit (grouped back into lines here). The shop is the seller_id of the VN account.
 */

function env() {
  return {
    appKey: process.env.LAZADA_APP_KEY ?? "",
    appSecret: process.env.LAZADA_APP_SECRET ?? "",
    api: (process.env.LAZADA_API_URL || "https://api.lazada.vn/rest").replace(/\/+$/, ""),
    auth: (process.env.LAZADA_AUTH_URL || "https://auth.lazada.com").replace(/\/+$/, ""),
  };
}

type LzBody = {
  code?: string;
  message?: string;
  data?: unknown;
  detail?: unknown;
  [k: string]: unknown;
};

function failure(label: string, b: LzBody): MarketplaceError {
  const code = String(b.code ?? "");
  const msg = `${label}: ${b.message || code}`;
  if (/token|auth|AccessDenied|InvalidSession/i.test(code))
    return new MarketplaceError("auth", msg, code);
  if (/limit|throttl|frequen/i.test(code)) return new MarketplaceError("rate_limit", msg, code);
  if (/param|invalid|missing|illegal|notfound|not_found|category|sku/i.test(code))
    return new MarketplaceError("invalid", msg, code);
  return new MarketplaceError("api", msg, code);
}

async function request(
  label: string,
  method: "GET" | "POST",
  path: string,
  opts: {
    token?: string;
    params?: Record<string, string | number>;
    file?: { field: string; data: Buffer; filename: string; contentType: string };
    base?: "api" | "auth";
    raw?: boolean;
  },
): Promise<LzBody> {
  const e = env();
  const params: Record<string, string> = {
    app_key: e.appKey,
    timestamp: String(Date.now()),
    sign_method: "sha256",
  };
  if (opts.token) params.access_token = opts.token;
  for (const [k, v] of Object.entries(opts.params ?? {})) params[k] = String(v);
  params.sign = lazadaSign(e.appSecret, path, params);
  const root = opts.base === "auth" ? `${e.auth}/rest` : e.api;
  let url = `${root}${path}`;
  let body: BodyInit | undefined;
  if (method === "GET") url += `?${new URLSearchParams(params)}`;
  else if (opts.file) {
    url += `?${new URLSearchParams(params)}`;
    const form = new FormData();
    form.append(
      opts.file.field,
      new Blob([new Uint8Array(opts.file.data)], { type: opts.file.contentType }),
      opts.file.filename,
    );
    body = form;
  } else body = new URLSearchParams(params);
  const { body: res } = await callJson(url, {
    label,
    method,
    body,
    headers:
      method === "POST" && !opts.file
        ? { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }
        : undefined,
  });
  const b = (res ?? {}) as LzBody;
  if (!opts.raw && String(b.code ?? "0") !== "0") throw failure(label, b);
  return b;
}

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function tokensFrom(b: LzBody): ShopTokens {
  const access = s(b.access_token);
  const refresh = s(b.refresh_token);
  if (!access || !refresh) throw new MarketplaceError("auth", "Lazada không trả access token");
  const info =
    ((b.country_user_info as Record<string, unknown>[] | undefined) ?? []).find(
      (c) => s(c.country).toLowerCase() === "vn",
    ) ?? ((b.country_user_info as Record<string, unknown>[] | undefined) ?? [])[0];
  const sellerId = s(info?.seller_id);
  if (!sellerId) throw new MarketplaceError("auth", "Tài khoản Lazada không có shop tại Việt Nam");
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: new Date(Date.now() + Number(b.expires_in ?? 604_800) * 1000),
    refreshExpiresAt: b.refresh_expires_in
      ? new Date(Date.now() + Number(b.refresh_expires_in) * 1000)
      : null,
    shopId: sellerId,
    shopName: s(b.account) || s(info?.short_code) || null,
  };
}

function flattenCategories(
  nodes: Record<string, unknown>[],
  parentId: string | null,
  out: MarketCategory[],
) {
  for (const n of nodes) {
    const id = s(n.category_id);
    const children = (n.children as Record<string, unknown>[] | undefined) ?? [];
    out.push({ id, name: s(n.name), parentId, leaf: n.leaf === true || children.length === 0 });
    flattenCategories(children, id, out);
  }
  return out;
}

function toOrder(o: Record<string, unknown>, items: Record<string, unknown>[]): MarketOrder {
  // One row per unit → lines by sku
  const lines = new Map<string, MarketOrder["lines"][number]>();
  const live = items.filter((i) => !/^cancel/i.test(s(i.status)));
  for (const i of live.length ? live : items) {
    const key = s(i.sku_id) || s(i.sku);
    const prev = lines.get(key);
    const price = money(i.paid_price) || money(i.item_price);
    if (prev) {
      prev.unitPrice = (prev.unitPrice * prev.quantity + price) / (prev.quantity + 1);
      prev.quantity += 1;
    } else
      lines.set(key, {
        itemId: s(i.product_id),
        modelId: s(i.sku_id) || null,
        sku: s(i.sku),
        name: s(i.variation) ? `${s(i.name)} — ${s(i.variation)}` : s(i.name),
        quantity: 1,
        unitPrice: price,
      });
  }
  const list = [...lines.values()].map((l) => ({ ...l, unitPrice: Math.round(l.unitPrice) }));
  const shippingFee = money(o.shipping_fee);
  const statuses = ((o.statuses as unknown[] | undefined) ?? items.map((i) => i.status)).map(s);
  const addr = (o.address_shipping as Record<string, unknown> | undefined) ?? {};
  const addressParts = [addr.address1, addr.address5, addr.address4, addr.address3, addr.city]
    .map(s)
    .filter(Boolean);
  const first = items[0] ?? {};
  return {
    orderId: s(o.order_id),
    rawStatus: [...new Set(statuses)].join(","),
    statuses,
    createdAt: lazadaDate(o.created_at),
    updatedAt: lazadaDate(o.updated_at ?? o.created_at),
    isCod: /cod|cash/i.test(s(o.payment_method)),
    paymentMethod: s(o.payment_method) || null,
    buyerName:
      [s(addr.first_name), s(addr.last_name)].filter(Boolean).join(" ") ||
      s(o.customer_first_name) ||
      null,
    phone: s(addr.phone) || null,
    address: addressParts.join(", ") || null,
    shippingFee,
    total: list.reduce((t, l) => t + l.unitPrice * l.quantity, 0) + shippingFee,
    carrier: s(first.shipment_provider) || null,
    trackingCode: s(first.tracking_code) || null,
    note: s(o.remarks) || null,
    lines: list,
  };
}

export const lazadaConnector: MarketplaceConnector = {
  code: "lazada",
  name: "Lazada",

  configured() {
    const e = env();
    return e.appKey.length >= 4 && e.appSecret.length >= 8;
  },

  authorizeUrl(callbackUrl, state) {
    const e = env();
    const qs = new URLSearchParams({
      response_type: "code",
      force_auth: "true",
      redirect_uri: callbackUrl,
      client_id: e.appKey,
      state,
    });
    return `${e.auth}/oauth/authorize?${qs}`;
  },

  async exchangeCode(query) {
    const code = query.get("code");
    if (!code) throw new MarketplaceError("invalid", "Lazada không trả mã uỷ quyền");
    const b = await request("Lấy token Lazada", "POST", "/auth/token/create", {
      base: "auth",
      params: { code },
    });
    return tokensFrom(b);
  },

  async refresh(current) {
    const b = await request("Làm mới token Lazada", "POST", "/auth/token/refresh", {
      base: "auth",
      params: { refresh_token: current.refreshToken },
    });
    return tokensFrom(b);
  },

  async categories(ctx) {
    const b = await request("Danh mục Lazada", "GET", "/category/tree/get", {
      token: ctx.accessToken,
      params: { language_code: "vi_VN" },
    });
    return flattenCategories((b.data as Record<string, unknown>[] | undefined) ?? [], null, []);
  },

  async createListing(ctx, input: ListingInput): Promise<ListingResult> {
    const urls: string[] = [];
    for (const img of input.images) {
      const up = await request("Tải ảnh lên Lazada", "POST", "/image/upload", {
        token: ctx.accessToken,
        file: { field: "image", ...img },
      });
      const url = s(
        (
          (up.data as Record<string, unknown> | undefined)?.image as
            Record<string, unknown> | undefined
        )?.url,
      );
      if (!url) throw new MarketplaceError("api", "Lazada không trả URL ảnh");
      urls.push(url);
    }
    const pkg = {
      package_length: input.packageCm.length,
      package_width: input.packageCm.width,
      package_height: input.packageCm.height,
      package_weight: input.weightKg,
    };
    const skus = input.variants.length
      ? input.variants.map((v) => ({
          SellerSku: v.sku,
          quantity: v.stock,
          price: v.price,
          saleProp: { "Phân loại": v.name },
          ...pkg,
        }))
      : [{ SellerSku: input.sku, quantity: input.stock, price: input.price, ...pkg }];
    const payload = {
      Request: {
        Product: {
          PrimaryCategory: input.categoryId,
          Images: { Image: urls },
          Attributes: { name: input.name, description: input.description, brand: "No Brand" },
          ...(input.variants.length
            ? {
                variation: {
                  Variation1: {
                    name: "Phân loại",
                    hasImage: false,
                    customize: true,
                    options: { option: input.variants.map((v) => v.name) },
                  },
                },
              }
            : {}),
          Skus: { Sku: skus },
        },
      },
    };
    const b = await request("Đăng sản phẩm Lazada", "POST", "/product/create", {
      token: ctx.accessToken,
      params: { payload: JSON.stringify(payload) },
    });
    const data = (b.data as Record<string, unknown> | undefined) ?? {};
    const itemId = s(data.item_id);
    if (!itemId) throw new MarketplaceError("api", "Lazada không trả item_id");
    const skuList = (data.sku_list as Record<string, unknown>[] | undefined) ?? [];
    const sellerSkus = input.variants.length ? input.variants.map((v) => v.sku) : [input.sku];
    return {
      itemId,
      models: sellerSkus.map((sku) => {
        const m = skuList.find((x) => s(x.seller_sku) === sku);
        return { sku, modelId: m ? s(m.sku_id) : null };
      }),
    };
  },

  async updateListings(ctx, updates: ListingUpdate[]) {
    const out: { sku: string; ok: boolean; error?: string }[] = [];
    for (const group of chunk(updates, 50)) {
      const body =
        `<?xml version="1.0" encoding="UTF-8" ?><Request><Product><Skus>` +
        group
          .map(
            (u) =>
              `<Sku><ItemId>${xml(u.itemId)}</ItemId>` +
              (u.modelId ? `<SkuId>${xml(u.modelId)}</SkuId>` : "") +
              `<SellerSku>${xml(u.sku)}</SellerSku>` +
              (u.price !== undefined ? `<Price>${xml(u.price)}</Price>` : "") +
              (u.stock !== undefined ? `<Quantity>${xml(u.stock)}</Quantity>` : "") +
              `</Sku>`,
          )
          .join("") +
        `</Skus></Product></Request>`;
      const b = await request(
        "Cập nhật giá / tồn Lazada",
        "POST",
        "/product/price_quantity/update",
        {
          token: ctx.accessToken,
          params: { payload: body },
          raw: true,
        },
      );
      const code = s(b.code ?? "0");
      if (code === "0") {
        for (const u of group) out.push({ sku: u.sku, ok: true });
        continue;
      }
      const err = failure("Cập nhật giá / tồn Lazada", b);
      if (err.kind === "auth" || err.retryable) throw err;
      const detail = new Map(
        ((b.detail as Record<string, unknown>[] | undefined) ?? []).map((d) => [
          s(d.seller_sku),
          s(d.message),
        ]),
      );
      for (const u of group) {
        const reason = detail.size ? detail.get(u.sku) : err.message;
        out.push(reason ? { sku: u.sku, ok: false, error: reason } : { sku: u.sku, ok: true });
      }
    }
    return out;
  },

  async listOrderIds(ctx, from, to) {
    const ids: string[] = [];
    for (let offset = 0; offset < 20_000; offset += 100) {
      const b = await request("Danh sách đơn Lazada", "GET", "/orders/get", {
        token: ctx.accessToken,
        params: {
          update_after: lazadaIso(from),
          update_before: lazadaIso(to),
          sort_by: "updated_at",
          sort_direction: "ASC",
          offset,
          limit: 100,
        },
      });
      const data = (b.data as Record<string, unknown> | undefined) ?? {};
      const orders = (data.orders as Record<string, unknown>[] | undefined) ?? [];
      for (const o of orders) ids.push(s(o.order_id));
      if (orders.length < 100) break;
    }
    return [...new Set(ids.filter(Boolean))];
  },

  async getOrders(ctx, ids) {
    const out: MarketOrder[] = [];
    for (const id of ids) {
      const o = await request("Chi tiết đơn Lazada", "GET", "/order/get", {
        token: ctx.accessToken,
        params: { order_id: id },
      });
      const items = await request("Sản phẩm đơn Lazada", "GET", "/order/items/get", {
        token: ctx.accessToken,
        params: { order_id: id },
      });
      out.push(
        toOrder(
          (o.data as Record<string, unknown> | undefined) ?? {},
          (items.data as Record<string, unknown>[] | undefined) ?? [],
        ),
      );
    }
    return out;
  },

  verifyPush(headers, rawBody) {
    const e = env();
    return lazadaVerifyPush(e.appKey, e.appSecret, rawBody, headers.get("authorization"));
  },

  parsePush(body): PushEvent | null {
    const b = (body ?? {}) as Record<string, unknown>;
    const shopId = s(b.seller_id);
    if (!shopId) return null;
    const data = (b.data as Record<string, unknown> | undefined) ?? {};
    // message_type 0 = trade order status change
    if (Number(b.message_type) === 0) {
      const id = s(data.trade_order_id ?? data.order_id);
      return { shopId, kind: "order", orderIds: id ? [id] : [] };
    }
    return { shopId, kind: "other", orderIds: [] };
  },
};
