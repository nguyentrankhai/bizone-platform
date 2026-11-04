import type { NextRequest } from "next/server";
import { createAuditLog } from "@/server/services/auditLog.service";
import type { AuthUser } from "@/types/auth";

/** Các module + action cần ghi audit log */
const AUDIT_ROUTES: Record<
  string,
  { module: string; action: string; entityType: string } | undefined
> = {
  "invoice.create": { module: "pos", action: "create", entityType: "invoice" },
  "invoice.void": { module: "pos", action: "void", entityType: "invoice" },
  "product.create": { module: "product", action: "create", entityType: "product" },
  "product.update": { module: "product", action: "update", entityType: "product" },
  "product.delete": { module: "product", action: "delete", entityType: "product" },
  "category.create": { module: "product", action: "create", entityType: "category" },
  "category.update": { module: "product", action: "update", entityType: "category" },
  "category.delete": { module: "product", action: "delete", entityType: "category" },
  "inventory.createTransaction": {
    module: "inventory",
    action: "create_transaction",
    entityType: "inventory_transaction",
  },
  "inventory.confirmTransaction": {
    module: "inventory",
    action: "confirm_transaction",
    entityType: "inventory_transaction",
  },
  "inventory.cancelTransaction": {
    module: "inventory",
    action: "cancel_transaction",
    entityType: "inventory_transaction",
  },
  "stockTake.create": {
    module: "inventory",
    action: "create_stock_take",
    entityType: "stock_take",
  },
  "stockTake.complete": {
    module: "inventory",
    action: "complete_stock_take",
    entityType: "stock_take",
  },
  "transfer.create": { module: "inventory", action: "create_transfer", entityType: "transfer" },
  "transfer.confirm": { module: "inventory", action: "confirm_transfer", entityType: "transfer" },
  "order.create": { module: "order", action: "create", entityType: "order" },
  "order.updateStatus": { module: "order", action: "update_status", entityType: "order" },
  "order.cancel": { module: "order", action: "cancel", entityType: "order" },
  "order.refund": { module: "order", action: "refund", entityType: "order" },
  "customer.create": { module: "crm", action: "create", entityType: "customer" },
  "customer.update": { module: "crm", action: "update", entityType: "customer" },
  "customer.delete": { module: "crm", action: "delete", entityType: "customer" },
};

export interface AuditContext {
  req: NextRequest;
  user: AuthUser | null;
}

/**
 * Ghi audit log cho một tRPC call. Gọi sau khi mutation hoàn thành.
 * Fail-silent: lỗi ghi log không làm hỏng response.
 */
export async function auditTrpcCall(
  path: string,
  ctx: AuditContext,
  entityId?: number | null,
  oldValue?: unknown,
  newValue?: unknown,
  notes?: string,
): Promise<void> {
  const meta = AUDIT_ROUTES[path];
  if (!meta) return;

  const userId = ctx.user ? resolveNumericUserId(ctx.user.id) : null;
  const ipAddress = getClientIp(ctx.req);
  const userAgent = ctx.req.headers.get("user-agent") ?? undefined;

  try {
    await createAuditLog({
      userId,
      action: meta.action,
      module: meta.module,
      entityType: meta.entityType,
      entityId: entityId ?? null,
      oldValue,
      newValue,
      ipAddress,
      userAgent,
      notes,
    });
  } catch {
    // fail-silent
  }
}

function resolveNumericUserId(sub: string): number | null {
  const n = parseInt(sub, 10);
  return isNaN(n) ? null : n;
}

function getClientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}
