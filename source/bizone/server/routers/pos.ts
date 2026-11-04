import { z } from "zod";
import { router, posPermissionProcedure } from "@/server/trpc";
import { hasPermission } from "@/lib/rbac";
import { bizoneError } from "@/lib/errors";
import type { AuthUser } from "@/types/auth";
import {
  cancelInvoiceSchema,
  closeSessionSchema,
  createInvoiceSchema,
  listInvoicesSchema,
  listSessionsSchema,
  openSessionSchema,
  quoteSchema,
  refundInvoiceSchema,
} from "@/lib/validators/pos";
import {
  closeSession,
  getCurrentSession,
  getSession,
  listSessions,
  openSession,
  sessionSummary,
  type PosActor,
} from "@/server/services/cashSession.service";
import {
  cancelInvoice,
  createInvoice,
  getInvoice,
  listInvoices,
  printData,
  refundInvoice,
} from "@/server/services/invoice.service";
import { findProductByCode, loadCartLines, quoteCart } from "@/server/services/pricing.service";
import { ensureDbUserId } from "@/server/services/user.service";

/** Managers may act on other cashiers' shifts and invoices */
const MANAGER_ROLES = ["bizone-admin", "bizone-manager"];

async function actorOf(ctx: { user: AuthUser | null; tenantId: string | null }): Promise<PosActor> {
  const user = ctx.user!;
  return {
    userId: await ensureDbUserId(user),
    tenantId: ctx.tenantId!,
    canManage: hasPermission(user, "admin:*") || user.roles.some((r) => MANAGER_ROLES.includes(r)),
  };
}

const id = z.object({ id: z.number().int().positive() });

export const posRouter = router({
  // ── Cash sessions (ca) ─────────────────────────────────────────────────────

  /** POST mở ca */
  openSession: posPermissionProcedure("pos:write")
    .input(openSessionSchema)
    .mutation(async ({ input, ctx }) => openSession(input, await actorOf(ctx))),

  /** GET ca đang mở của người dùng hiện tại (null nếu chưa mở) */
  currentSession: posPermissionProcedure("pos:read").query(async ({ ctx }) =>
    getCurrentSession(await actorOf(ctx)),
  ),

  /** PUT khóa ca — đối soát tiền mặt thực tế với dự kiến */
  closeSession: posPermissionProcedure("pos:write")
    .input(closeSessionSchema)
    .mutation(async ({ input, ctx }) => closeSession(input, await actorOf(ctx))),

  sessions: posPermissionProcedure("pos:read")
    .input(listSessionsSchema)
    .query(({ input }) => listSessions(input)),

  session: posPermissionProcedure("pos:read")
    .input(id)
    .query(({ input }) => getSession(input.id)),

  /** GET tổng kết ca */
  sessionSummary: posPermissionProcedure("pos:read")
    .input(id)
    .query(({ input }) => sessionSummary(input.id)),

  // ── Selling ────────────────────────────────────────────────────────────────

  /** Quét mã vạch / SKU → sản phẩm với giá bán hiện tại */
  scan: posPermissionProcedure("pos:read")
    .input(z.object({ code: z.string().trim().min(1).max(100) }))
    .query(async ({ input }) => {
      const hit = await findProductByCode(input.code);
      if (!hit) throw bizoneError("NOT_FOUND", `Không tìm thấy sản phẩm "${input.code}"`);
      const [line] = await loadCartLines([{ ...hit, quantity: 1, discountPercent: 0 }]);
      return line;
    }),

  /** Tính tiền giỏ hàng (giá DB, giảm giá hạng thành viên, coupon/auto coupon) */
  quote: posPermissionProcedure("pos:read")
    .input(quoteSchema)
    .query(async ({ input }) => {
      const { totals, customer } = await quoteCart(input);
      return { ...totals, customer };
    }),

  /** POST tạo hóa đơn — bắt buộc idempotencyKey */
  createInvoice: posPermissionProcedure("pos:write")
    .input(createInvoiceSchema)
    .mutation(async ({ input, ctx }) => createInvoice(input, await actorOf(ctx))),

  invoices: posPermissionProcedure("pos:read")
    .input(listInvoicesSchema)
    .query(({ input }) => listInvoices(input)),

  invoice: posPermissionProcedure("pos:read")
    .input(id)
    .query(({ input }) => getInvoice(input.id)),

  /** GET dữ liệu in hóa đơn */
  print: posPermissionProcedure("pos:read")
    .input(id)
    .query(({ input }) => printData(input.id)),

  /** DELETE hủy hóa đơn (trong ca đang mở) */
  cancelInvoice: posPermissionProcedure("pos:write")
    .input(cancelInvoiceSchema)
    .mutation(async ({ input, ctx }) => cancelInvoice(input, await actorOf(ctx))),

  /** POST đổi/trả hàng */
  refundInvoice: posPermissionProcedure("pos:write")
    .input(refundInvoiceSchema)
    .mutation(async ({ input, ctx }) => refundInvoice(input, await actorOf(ctx))),
});
