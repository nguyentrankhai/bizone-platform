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
  exchangeQuoteSchema,
  exchangeSchema,
  createPreorderSchema,
  listPreordersSchema,
  completePreorderSchema,
  cancelPreorderSchema,
  createPayhubIntentSchema,
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
  exchangeInvoice,
  exchangeQuote,
} from "@/server/services/invoice.service";
import {
  cancelPreorder,
  completePreorder,
  createPreorder,
  getPreorder,
  listPreorders,
  preorderQuote,
} from "@/server/services/preorder.service";
import {
  cancelIntent,
  createIntent,
  intentStatus,
  openIntents,
} from "@/server/services/payhubPayment.service";
import { createPairingPin } from "@/server/services/posPairing.service";
import { findProductByCode, loadCartLines, quoteCart } from "@/server/services/pricing.service";
import { ensureDbUserId } from "@/server/services/user.service";
import { assertBranch, branchFilter } from "@/server/middleware/branchScope";
import { getPrisma } from "@/lib/prisma";
import {
  activeBranches,
  findCustomers,
  posCatalog,
  storeInfo,
} from "@/server/services/posCatalog.service";

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
    .mutation(async ({ input, ctx }) => {
      assertBranch(ctx.branch, input.branchId); // P4.6: only branches of the user's scope
      return openSession(input, await actorOf(ctx));
    }),

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
    .query(({ input, ctx }) =>
      listSessions({ ...input, branchId: branchFilter(ctx.branch, input.branchId) }),
    ),

  session: posPermissionProcedure("pos:read")
    .input(id)
    .query(({ input }) => getSession(input.id)),

  /** GET tổng kết ca */
  sessionSummary: posPermissionProcedure("pos:read")
    .input(id)
    .query(({ input }) => sessionSummary(input.id)),

  // ── Selling ────────────────────────────────────────────────────────────────

  /** Chi nhánh đang hoạt động (chọn khi mở ca) */
  branches: posPermissionProcedure("pos:read").query(({ ctx }) =>
    activeBranches(ctx.branch.allowed),
  ),

  /** Thông tin cửa hàng + tài khoản ngân hàng cho VietQR */
  storeInfo: posPermissionProcedure("pos:read")
    .input(z.object({ sessionId: z.number().int().positive() }).optional())
    .query(async ({ input }) => {
      // P4.6: per-branch name / bank account — the branch of the shift being sold on
      const session = input?.sessionId
        ? await getPrisma().cashSession.findUnique({
            where: { id: input.sessionId },
            select: { branchId: true },
          })
        : null;
      return storeInfo(session?.branchId);
    }),

  /** Lưới sản phẩm POS: giá bán + tồn tại kho bán của chi nhánh */
  catalog: posPermissionProcedure("pos:read")
    .input(
      z.object({
        branchId: z.number().int().positive(),
        categoryId: z.number().int().positive().optional(),
        search: z.string().max(100).optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().min(1).max(100).default(48),
      }),
    )
    .query(({ input, ctx }) => {
      assertBranch(ctx.branch, input.branchId);
      return posCatalog(input);
    }),

  /** Tìm khách theo SĐT / tên / mã */
  customers: posPermissionProcedure("pos:read")
    .input(z.object({ q: z.string().trim().min(2).max(100) }))
    .query(({ input }) => findCustomers(input.q)),

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
    .query(({ input, ctx }) =>
      listInvoices({ ...input, branchId: branchFilter(ctx.branch, input.branchId) }),
    ),

  invoice: posPermissionProcedure("pos:read")
    .input(id)
    .query(async ({ input, ctx }) => {
      const inv = await getInvoice(input.id);
      assertBranch(ctx.branch, inv.branchId);
      return inv;
    }),

  /** GET dữ liệu in hóa đơn */
  print: posPermissionProcedure("pos:read")
    .input(id)
    .query(async ({ input, ctx }) => {
      const inv = await getPrisma().invoice.findUnique({
        where: { id: input.id },
        select: { branchId: true },
      });
      assertBranch(ctx.branch, inv?.branchId);
      return printData(input.id);
    }),

  /** DELETE hủy hóa đơn (trong ca đang mở) */
  cancelInvoice: posPermissionProcedure("pos:write")
    .input(cancelInvoiceSchema)
    .mutation(async ({ input, ctx }) => cancelInvoice(input, await actorOf(ctx))),

  /** POST đổi/trả hàng */
  refundInvoice: posPermissionProcedure("pos:write")
    .input(refundInvoiceSchema)
    .mutation(async ({ input, ctx }) => refundInvoice(input, await actorOf(ctx))),

  // ── P4.5: đổi hàng ─────────────────────────────────────────────────────────

  /** Xem trước đổi hàng: tiền hàng trả, hoá đơn mới, chênh lệch */
  exchangeQuote: posPermissionProcedure("pos:read")
    .input(exchangeQuoteSchema)
    .query(({ input }) => exchangeQuote(input)),

  /** Đổi hàng: phiếu trả + hoá đơn mới trong một transaction (idempotent) */
  exchange: posPermissionProcedure("pos:write")
    .input(exchangeSchema)
    .mutation(async ({ input, ctx }) => exchangeInvoice(input, await actorOf(ctx))),

  // ── P4.5: đặt trước + cọc ──────────────────────────────────────────────────

  preorders: posPermissionProcedure("pos:read")
    .input(listPreordersSchema)
    .query(({ input, ctx }) =>
      listPreorders({ ...input, branchId: branchFilter(ctx.branch, input.branchId) }),
    ),

  preorder: posPermissionProcedure("pos:read")
    .input(id)
    .query(({ input }) => getPreorder(input.id)),

  /** Giá lúc giao (tính lại), cọc cấn trừ, còn phải trả */
  preorderQuote: posPermissionProcedure("pos:read")
    .input(id)
    .query(({ input }) => preorderQuote(input.id)),

  createPreorder: posPermissionProcedure("pos:write")
    .input(createPreorderSchema)
    .mutation(async ({ input, ctx }) => createPreorder(input, await actorOf(ctx))),

  completePreorder: posPermissionProcedure("pos:write")
    .input(completePreorderSchema)
    .mutation(async ({ input, ctx }) => completePreorder(input, await actorOf(ctx))),

  cancelPreorder: posPermissionProcedure("pos:write")
    .input(cancelPreorderSchema)
    .mutation(async ({ input, ctx }) => cancelPreorder(input, await actorOf(ctx))),

  // ── P4.5: thẻ / QR qua Payment Hub ─────────────────────────────────────────

  /** Tạo GD Payment Hub (QR VietQR tự xác nhận / trang thanh toán thẻ) */
  payhubCreate: posPermissionProcedure("pos:write")
    .input(createPayhubIntentSchema)
    .mutation(async ({ input, ctx }) => createIntent(input, await actorOf(ctx))),

  /** Trạng thái (tự hỏi Payment Hub khi webhook chưa về) */
  payhubStatus: posPermissionProcedure("pos:read")
    .input(id)
    .query(async ({ input, ctx }) => intentStatus(input.id, await actorOf(ctx))),

  payhubCancel: posPermissionProcedure("pos:write")
    .input(id)
    .mutation(async ({ input, ctx }) => cancelIntent(input.id, await actorOf(ctx))),

  /** Thanh toán Payment Hub đang chờ / đã trả mà chưa gắn hoá đơn của ca */
  payhubOpen: posPermissionProcedure("pos:read")
    .input(z.object({ cashSessionId: z.number().int().positive() }))
    .query(({ input }) => openIntents(input.cashSessionId)),

  // ── P4.5: ghép cặp màn hình khách ──────────────────────────────────────────

  /** Mã PIN 6 số (5 phút, dùng 1 lần) để màn hình khách khác thiết bị kết nối vào ca */
  createPairingPin: posPermissionProcedure("pos:write")
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => createPairingPin(input.sessionId, await actorOf(ctx))),
});
