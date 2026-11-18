import { createHmac } from "node:crypto";
import { callJson, chunk } from "../marketplace/http";
import {
  MarketplaceError,
  type ListingInput,
  type ListingResult,
  type ListingUpdate,
  type MarketplaceConnector,
  type ShopContext,
  type ShopTokens,
} from "../marketplace/types";

/**
 * Facebook / Instagram connector (P6.3) — a Meta Commerce catalog (Graph API).
 *
 * Env: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_GRAPH_URL (default
 * https://graph.facebook.com/v21.0), FACEBOOK_OAUTH_URL (default
 * https://www.facebook.com/v21.0/dialog/oauth).
 *
 * The shop owner logs in with Facebook (scopes catalog_management + business_management); the
 * short-lived user token is swapped for a long-lived one (~60 days — Meta has no refresh token:
 * the owner reconnects before it runs out) and the first catalog owned by their business becomes
 * the "shop" (`shop_id` = catalog id, `shop_ref` = business id). Products go to the catalog
 * through the batch API (`items_batch`), one item per variant (retailer id = BizOne SKU,
 * grouped by the product SKU); the catalog feeds the Facebook Page shop and Instagram shopping.
 * Meta fetches the images itself (public URLs) and sends buyers to the product `link` — the
 * website channel's product page tagged utm_source, so the order lands on the website (P6.1)
 * with `orders.source` = facebook / instagram. There is no order API to pull.
 */

const SCOPES = "catalog_management,business_management";

function env() {
  return {
    appId: process.env.FACEBOOK_APP_ID ?? "",
    appSecret: process.env.FACEBOOK_APP_SECRET ?? "",
    graph: (process.env.FACEBOOK_GRAPH_URL || "https://graph.facebook.com/v21.0").replace(
      /\/+$/,
      "",
    ),
    oauth: (
      process.env.FACEBOOK_OAUTH_URL || "https://www.facebook.com/v21.0/dialog/oauth"
    ).replace(/\/+$/, ""),
  };
}

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** appsecret_proof = HMAC-SHA256(app_secret, access_token) — required on server calls */
export function appSecretProof(appSecret: string, accessToken: string) {
  return createHmac("sha256", appSecret).update(accessToken, "utf8").digest("hex");
}

type GraphError = { message?: string; type?: string; code?: number; error_subcode?: number };

function failure(label: string, err: GraphError, httpStatus: number): MarketplaceError {
  const code = Number(err.code ?? 0);
  const msg = `${label}: ${err.message || `HTTP ${httpStatus}`}`;
  // 190 token invalid / expired, 102 session, 10 / 200-299 permission
  if (
    code === 190 ||
    code === 102 ||
    code === 10 ||
    (code >= 200 && code < 300) ||
    httpStatus === 401
  )
    return new MarketplaceError("auth", msg, String(code));
  // 4 app limit, 17 user limit, 32 page limit, 613 calls per second, 80014 catalog batch
  if ([4, 17, 32, 613, 80004, 80014].includes(code))
    return new MarketplaceError("rate_limit", msg, String(code));
  if (code === 100 || httpStatus === 400) return new MarketplaceError("invalid", msg, String(code));
  return new MarketplaceError("api", msg, String(code));
}

async function graph(
  label: string,
  method: "GET" | "POST",
  path: string,
  opts: { token?: string; query?: Record<string, string>; body?: unknown } = {},
): Promise<Record<string, unknown>> {
  const e = env();
  const qs = new URLSearchParams(opts.query ?? {});
  if (opts.token) {
    qs.set("access_token", opts.token);
    qs.set("appsecret_proof", appSecretProof(e.appSecret, opts.token));
  }
  const { status, body } = await callJson(`${e.graph}${path}?${qs}`, {
    label,
    method,
    headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.error || status >= 400) throw failure(label, (b.error ?? {}) as GraphError, status);
  return b;
}

/** "27500 VND" — VND has no minor unit */
const vnd = (amount: number) => `${Math.round(amount)} VND`;

type BatchRequest = { method: "CREATE" | "UPDATE"; data: Record<string, unknown> };

/** Send catalog item requests; returns errors per retailer id (validated synchronously) */
async function itemsBatch(ctx: ShopContext, requests: BatchRequest[]) {
  const errors = new Map<string, string>();
  for (const group of chunk(requests, 1000)) {
    const b = await graph("Đồng bộ catalog Facebook", "POST", `/${ctx.shopId}/items_batch`, {
      token: ctx.accessToken,
      body: { item_type: "PRODUCT_ITEM", allow_upsert: true, requests: group },
    });
    const handles = (b.handles as unknown[] | undefined) ?? [];
    if (handles.length === 0 && !b.validation_status)
      throw new MarketplaceError("api", "Facebook không nhận yêu cầu đồng bộ catalog");
    for (const v of (b.validation_status as Record<string, unknown>[] | undefined) ?? []) {
      const errs = (v.errors as Record<string, unknown>[] | undefined) ?? [];
      if (errs.length)
        errors.set(
          s(v.retailer_id),
          errs
            .map((x) => s(x.message))
            .filter(Boolean)
            .join("; "),
        );
    }
  }
  return errors;
}

async function longLived(token: string): Promise<{ token: string; expiresAt: Date }> {
  const e = env();
  const b = await graph("Đổi token Facebook dài hạn", "GET", "/oauth/access_token", {
    query: {
      grant_type: "fb_exchange_token",
      client_id: e.appId,
      client_secret: e.appSecret,
      fb_exchange_token: token,
    },
  });
  const access = s(b.access_token);
  if (!access) throw new MarketplaceError("auth", "Facebook không trả access token");
  const expiresIn = Number(b.expires_in ?? 0);
  return {
    token: access,
    // No expires_in = a token that doesn't expire (system user) → check again in 60 days
    expiresAt: new Date(Date.now() + (expiresIn > 0 ? expiresIn : 60 * 86_400) * 1000),
  };
}

export const facebookConnector: MarketplaceConnector = {
  code: "facebook",
  name: "Facebook / Instagram",

  configured() {
    const e = env();
    return /^\d+$/.test(e.appId) && e.appSecret.length >= 8;
  },

  authorizeUrl(callbackUrl, state) {
    const e = env();
    const qs = new URLSearchParams({
      client_id: e.appId,
      redirect_uri: callbackUrl,
      state,
      scope: SCOPES,
      response_type: "code",
    });
    return `${e.oauth}?${qs}`;
  },

  async exchangeCode(query, callbackUrl) {
    const code = query.get("code");
    if (!code) throw new MarketplaceError("invalid", "Facebook không trả mã uỷ quyền (code)");
    const e = env();
    const short = await graph("Lấy token Facebook", "GET", "/oauth/access_token", {
      query: {
        client_id: e.appId,
        client_secret: e.appSecret,
        redirect_uri: callbackUrl,
        code,
      },
    });
    const shortToken = s(short.access_token);
    if (!shortToken) throw new MarketplaceError("auth", "Facebook không trả access token");
    const { token, expiresAt } = await longLived(shortToken);
    // The catalog: first one owned by a business the user manages
    const biz = await graph("Doanh nghiệp Facebook", "GET", "/me/businesses", {
      token,
      query: { fields: "id,name,owned_product_catalogs{id,name}", limit: "50" },
    });
    for (const b of (biz.data as Record<string, unknown>[] | undefined) ?? []) {
      const cats = (b.owned_product_catalogs as { data?: Record<string, unknown>[] } | undefined)
        ?.data;
      const cat = cats?.[0];
      if (cat && s(cat.id))
        return {
          accessToken: token,
          // Meta has no refresh token: the long-lived token itself is re-exchanged
          refreshToken: token,
          expiresAt,
          refreshExpiresAt: expiresAt,
          shopId: s(cat.id),
          shopName: `${s(cat.name) || "Catalog"} (${s(b.name) || "Business"})`,
          shopRef: s(b.id),
        } satisfies ShopTokens;
    }
    throw new MarketplaceError(
      "invalid",
      "Tài khoản Facebook chưa có catalog sản phẩm — tạo catalog trong Commerce Manager rồi kết nối lại",
    );
  },

  async refresh(current) {
    // Re-exchanging extends the token while it is still valid; once expired → reconnect
    const { token, expiresAt } = await longLived(current.refreshToken);
    return {
      accessToken: token,
      refreshToken: token,
      expiresAt,
      refreshExpiresAt: expiresAt,
      shopId: current.shopId,
      shopName: null,
    };
  },

  async categories() {
    return []; // the catalog needs no category (Meta classifies items itself)
  },

  async createListing(ctx, input: ListingInput): Promise<ListingResult> {
    if (!input.link)
      throw new MarketplaceError("invalid", "Chưa có link sản phẩm trên website (kênh Website)");
    if (input.imageUrls.length === 0)
      throw new MarketplaceError("invalid", "Sản phẩm chưa có ảnh (URL công khai)");
    const [image, ...more] = input.imageUrls;
    const hasVariants = input.variants.length > 0;
    const items = hasVariants
      ? input.variants
      : [{ sku: input.sku, name: "", price: input.price, stock: input.stock }];
    const requests: BatchRequest[] = items.map((v) => ({
      method: "CREATE",
      data: {
        id: v.sku,
        ...(hasVariants
          ? { item_group_id: input.sku, additional_variant_attribute: `Phân loại:${v.name}` }
          : {}),
        title: hasVariants ? `${input.name} — ${v.name}` : input.name,
        description: input.description,
        availability: v.stock > 0 ? "in stock" : "out of stock",
        inventory: v.stock,
        condition: "new",
        price: vnd(v.price),
        link: input.link,
        image_link: image,
        ...(more.length ? { additional_image_link: more } : {}),
        brand: input.brand,
      },
    }));
    const errors = await itemsBatch(ctx, requests);
    const first = [...errors.values()][0];
    if (first) throw new MarketplaceError("invalid", `Facebook từ chối sản phẩm: ${first}`);
    return {
      itemId: input.sku,
      models: hasVariants
        ? input.variants.map((v) => ({ sku: v.sku, modelId: v.sku }))
        : [{ sku: input.sku, modelId: null }],
    };
  },

  async updateListings(ctx, updates: ListingUpdate[]) {
    const requests: BatchRequest[] = updates.map((u) => ({
      method: "UPDATE",
      data: {
        id: u.modelId ?? u.itemId,
        ...(u.price !== undefined ? { price: vnd(u.price) } : {}),
        ...(u.stock !== undefined
          ? { inventory: u.stock, availability: u.stock > 0 ? "in stock" : "out of stock" }
          : {}),
      },
    }));
    const errors = await itemsBatch(ctx, requests);
    return updates.map((u) => {
      const error = errors.get(u.modelId ?? u.itemId);
      return { sku: u.sku, ok: !error, ...(error ? { error } : {}) };
    });
  },

  async listOrderIds() {
    return []; // orders come through the website (utm_source)
  },

  async getOrders() {
    return [];
  },

  verifyPush() {
    return false;
  },

  parsePush() {
    return null;
  },
};
