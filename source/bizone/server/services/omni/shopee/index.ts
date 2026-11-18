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
  type ShopContext,
  type ShopTokens,
} from "../marketplace/types";
import { shopeePublicSign, shopeeShopSign, shopeeVerifyPush } from "./signing";

/**
 * Shopee Open Platform v2 connector (P6.2).
 *
 * Env: SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_API_URL (default: the test-stable sandbox
 * host), SHOPEE_PUSH_URL (the push URL registered on the Shopee console — part of the push
 * signature; default {APP_URL}/api/webhooks/shopee).
 *
 * Responses are `{ error, message, request_id, response }` — a non-empty `error` is a failure.
 * Access tokens last 4 h, refresh tokens 30 days and are single use (refresh under a lock).
 */

const SANDBOX = "https://partner.test-stable.shopeemobile.com";

function env() {
  return {
    partnerId: process.env.SHOPEE_PARTNER_ID ?? "",
    partnerKey: process.env.SHOPEE_PARTNER_KEY ?? "",
    host: (process.env.SHOPEE_API_URL || SANDBOX).replace(/\/+$/, ""),
    pushUrl:
      process.env.SHOPEE_PUSH_URL ||
      `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/api/webhooks/shopee`,
  };
}

const nowSec = () => Math.floor(Date.now() / 1000);

type ShopeeBody = {
  error?: string;
  message?: string;
  request_id?: string;
  response?: Record<string, unknown>;
  [k: string]: unknown;
};

function failure(label: string, b: ShopeeBody): MarketplaceError {
  const code = String(b.error ?? "");
  const msg = `${label}: ${b.message || code}`;
  if (/auth|token|permission|shop_not_auth/i.test(code))
    return new MarketplaceError("auth", msg, code);
  if (/too_many|rate|limit/i.test(code)) return new MarketplaceError("rate_limit", msg, code);
  if (/param|invalid|not_found|item|category|logistic|price|stock/i.test(code))
    return new MarketplaceError("invalid", msg, code);
  return new MarketplaceError("api", msg, code);
}

async function request(
  label: string,
  method: "GET" | "POST",
  path: string,
  opts: {
    shop?: ShopContext;
    query?: Record<string, string | number>;
    body?: unknown;
    form?: FormData;
  },
): Promise<ShopeeBody> {
  const e = env();
  const ts = nowSec();
  const sign = opts.shop
    ? shopeeShopSign(e.partnerId, e.partnerKey, path, ts, opts.shop.accessToken, opts.shop.shopId)
    : shopeePublicSign(e.partnerId, e.partnerKey, path, ts);
  const qs = new URLSearchParams({ partner_id: e.partnerId, timestamp: String(ts), sign });
  if (opts.shop) {
    qs.set("access_token", opts.shop.accessToken);
    qs.set("shop_id", opts.shop.shopId);
  }
  for (const [k, v] of Object.entries(opts.query ?? {})) qs.set(k, String(v));
  const { body } = await callJson(`${e.host}${path}?${qs}`, {
    label,
    method,
    headers: opts.form ? undefined : { "Content-Type": "application/json" },
    body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  const b = (body ?? {}) as ShopeeBody;
  if (b.error) throw failure(label, b);
  return b;
}

function tokensFrom(b: ShopeeBody, shopId: string, shopName: string | null): ShopTokens {
  const access = String(b.access_token ?? "");
  const refresh = String(b.refresh_token ?? "");
  if (!access || !refresh) throw new MarketplaceError("auth", "Shopee không trả access token");
  const expireIn = Number(b.expire_in ?? 14_400);
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: new Date(Date.now() + expireIn * 1000),
    refreshExpiresAt: new Date(Date.now() + 30 * 86_400_000),
    shopId,
    shopName,
  };
}

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function toOrder(o: Record<string, unknown>): MarketOrder {
  const items = (o.item_list as Record<string, unknown>[] | undefined) ?? [];
  const lines = items.map((i) => {
    const modelId = s(i.model_id);
    const modelName = s(i.model_name);
    return {
      itemId: s(i.item_id),
      modelId: modelId && modelId !== "0" ? modelId : null,
      sku: s(i.model_sku) || s(i.item_sku),
      name: modelName ? `${s(i.item_name)} — ${modelName}` : s(i.item_name),
      quantity: Number(i.model_quantity_purchased ?? 0),
      unitPrice: money(i.model_discounted_price) || money(i.model_original_price),
    };
  });
  const goods = lines.reduce((t, l) => t + l.unitPrice * l.quantity, 0);
  const total = money(o.total_amount);
  const addr = (o.recipient_address as Record<string, unknown> | undefined) ?? {};
  const status = s(o.order_status).toUpperCase();
  return {
    orderId: s(o.order_sn),
    rawStatus: status,
    statuses: [status],
    createdAt: new Date(Number(o.create_time ?? nowSec()) * 1000),
    updatedAt: new Date(Number(o.update_time ?? o.create_time ?? nowSec()) * 1000),
    isCod: o.cod === true,
    paymentMethod: s(o.payment_method) || null,
    buyerName: s(addr.name) || s(o.buyer_username) || null,
    phone: s(addr.phone) || null,
    address: s(addr.full_address) || null,
    // Buyer-paid shipping isn't itemized in get_order_detail: what the total adds over the goods
    shippingFee: Math.max(0, Math.round(total - goods)),
    total,
    carrier: s(o.shipping_carrier) || null,
    trackingCode: null,
    note: s(o.message_to_seller) || null,
    lines,
  };
}

export const shopeeConnector: MarketplaceConnector = {
  code: "shopee",
  name: "Shopee",

  configured() {
    const e = env();
    return /^\d+$/.test(e.partnerId) && e.partnerKey.length >= 8;
  },

  authorizeUrl(callbackUrl, state) {
    const e = env();
    const path = "/api/v2/shop/auth_partner";
    const ts = nowSec();
    const redirect = `${callbackUrl}${callbackUrl.includes("?") ? "&" : "?"}state=${encodeURIComponent(state)}`;
    const qs = new URLSearchParams({
      partner_id: e.partnerId,
      timestamp: String(ts),
      sign: shopeePublicSign(e.partnerId, e.partnerKey, path, ts),
      redirect,
    });
    return `${e.host}${path}?${qs}`;
  },

  async exchangeCode(query) {
    const code = query.get("code");
    const shopId = query.get("shop_id");
    if (!code || !shopId || !/^\d+$/.test(shopId))
      throw new MarketplaceError(
        "invalid",
        "Shopee không trả mã uỷ quyền / shop_id (chỉ hỗ trợ uỷ quyền shop)",
      );
    const e = env();
    const b = await request("Lấy token Shopee", "POST", "/api/v2/auth/token/get", {
      body: { code, shop_id: Number(shopId), partner_id: Number(e.partnerId) },
    });
    const tokens = tokensFrom(b, shopId, null);
    try {
      const info = await request("Thông tin shop", "GET", "/api/v2/shop/get_shop_info", {
        shop: { accessToken: tokens.accessToken, shopId },
      });
      tokens.shopName = s(info.shop_name ?? info.response?.shop_name) || null;
    } catch {
      // shop name is cosmetic
    }
    return tokens;
  },

  async refresh(current) {
    const e = env();
    const b = await request("Làm mới token Shopee", "POST", "/api/v2/auth/access_token/get", {
      body: {
        refresh_token: current.refreshToken,
        shop_id: Number(current.shopId),
        partner_id: Number(e.partnerId),
      },
    });
    return tokensFrom(b, current.shopId, null);
  },

  async categories(ctx) {
    const b = await request("Danh mục Shopee", "GET", "/api/v2/product/get_category", {
      shop: ctx,
      query: { language: "vi" },
    });
    const list = (b.response?.category_list as Record<string, unknown>[] | undefined) ?? [];
    return list.map((c): MarketCategory => ({
      id: s(c.category_id),
      name: s(c.display_category_name) || s(c.original_category_name),
      parentId: c.parent_category_id ? s(c.parent_category_id) : null,
      leaf: c.has_children !== true,
    }));
  },

  async createListing(ctx, input: ListingInput): Promise<ListingResult> {
    const imageIds: string[] = [];
    for (const img of input.images) {
      const form = new FormData();
      form.append(
        "image",
        new Blob([new Uint8Array(img.data)], { type: img.contentType }),
        img.filename,
      );
      const up = await request("Tải ảnh lên Shopee", "POST", "/api/v2/media_space/upload_image", {
        form,
      });
      const info = up.response?.image_info as Record<string, unknown> | undefined;
      const id = s(info?.image_id);
      if (!id) throw new MarketplaceError("api", "Shopee không trả image_id");
      imageIds.push(id);
    }
    const logistics = await request(
      "Đơn vị vận chuyển Shopee",
      "GET",
      "/api/v2/logistics/get_channel_list",
      {
        shop: ctx,
      },
    );
    const channels = (
      (logistics.response?.logistics_channel_list as Record<string, unknown>[]) ?? []
    ).filter((c) => c.enabled === true);
    if (channels.length === 0)
      throw new MarketplaceError("invalid", "Shop chưa bật đơn vị vận chuyển nào trên Shopee");

    const hasVariants = input.variants.length > 0;
    const added = await request("Đăng sản phẩm Shopee", "POST", "/api/v2/product/add_item", {
      shop: ctx,
      body: {
        item_name: input.name,
        description: input.description,
        item_sku: input.sku,
        category_id: Number(input.categoryId),
        original_price: hasVariants ? Math.min(...input.variants.map((v) => v.price)) : input.price,
        seller_stock: [{ stock: hasVariants ? 0 : input.stock }],
        weight: input.weightKg,
        dimension: {
          package_length: input.packageCm.length,
          package_width: input.packageCm.width,
          package_height: input.packageCm.height,
        },
        image: { image_id_list: imageIds },
        logistic_info: channels.map((c) => ({
          logistic_id: Number(c.logistics_channel_id),
          enabled: true,
        })),
        brand: { brand_id: 0, original_brand_name: "NoBrand" },
        condition: "NEW",
        item_status: "NORMAL",
      },
    });
    const itemId = s(added.response?.item_id);
    if (!itemId) throw new MarketplaceError("api", "Shopee không trả item_id");
    if (!hasVariants) return { itemId, models: [{ sku: input.sku, modelId: null }] };

    const tier = await request(
      "Tạo phân loại Shopee",
      "POST",
      "/api/v2/product/init_tier_variation",
      {
        shop: ctx,
        body: {
          item_id: Number(itemId),
          tier_variation: [
            { name: "Phân loại", option_list: input.variants.map((v) => ({ option: v.name })) },
          ],
          model: input.variants.map((v, i) => ({
            tier_index: [i],
            original_price: v.price,
            model_sku: v.sku,
            seller_stock: [{ stock: v.stock }],
          })),
        },
      },
    );
    const models = (tier.response?.model as Record<string, unknown>[] | undefined) ?? [];
    return {
      itemId,
      models: input.variants.map((v, i) => {
        const m =
          models.find((x) => s(x.model_sku) === v.sku) ??
          models.find((x) => Array.isArray(x.tier_index) && x.tier_index[0] === i);
        return { sku: v.sku, modelId: m ? s(m.model_id) : null };
      }),
    };
  },

  async updateListings(ctx, updates: ListingUpdate[]) {
    const results = new Map<string, { sku: string; ok: boolean; error?: string }>();
    const byItem = new Map<string, ListingUpdate[]>();
    for (const u of updates) byItem.set(u.itemId, [...(byItem.get(u.itemId) ?? []), u]);
    for (const [itemId, list] of byItem) {
      const mark = (u: ListingUpdate, error?: string) => {
        const prev = results.get(u.sku);
        if (!prev || prev.ok)
          results.set(u.sku, { sku: u.sku, ok: !error, ...(error ? { error } : {}) });
      };
      const failedModels = (b: ShopeeBody) =>
        new Map(
          ((b.response?.failure_list as Record<string, unknown>[] | undefined) ?? []).map((f) => [
            s(f.model_id) || "0",
            s(f.failed_reason) || "Shopee từ chối",
          ]),
        );
      const call = async (
        label: string,
        path: string,
        items: ListingUpdate[],
        body: Record<string, unknown>,
      ) => {
        try {
          const b = await request(label, "POST", path, {
            shop: ctx,
            body: { item_id: Number(itemId), ...body },
          });
          const failed = failedModels(b);
          for (const u of items) mark(u, failed.get(u.modelId ?? "0"));
        } catch (e) {
          if (e instanceof MarketplaceError && (e.kind === "auth" || e.retryable)) throw e;
          for (const u of items) mark(u, e instanceof Error ? e.message : String(e));
        }
      };
      const prices = list.filter((u) => u.price !== undefined);
      if (prices.length)
        await call("Cập nhật giá Shopee", "/api/v2/product/update_price", prices, {
          price_list: prices.map((u) => ({
            ...(u.modelId ? { model_id: Number(u.modelId) } : {}),
            original_price: u.price,
          })),
        });
      const stocks = list.filter((u) => u.stock !== undefined);
      if (stocks.length)
        await call("Cập nhật tồn Shopee", "/api/v2/product/update_stock", stocks, {
          stock_list: stocks.map((u) => ({
            ...(u.modelId ? { model_id: Number(u.modelId) } : {}),
            seller_stock: [{ stock: u.stock }],
          })),
        });
    }
    return [...results.values()];
  },

  async listOrderIds(ctx, from, to) {
    const ids: string[] = [];
    // Shopee allows ≤ 15 days per query
    const span = 15 * 86_400_000 - 60_000;
    for (let start = from.getTime(); start < to.getTime(); start += span) {
      const end = Math.min(start + span, to.getTime());
      let cursor = "";
      for (let page = 0; page < 200; page++) {
        const b = await request("Danh sách đơn Shopee", "GET", "/api/v2/order/get_order_list", {
          shop: ctx,
          query: {
            time_range_field: "update_time",
            time_from: Math.floor(start / 1000),
            time_to: Math.floor(end / 1000),
            page_size: 100,
            cursor,
          },
        });
        const r = b.response ?? {};
        for (const o of (r.order_list as Record<string, unknown>[] | undefined) ?? [])
          ids.push(s(o.order_sn));
        if (r.more !== true || !r.next_cursor) break;
        cursor = s(r.next_cursor);
      }
    }
    return [...new Set(ids.filter(Boolean))];
  },

  async getOrders(ctx, ids) {
    const out: MarketOrder[] = [];
    for (const group of chunk(ids, 50)) {
      const b = await request("Chi tiết đơn Shopee", "GET", "/api/v2/order/get_order_detail", {
        shop: ctx,
        query: {
          order_sn_list: group.join(","),
          response_optional_fields:
            "buyer_username,recipient_address,item_list,total_amount,payment_method,shipping_carrier,message_to_seller,cod",
        },
      });
      for (const o of (b.response?.order_list as Record<string, unknown>[] | undefined) ?? [])
        out.push(toOrder(o));
    }
    return out;
  },

  verifyPush(headers, rawBody) {
    const e = env();
    return shopeeVerifyPush(e.partnerKey, e.pushUrl, rawBody, headers.get("authorization"));
  },

  parsePush(body): PushEvent | null {
    const b = (body ?? {}) as Record<string, unknown>;
    const shopId = s(b.shop_id);
    const code = Number(b.code);
    if (!shopId) return null;
    const data = (b.data as Record<string, unknown> | undefined) ?? {};
    // 3 = order_status_push, 4 = order_trackingno_push, 2 = shop_authorization_canceled_push
    if (code === 3 || code === 4) {
      const sn = s(data.ordersn ?? data.order_sn);
      return { shopId, kind: "order", orderIds: sn ? [sn] : [] };
    }
    if (code === 2) return { shopId, kind: "deauthorized", orderIds: [] };
    return { shopId, kind: "other", orderIds: [] };
  },
};
