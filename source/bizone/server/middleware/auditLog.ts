import { recordAudit } from "@/server/services/auditLog.service";
import { resolveDbUserId } from "@/server/services/user.service";
import type { AuthUser } from "@/types/auth";

interface AuditMeta {
  module: string;
  action: string;
  entityType: string;
}

/**
 * tRPC mutations ghi audit log (key = đường dẫn tRPC thật, ví dụ "inventory.confirmTransaction").
 * Hoá đơn POS (tạo / huỷ / đổi-trả) KHÔNG nằm ở đây: invoice.service tự ghi để bao cả luồng
 * thanh toán qua WebSocket và không ghi trùng khi request idempotent được trả lại.
 */
const AUDIT_ROUTES: Record<string, AuditMeta | undefined> = {
  "product.create": { module: "product", action: "create", entityType: "product" },
  "product.update": { module: "product", action: "update", entityType: "product" },
  "product.delete": { module: "product", action: "delete", entityType: "product" },
  "product.importExcel": { module: "product", action: "import", entityType: "product" },
  "category.create": { module: "product", action: "create", entityType: "category" },
  "category.update": { module: "product", action: "update", entityType: "category" },
  "category.delete": { module: "product", action: "delete", entityType: "category" },
  "category.reorder": { module: "product", action: "reorder", entityType: "category" },
  "warehouse.create": { module: "inventory", action: "create", entityType: "warehouse" },
  "warehouse.update": { module: "inventory", action: "update", entityType: "warehouse" },
  "warehouse.delete": { module: "inventory", action: "delete", entityType: "warehouse" },
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
  "stockTake.cancel": {
    module: "inventory",
    action: "cancel_stock_take",
    entityType: "stock_take",
  },
  "transfer.create": { module: "inventory", action: "create_transfer", entityType: "transfer" },
  "transfer.confirm": { module: "inventory", action: "confirm_transfer", entityType: "transfer" },
  "transfer.cancel": { module: "inventory", action: "cancel_transfer", entityType: "transfer" },
  "pos.openSession": { module: "pos", action: "open_session", entityType: "cash_session" },
  "pos.closeSession": { module: "pos", action: "close_session", entityType: "cash_session" },
  "order.create": { module: "order", action: "create", entityType: "order" },
  "order.updateStatus": { module: "order", action: "update_status", entityType: "order" },
  "order.cancel": { module: "order", action: "cancel", entityType: "order" },
  "order.refund": { module: "order", action: "refund", entityType: "order" },
  "customer.create": { module: "crm", action: "create", entityType: "customer" },
  "customer.update": { module: "crm", action: "update", entityType: "customer" },
  "customer.adjustPoints": { module: "crm", action: "adjust_points", entityType: "customer" },
  "customer.createDebt": { module: "crm", action: "create_debt", entityType: "customer_debt" },
  "customer.payDebt": { module: "crm", action: "pay_debt", entityType: "customer_debt" },
  "customer.merge": { module: "crm", action: "merge", entityType: "customer" },
  "staff.create": { module: "staff", action: "create", entityType: "user" },
  "staff.update": { module: "staff", action: "update", entityType: "user" },
  "staff.setRoles": { module: "staff", action: "set_roles", entityType: "user" },
  "staff.setActive": { module: "staff", action: "set_active", entityType: "user" },
  "staff.resetPassword": { module: "staff", action: "reset_password", entityType: "user" },
  "staff.role.create": { module: "staff", action: "create", entityType: "role" },
  "staff.role.update": { module: "staff", action: "update", entityType: "role" },
  "staff.role.delete": { module: "staff", action: "delete", entityType: "role" },
  "staff.shift.create": { module: "staff", action: "create", entityType: "shift" },
  "staff.shift.update": { module: "staff", action: "update", entityType: "shift" },
  "staff.shift.delete": { module: "staff", action: "delete", entityType: "shift" },
  "staff.shift.assign": { module: "staff", action: "assign_shift", entityType: "shift" },
  "staff.shift.unassign": {
    module: "staff",
    action: "unassign_shift",
    entityType: "shift_assignment",
  },
  "staff.commission.createRule": {
    module: "staff",
    action: "create",
    entityType: "commission_rule",
  },
  "staff.commission.updateRule": {
    module: "staff",
    action: "update",
    entityType: "commission_rule",
  },
  "staff.commission.recalculate": {
    module: "staff",
    action: "recalculate_commission",
    entityType: "commission",
  },
  "reports.export": { module: "report", action: "export", entityType: "report" },
  "staff.commission.pay": { module: "staff", action: "pay_commission", entityType: "commission" },
  "supplier.create": { module: "supplier", action: "create", entityType: "supplier" },
  "supplier.update": { module: "supplier", action: "update", entityType: "supplier" },
  "supplier.delete": { module: "supplier", action: "delete", entityType: "supplier" },
  "supplier.recordPayment": {
    module: "supplier",
    action: "record_payment",
    entityType: "supplier_payment",
  },
  "purchaseOrder.create": { module: "supplier", action: "create_po", entityType: "purchase_order" },
  "purchaseOrder.update": { module: "supplier", action: "update_po", entityType: "purchase_order" },
  "purchaseOrder.receive": {
    module: "supplier",
    action: "receive_po",
    entityType: "purchase_order",
  },
  "purchaseOrder.cancel": { module: "supplier", action: "cancel_po", entityType: "purchase_order" },
};

export function isAudited(path: string): boolean {
  return AUDIT_ROUTES[path] !== undefined;
}

export interface AuditRequestContext {
  req: Request;
  user: AuthUser | null;
}

/** Keys whose values are large or sensitive — recorded as a marker instead of the value */
const OMIT_KEYS = new Set(["fileBase64", "password", "secret", "token"]);

/** Compact copy of a mutation input for `new_value`: arrays → length, blobs dropped */
export function summarizeInput(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return { count: value.length };
  if (value === null || typeof value !== "object") return value;
  if (depth >= 2) return "[object]";
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = OMIT_KEYS.has(k) ? "[omitted]" : summarizeInput(v, depth + 1);
  }
  return out;
}

const ID_KEYS = [
  "id",
  "stockTakeId",
  "sessionId",
  "customerId",
  "keepId",
  "invoiceId",
  "shiftId",
  "userId",
  "supplierId",
] as const;

/** Entity id: result.id when the mutation returns a row, else the id the caller targeted */
export function entityIdOf(result: unknown, input: unknown): number | null {
  for (const source of [result, input]) {
    if (!source || typeof source !== "object") continue;
    for (const key of ID_KEYS) {
      const v = (source as Record<string, unknown>)[key];
      if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
      if (typeof v === "bigint" && v > BigInt(0)) return Number(v);
    }
  }
  return null;
}

export function clientIp(req: Request): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}

/**
 * Ghi audit log cho một tRPC mutation đã thành công (gọi từ middleware trong server/trpc.ts).
 * Fail-silent: lỗi ghi log không làm hỏng response.
 */
export async function auditTrpcMutation(
  path: string,
  ctx: AuditRequestContext,
  input: unknown,
  result: unknown,
): Promise<void> {
  const meta = AUDIT_ROUTES[path];
  if (!meta) return;
  try {
    await recordAudit({
      userId: ctx.user ? await resolveDbUserId(ctx.user) : null,
      ...meta,
      entityId: entityIdOf(result, input),
      newValue: summarizeInput(input),
      ipAddress: clientIp(ctx.req)?.slice(0, 45),
      userAgent: ctx.req.headers.get("user-agent") ?? undefined,
    });
  } catch {
    // fail-silent
  }
}
