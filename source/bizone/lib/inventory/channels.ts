/** Redis channel for low-stock alerts of one tenant (relayed by GET /api/inventory/alerts). */
export const lowStockChannel = (tenantId: string) => `bizone:low-stock:${tenantId}`;
