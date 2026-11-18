/**
 * Omni Channel — marketplaces (P6.2) and social / video commerce (P6.3): pure rules shared by
 * the connectors, the sync jobs, the admin screen and tests. Safe to import from client
 * components.
 *
 * A connected shop is one `channel_connections` row (channel_code "shopee" / "lazada" /
 * "tiktok" / "facebook") per tenant: OAuth tokens (encrypted), `shop_id` (Shopee shop_id /
 * Lazada seller_id / TikTok shop id / Meta catalog id), `shop_ref` (TikTok shop_cipher, Meta
 * business id) and the JSON settings below in `config`. Listings live in
 * `channel_product_mapping`, imported orders in `order_channel_mapping` (one BizOne order per
 * marketplace order).
 */

export const MARKETPLACES = ["shopee", "lazada", "tiktok", "facebook"] as const;
export type MarketplaceCode = (typeof MARKETPLACES)[number];

export const MARKETPLACE_NAME: Record<MarketplaceCode, string> = {
  shopee: "Shopee",
  lazada: "Lazada",
  tiktok: "TikTok Shop",
  facebook: "Facebook / Instagram",
};

/** Order code prefix of imported orders: SHP-{order_sn} / LZD-{order_number} / TTS-{order_id} */
export const ORDER_PREFIX: Record<MarketplaceCode, string> = {
  shopee: "SHP",
  lazada: "LZD",
  tiktok: "TTS",
  facebook: "FB",
};

export const isMarketplace = (code: string | null | undefined): code is MarketplaceCode =>
  !!code && (MARKETPLACES as readonly string[]).includes(code);

/** Most images a listing takes */
export const MAX_IMAGES: Record<MarketplaceCode, number> = {
  shopee: 9,
  lazada: 8,
  tiktok: 9,
  facebook: 10,
};

/**
 * What a platform does (P6.3). Meta catalogs (Facebook / Instagram shopping) take image URLs,
 * need no category map and sell through the product link — the website (P6.1) takes the order,
 * tagged with its `source`; there is no order API to pull.
 */
export interface MarketplaceFeatures {
  /** Listings need a platform category (category map tab) */
  categories: boolean;
  /** Orders are pulled from the platform (push + polling) */
  orders: boolean;
  /** Images are uploaded to the platform (else public URLs are sent) */
  uploadsImages: boolean;
  /** Listings link to the product page of the website channel */
  linksToWebsite: boolean;
}

export const MARKETPLACE_FEATURES: Record<MarketplaceCode, MarketplaceFeatures> = {
  shopee: { categories: true, orders: true, uploadsImages: true, linksToWebsite: false },
  lazada: { categories: true, orders: true, uploadsImages: true, linksToWebsite: false },
  tiktok: { categories: true, orders: true, uploadsImages: true, linksToWebsite: false },
  facebook: { categories: false, orders: false, uploadsImages: false, linksToWebsite: true },
};

/** Marketplaces whose orders are imported */
export const ORDER_MARKETPLACES = MARKETPLACES.filter((c) => MARKETPLACE_FEATURES[c].orders);

/** Env variables holding BizOne's app credentials on each platform (shown when missing) */
export const PLATFORM_ENV: Record<MarketplaceCode, string> = {
  shopee: "SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY",
  lazada: "LAZADA_APP_KEY / LAZADA_APP_SECRET",
  tiktok: "TIKTOK_APP_KEY / TIKTOK_APP_SECRET / TIKTOK_SERVICE_ID",
  facebook: "FACEBOOK_APP_ID / FACEBOOK_APP_SECRET",
};

// ─── Order source (website orders) ───────────────────────────────────────────

/** utm_source values kept on website orders (links shared on social channels) */
export const ORDER_SOURCES = [
  "facebook",
  "instagram",
  "zalo",
  "tiktok",
  "google",
  "messenger",
] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  zalo: "Zalo",
  tiktok: "TikTok",
  google: "Google",
  messenger: "Messenger",
};

/** Sources counted as orders of the Facebook / Instagram channel */
export const META_SOURCES: readonly OrderSource[] = ["facebook", "instagram", "messenger"];

/** utm_source as sent by the browser → a known source (null = unknown / direct) */
export function normalizeOrderSource(raw: string | null | undefined): OrderSource | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  const alias: Record<string, OrderSource> = {
    fb: "facebook",
    "facebook.com": "facebook",
    "m.facebook.com": "facebook",
    "l.facebook.com": "facebook",
    ig: "instagram",
    "instagram.com": "instagram",
    "zalo.me": "zalo",
    zalo_oa: "zalo",
    tt: "tiktok",
    "tiktok.com": "tiktok",
  };
  if (alias[v]) return alias[v];
  return (ORDER_SOURCES as readonly string[]).includes(v) ? (v as OrderSource) : null;
}

/** Product link of a catalog item: the website product page, tagged with utm_source */
export function catalogLink(storefrontUrl: string, slug: string, source: OrderSource = "facebook") {
  const base = storefrontUrl.replace(/\/+$/, "");
  return `${base}/products/${encodeURIComponent(slug)}?utm_source=${source}&utm_medium=catalog`;
}

// Config schema (Zod) lives in ./marketplace-config.ts so that client code importing labels /
// helpers from this file does not ship Zod to the browser (P6.5 bundle size).
export type { MarketplaceConfig } from "./marketplace-config";

// ─── Price / stock ───────────────────────────────────────────────────────────

/** Marketplace price of a BizOne selling price */
export function channelPrice(sellingPrice: number, markupPercent: number): number {
  const base = Math.max(0, Math.round(sellingPrice));
  if (!markupPercent) return base;
  // Integer math: 45 000 × 1.1 must give 49 500, not 49 500.000…01 → 49 600
  return Math.ceil(Math.round(base * (100 + markupPercent)) / 10_000) * 100;
}

/** Published stock: on hand at the channel's warehouse minus the buffer (inactive → 0) */
export function channelStock(onHand: number, buffer: number, sellable = true): number {
  if (!sellable) return 0;
  return Math.max(0, Math.floor(onHand) - Math.max(0, buffer));
}

/**
 * Marketplace category of a BizOne category: its own map, else the nearest mapped ancestor.
 * `parents` = category id → parent id.
 */
export function resolveCategory(
  categoryId: number | null,
  parents: ReadonlyMap<number, number | null>,
  categoryMap: Record<string, string>,
): string | null {
  const seen = new Set<number>();
  let id = categoryId;
  while (id != null && !seen.has(id)) {
    seen.add(id);
    const mapped = categoryMap[String(id)];
    if (mapped) return mapped;
    id = parents.get(id) ?? null;
  }
  return null;
}

// ─── Order status ────────────────────────────────────────────────────────────

export type BizOrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "shipping"
  | "delivered"
  | "completed"
  | "cancelled"
  | "returned";

/** Progress order: a marketplace status only ever moves a BizOne order forward */
export const STATUS_RANK: Record<BizOrderStatus, number> = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  shipping: 3,
  delivered: 4,
  completed: 5,
  returned: 6,
  cancelled: 6,
};

export const FINAL_STATUSES: readonly BizOrderStatus[] = ["completed", "cancelled", "returned"];

/**
 * Shopee order_status → BizOne status (null = no change, e.g. IN_CANCEL: the buyer asked to
 * cancel, the seller has not answered yet).
 */
export function mapShopeeStatus(status: string): BizOrderStatus | null {
  switch (status.toUpperCase()) {
    case "UNPAID":
    case "INVOICE_PENDING":
      return "pending";
    case "READY_TO_SHIP":
      return "confirmed";
    case "PROCESSED":
    case "RETRY_SHIP":
      return "preparing";
    case "SHIPPED":
      return "shipping";
    case "TO_CONFIRM_RECEIVE":
      return "delivered";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    case "TO_RETURN":
      return "returned";
    default:
      return null;
  }
}

/**
 * Lazada order statuses (one per order item) → BizOne status. A partly cancelled order follows
 * its remaining items; `delivered` is Lazada's final successful state.
 */
export function mapLazadaStatus(statuses: readonly string[]): BizOrderStatus | null {
  const s = statuses.map((x) => x.toLowerCase()).filter(Boolean);
  if (s.length === 0) return null;
  const live = s.filter((x) => x !== "canceled" && x !== "cancelled");
  if (live.length === 0) return "cancelled";
  const one = (x: string): BizOrderStatus | null => {
    switch (x) {
      case "unpaid":
        return "pending";
      case "pending":
      case "topack":
        return "confirmed";
      case "packed":
      case "repacked":
      case "ready_to_ship":
      case "ready_to_ship_pending":
      case "toship":
        return "preparing";
      case "shipped":
      case "shipped_back":
        return "shipping";
      case "delivered":
      case "confirmed":
        return "completed";
      case "returned":
      case "failed_delivery":
      case "lost_by_3pl":
      case "damaged_by_3pl":
      case "shipped_back_success":
        return "returned";
      default:
        return null;
    }
  };
  const mapped = live.map(one).filter((x): x is BizOrderStatus => x !== null);
  if (mapped.length === 0) return null;
  // Every remaining item returned → returned; otherwise the least advanced live item leads
  if (mapped.every((x) => x === "returned")) return "returned";
  const progress = mapped.filter((x) => x !== "returned");
  return progress.reduce((a, b) => (STATUS_RANK[b] < STATUS_RANK[a] ? b : a));
}

/**
 * What to do with a BizOne order when the marketplace reports `target`:
 * - "none": already there, behind, or the order is closed
 * - "advance": move to a later in-progress status
 * - "complete" / "cancel" / "return": close it the BizOne way (invoice / give stock back)
 * - "manual": the marketplace reopened a closed order (returned after completion — #131)
 */
export function plannedTransition(
  current: BizOrderStatus,
  target: BizOrderStatus | null,
): "none" | "advance" | "complete" | "cancel" | "return" | "manual" {
  if (!target || target === current) return "none";
  if (FINAL_STATUSES.includes(current))
    return current === "completed" && target === "returned" ? "manual" : "none";
  if (target === "completed") return "complete";
  if (target === "returned") return "return";
  if (target === "cancelled")
    return ["pending", "confirmed", "preparing"].includes(current) ? "cancel" : "return";
  return STATUS_RANK[target] > STATUS_RANK[current] ? "advance" : "none";
}

/**
 * TikTok Shop order status (202309) → BizOne status. ON_HOLD = paid, inside the buyer's
 * cancellation window: the order is real (stock is taken) but not yet released for shipping.
 */
export function mapTiktokStatus(status: string): BizOrderStatus | null {
  switch (status.toUpperCase()) {
    case "UNPAID":
      return "pending";
    case "ON_HOLD":
    case "AWAITING_SHIPMENT":
      return "confirmed";
    case "PARTIALLY_SHIPPING":
    case "AWAITING_COLLECTION":
      return "preparing";
    case "IN_TRANSIT":
      return "shipping";
    case "DELIVERED":
      return "delivered";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    default:
      return null;
  }
}

/** Target BizOne status of a marketplace order */
export function mapMarketStatus(
  code: MarketplaceCode,
  order: { rawStatus: string; statuses: readonly string[] },
): BizOrderStatus | null {
  switch (code) {
    case "shopee":
      return mapShopeeStatus(order.rawStatus);
    case "lazada":
      return mapLazadaStatus(order.statuses);
    case "tiktok":
      return mapTiktokStatus(order.rawStatus);
    default:
      return null;
  }
}

/** Status label of a listing */
export const LISTING_STATUS_LABEL = {
  none: "Chưa đăng",
  pending: "Đang đồng bộ",
  synced: "Đã đồng bộ",
  error: "Lỗi",
  paused: "Ngừng đồng bộ",
} as const;
