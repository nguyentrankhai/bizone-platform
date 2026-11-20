import { z } from "zod";

/**
 * Omni Channel — website (P6.1): pure rules shared by the store API, the admin screen and tests.
 *
 * The storefront (`source/storefront`, `[slug].bizone.vn`) is a separate Next app that talks to
 * BizOne's store API (`/api/store/v1/*`) server-to-server with a per-tenant store key. The key
 * names its tenant (`bzs.{tenant}.{secret}`) so the API can open the right database; only its
 * SHA-256 is stored (`channel_connections.access_token`, channel_code = "website").
 */

export const WEBSITE_CHANNEL = "website";

export const WEBSITE_PAYMENT_METHODS = ["cod", "payhub"] as const;
export type WebsitePaymentMethod = (typeof WEBSITE_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<WebsitePaymentMethod, string> = {
  cod: "Thanh toán khi nhận hàng (COD)",
  payhub: "Thanh toán online (VNPay / MoMo / ZaloPay / QR)",
};

/** Settings of the website channel, stored as JSON in `channel_connections.config` */
export const websiteConfigSchema = z.object({
  storeName: z.string().trim().min(1, "Nhập tên cửa hàng").max(255),
  /** Sub-domain: `{slug}.bizone.vn` */
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/,
      "Tên miền chỉ gồm a-z, 0-9, dấu - (2–40 ký tự)",
    )
    .min(2, "Tên miền chỉ gồm a-z, 0-9, dấu - (2–40 ký tự)"),
  /** Branch that receives website orders and whose warehouse sells the stock (#82) */
  branchId: z.number().int().positive("Chọn chi nhánh nhận đơn"),
  hotline: z.string().trim().max(20).default(""),
  /** Flat delivery fee (₫) */
  shippingFee: z.number().int().min(0).max(10_000_000).default(30_000),
  /** Goods total from which delivery is free (null = never) */
  freeShippingFrom: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
  paymentMethods: z
    .array(z.enum(WEBSITE_PAYMENT_METHODS))
    .min(1, "Chọn ít nhất một phương thức thanh toán")
    .default(["cod", "payhub"]),
  /** Unpaid online-payment orders are cancelled (stock released) after this many minutes */
  paymentMinutes: z.number().int().min(5).max(1440).default(30),
  /** Public URL of the storefront — Payment Hub sends the customer back to it only */
  storefrontUrl: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/, error: "URL website không hợp lệ" }))
    .default("http://localhost:3100"),
});
export type WebsiteConfig = z.infer<typeof websiteConfigSchema>;

/** Stored config → typed config (null when missing / broken) */
export function parseWebsiteConfig(raw: string | null | undefined): WebsiteConfig | null {
  if (!raw) return null;
  try {
    const r = websiteConfigSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Delivery fee of a goods total under the channel settings */
export function shippingFeeFor(
  cfg: Pick<WebsiteConfig, "shippingFee" | "freeShippingFrom">,
  goodsTotal: number,
) {
  return cfg.freeShippingFrom !== null && goodsTotal >= cfg.freeShippingFrom ? 0 : cfg.shippingFee;
}

/** Return URL must stay on the configured storefront (no open redirect through Payment Hub) */
export function isStorefrontUrl(url: string, storefrontUrl: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      u.origin === new URL(storefrontUrl).origin
    );
  } catch {
    return false;
  }
}

// ─── Customer accounts ───────────────────────────────────────────────────────

/** Vietnamese mobile number → 0xxxxxxxxx (null when it isn't one) */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.replace(/[\s.()-]/g, "");
  if (p.startsWith("+84")) p = "0" + p.slice(3);
  else if (p.startsWith("84") && p.length === 11) p = "0" + p.slice(2);
  return /^0\d{9}$/.test(p) ? p : null;
}

export const PASSWORD_RULE = "Mật khẩu tối thiểu 8 ký tự";

/** Failed logins before the account is locked, and for how long (SRS: 5 lần → khoá 15 phút) */
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_LOCK_MINUTES = 15;

// ─── Orders & payments ───────────────────────────────────────────────────────

const WEB_TXN = /^WEB-([A-Za-z0-9_-]+)-(\d+)$/;

/** Payment Hub merchant_txn_id of an order payment (tenant inside, like POS `BZ-…`) */
export const webTxnIdOf = (tenantId: string, paymentId: number) => `WEB-${tenantId}-${paymentId}`;

export function parseWebTxnId(id: string | null | undefined) {
  const m = id ? WEB_TXN.exec(id) : null;
  return m ? { tenantId: m[1], paymentId: Number(m[2]) } : null;
}

/** URL slug of a product: `{id}-{name without accents}` (the id is what counts) */
export function productSlug(id: number, name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s ? `${id}-${s}` : String(id);
}

export function productIdFromSlug(slug: string): number | null {
  const m = /^(\d{1,10})(?:-|$)/.exec(slug);
  const id = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Revenue of a completed online order (#61): the goods, net of every discount. The delivery fee
 * is collected for the carrier and is not revenue; a free-shipping discount the shop paid for
 * reduces the goods revenue.
 */
export function orderGoodsRevenue(o: { totalAmount: number; shippingFee: number }): number {
  return Math.max(0, Math.round(o.totalAmount - o.shippingFee));
}

/** Customer-facing order statuses */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  preparing: "Đang chuẩn bị",
  shipping: "Đang giao",
  delivered: "Đã giao",
  completed: "Hoàn thành",
  cancelled: "Đã huỷ",
  returned: "Hoàn trả",
};
