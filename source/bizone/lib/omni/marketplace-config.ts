import { z } from "zod";

/**
 * Per-channel marketplace settings (P6.2), stored as JSON in `channel_connections.config`.
 * Separate from ./marketplace.ts (labels, pure helpers also used in the browser) so client
 * bundles that only need labels don't include Zod — P6.5.
 */
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
