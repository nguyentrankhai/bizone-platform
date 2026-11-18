import type { MarketplaceCode } from "@/lib/omni/marketplace";

/**
 * Marketplace connector contract (P6.2). One implementation per platform (Shopee Open
 * Platform v2, Lazada Open Platform, TikTok Shop Partner API 202309, Meta catalog — P6.3); the
 * sync services only talk to this interface. What a platform supports (categories, order
 * import, image upload) is in `MARKETPLACE_FEATURES`.
 * Platform credentials (partner / app key + secret) are BizOne's own and come from env —
 * each tenant's shop authorizes BizOne through OAuth.
 */

export interface ShopTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  /** null = the platform doesn't say (Shopee: 30 days, assumed) */
  refreshExpiresAt: Date | null;
  shopId: string;
  shopName: string | null;
  /** P6.3: handle sent with the shop id (TikTok shop_cipher, Meta business id); undefined = keep */
  shopRef?: string | null;
}

/** Signed-in shop a call runs for */
export interface ShopContext {
  accessToken: string;
  shopId: string;
  shopRef?: string | null;
}

export interface MarketCategory {
  id: string;
  name: string;
  parentId: string | null;
  leaf: boolean;
}

export interface ListingImage {
  data: Buffer;
  filename: string;
  contentType: string;
}

export interface ListingInput {
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  /** Used when there are no variants */
  price: number;
  stock: number;
  weightKg: number;
  packageCm: { length: number; width: number; height: number };
  /** Uploaded to the platform (`uploadsImages`) — empty otherwise */
  images: ListingImage[];
  /** Absolute public URLs of the same images (platforms that fetch them: Meta) */
  imageUrls: string[];
  /** Product page on the website channel (`linksToWebsite`), null otherwise */
  link: string | null;
  brand: string;
  /** Variations (one tier "Phân loại") — empty = single listing */
  variants: { sku: string; name: string; price: number; stock: number }[];
}

export interface ListingResult {
  itemId: string;
  /** One per variant (by sku), or a single entry with modelId null */
  models: { sku: string; modelId: string | null }[];
}

export interface ListingUpdate {
  itemId: string;
  modelId: string | null;
  sku: string;
  price?: number;
  stock?: number;
}

export interface MarketOrderLine {
  itemId: string;
  modelId: string | null;
  sku: string;
  name: string;
  quantity: number;
  /** Price the buyer paid per unit (after the marketplace's own discounts) */
  unitPrice: number;
}

export interface MarketOrder {
  orderId: string;
  /** Raw platform status (Shopee order_status / Lazada item statuses joined by ",") */
  rawStatus: string;
  statuses: string[];
  createdAt: Date;
  updatedAt: Date;
  isCod: boolean;
  paymentMethod: string | null;
  buyerName: string | null;
  phone: string | null;
  address: string | null;
  shippingFee: number;
  total: number;
  carrier: string | null;
  trackingCode: string | null;
  note: string | null;
  lines: MarketOrderLine[];
}

export interface PushEvent {
  shopId: string;
  kind: "order" | "deauthorized" | "other";
  orderIds: string[];
}

export type MarketplaceErrorKind = "auth" | "rate_limit" | "invalid" | "network" | "api";

/** Platform call failed. `auth` = token rejected (refresh / reconnect); retryable kinds go back to the queue */
export class MarketplaceError extends Error {
  constructor(
    public kind: MarketplaceErrorKind,
    message: string,
    public platformCode?: string,
  ) {
    super(message);
    this.name = "MarketplaceError";
  }
  get retryable() {
    return this.kind === "rate_limit" || this.kind === "network";
  }
}

export interface MarketplaceConnector {
  code: MarketplaceCode;
  name: string;
  /** Platform credentials present in env */
  configured(): boolean;
  /** Page the shop owner opens to authorize BizOne; `state` comes back to the callback */
  authorizeUrl(callbackUrl: string, state: string): string;
  /** Callback query (code, shop_id…) → tokens; `callbackUrl` = the redirect URI used above */
  exchangeCode(query: URLSearchParams, callbackUrl: string): Promise<ShopTokens>;
  refresh(current: {
    refreshToken: string;
    shopId: string;
    shopRef?: string | null;
  }): Promise<ShopTokens>;
  categories(ctx: ShopContext): Promise<MarketCategory[]>;
  createListing(ctx: ShopContext, input: ListingInput): Promise<ListingResult>;
  /** Price and/or stock of existing listings — result per sku */
  updateListings(
    ctx: ShopContext,
    updates: ListingUpdate[],
  ): Promise<{ sku: string; ok: boolean; error?: string }[]>;
  /** Ids of orders created or updated in [from, to] */
  listOrderIds(ctx: ShopContext, from: Date, to: Date): Promise<string[]>;
  getOrders(ctx: ShopContext, ids: string[]): Promise<MarketOrder[]>;
  /** Push notification authenticity (raw body as received) */
  verifyPush(headers: Headers, rawBody: string): boolean;
  parsePush(body: unknown): PushEvent | null;
}
