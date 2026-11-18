import { z } from "zod";

/**
 * Omni Channel — marketplaces (P6.2): pure rules shared by the connectors, the sync jobs, the
 * admin screen and tests. Safe to import from client components.
 *
 * A marketplace shop is one `channel_connections` row (channel_code "shopee" / "lazada") per
 * tenant: OAuth tokens (encrypted), `shop_id` (Shopee shop_id / Lazada seller_id) and the JSON
 * settings below in `config`. Listings live in `channel_product_mapping`, imported orders in
 * `order_channel_mapping` (one BizOne order per marketplace order).
 */

export const MARKETPLACES = ["shopee", "lazada"] as const;
export type MarketplaceCode = (typeof MARKETPLACES)[number];

export const MARKETPLACE_NAME: Record<MarketplaceCode, string> = {
  shopee: "Shopee",
  lazada: "Lazada",
};

/** Order code prefix of imported orders: SHP-{order_sn} / LZD-{order_number} */
export const ORDER_PREFIX: Record<MarketplaceCode, string> = { shopee: "SHP", lazada: "LZD" };

export const isMarketplace = (code: string | null | undefined): code is MarketplaceCode =>
  !!code && (MARKETPLACES as readonly string[]).includes(code);

/** Most images a listing takes */
export const MAX_IMAGES: Record<MarketplaceCode, number> = { shopee: 9, lazada: 8 };

/** Settings of a marketplace channel (`channel_connections.config`) */
export const marketplaceConfigSchema = z.object({
  /** Branch that receives the orders and whose first warehouse sells the stock */
  branchId: z.number().int().positive("Chọn chi nhánh nhận đơn"),
  /** Marketplace price = BizOne selling price × (1 + markup %), rounded up to 100₫ */
  priceMarkupPercent: z.number().min(0).max(300).default(0),
  /** Units kept back from the marketplace (published stock = on hand − buffer, ≥ 0) */
  stockBuffer: z.number().int().min(0).max(100_000).default(0),
  /** Push price / stock changes automatically (every ~10 s) */
  autoSyncStock: z.boolean().default(true),
  /** Pull new orders automatically (push notifications + polling every 2 minutes) */
  autoImportOrders: z.boolean().default(true),
  /** Package of a new listing (when the product has no weight) */
  defaultWeightKg: z.number().min(0.01).max(300).default(0.5),
  packageCm: z
    .object({
      length: z.number().int().min(1).max(300).default(20),
      width: z.number().int().min(1).max(300).default(15),
      height: z.number().int().min(1).max(300).default(10),
    })
    .default({ length: 20, width: 15, height: 10 }),
  /** BizOne category id → marketplace category id (leaf). Children inherit their parent's map */
  categoryMap: z.record(z.string().regex(/^\d+$/), z.string().trim().min(1).max(50)).default({}),
});
export type MarketplaceConfig = z.infer<typeof marketplaceConfigSchema>;

export function parseMarketplaceConfig(raw: string | null | undefined): MarketplaceConfig | null {
  if (!raw) return null;
  try {
    const r = marketplaceConfigSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

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

/** Status label of a listing */
export const LISTING_STATUS_LABEL = {
  none: "Chưa đăng",
  pending: "Đang đồng bộ",
  synced: "Đã đồng bộ",
  error: "Lỗi",
  paused: "Ngừng đồng bộ",
} as const;
