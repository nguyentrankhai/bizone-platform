import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { resolveDbUserId } from "@/server/services/user.service";
import * as funds from "@/server/services/cashFund.service";
import * as ledger from "@/server/services/ledger.service";
import * as reports from "@/server/services/accountingReport.service";
import {
  adjustFundSchema,
  cancelRecordSchema,
  createCategorySchema,
  createFundSchema,
  createRecordSchema,
  debtSummarySchema,
  depositSessionSchema,
  fundLedgerSchema,
  listFundsSchema,
  listRecordsSchema,
  periodSchema,
  reconciliationSchema,
  sessionsToDepositSchema,
  transferSchema,
  updateCategorySchema,
  updateFundSchema,
  updateRecordSchema,
} from "@/lib/validators/accounting";

const idInput = z.object({ id: z.number().int().positive() });

/**
 * Kế toán & Tài chính (SRS-ACC-01…05): quỹ, sổ quỹ, phiếu thu / chi, danh mục thu chi,
 * công nợ tổng hợp, lời lỗ, dòng tiền, đối soát thanh toán.
 * Quyền: accounting:read (xem) · accounting:fund (quỹ, chuyển / kiểm quỹ, nộp tiền ca) ·
 * accounting:revenue_expense (phiếu + danh mục) · accounting:debt (công nợ tổng hợp).
 */
export const accountingRouter = router({
  overview: permissionProcedure("accounting:read")
    .input(periodSchema)
    .query(({ input, ctx }) => reports.overview(input, ctx.branch)),

  // ─── Quỹ ──────────────────────────────────────────────────────────────────
  funds: permissionProcedure("accounting:read")
    .input(listFundsSchema)
    .query(({ input, ctx }) => funds.listFunds(input, ctx.branch)),

  /** Fund picker for receipts / payments and for supplier / customer debt payments */
  fundOptions: permissionProcedure([
    "accounting:read",
    "accounting:revenue_expense",
    "supplier:manage_po",
    "crm:manage_debt",
  ]).query(({ ctx }) => funds.fundOptions(ctx.branch)),

  createFund: permissionProcedure("accounting:fund")
    .input(createFundSchema)
    .mutation(async ({ input, ctx }) =>
      funds.createFund(input, ctx.branch, await resolveDbUserId(ctx.user)),
    ),

  updateFund: permissionProcedure("accounting:fund")
    .input(updateFundSchema)
    .mutation(({ input, ctx }) => funds.updateFund(input, ctx.branch)),

  transfer: permissionProcedure("accounting:fund")
    .input(transferSchema)
    .mutation(async ({ input, ctx }) =>
      funds.transferFunds(input, ctx.branch, await resolveDbUserId(ctx.user)),
    ),

  adjustFund: permissionProcedure("accounting:fund")
    .input(adjustFundSchema)
    .mutation(async ({ input, ctx }) =>
      funds.adjustFund(input, ctx.branch, await resolveDbUserId(ctx.user)),
    ),

  ledger: permissionProcedure("accounting:read")
    .input(fundLedgerSchema)
    .query(({ input, ctx }) => funds.fundLedger(input, ctx.branch)),

  sessionsToDeposit: permissionProcedure("accounting:read")
    .input(sessionsToDepositSchema)
    .query(({ input, ctx }) => funds.sessionsToDeposit(input.days, ctx.branch)),

  depositSession: permissionProcedure("accounting:fund")
    .input(depositSessionSchema)
    .mutation(async ({ input, ctx }) =>
      funds.depositSession(input, ctx.branch, await resolveDbUserId(ctx.user)),
    ),

  // ─── Danh mục thu chi ─────────────────────────────────────────────────────
  categories: permissionProcedure(["accounting:read", "accounting:revenue_expense"]).query(() =>
    ledger.categoryTree(),
  ),

  createCategory: permissionProcedure("accounting:revenue_expense")
    .input(createCategorySchema)
    .mutation(({ input }) => ledger.createCategory(input)),

  updateCategory: permissionProcedure("accounting:revenue_expense")
    .input(updateCategorySchema)
    .mutation(({ input }) => ledger.updateCategory(input)),

  deleteCategory: permissionProcedure("accounting:revenue_expense")
    .input(idInput)
    .mutation(({ input }) => ledger.deleteCategory(input.id)),

  // ─── Phiếu thu / chi ──────────────────────────────────────────────────────
  records: permissionProcedure("accounting:read")
    .input(listRecordsSchema)
    .query(({ input, ctx }) => ledger.listRecords(input, ctx.branch)),

  record: permissionProcedure("accounting:read")
    .input(idInput)
    .query(({ input, ctx }) => ledger.getRecord(input.id, ctx.branch)),

  createRecord: permissionProcedure("accounting:revenue_expense")
    .input(createRecordSchema)
    .mutation(async ({ input, ctx }) =>
      ledger.createRecord(input, ctx.branch, await resolveDbUserId(ctx.user)),
    ),

  updateRecord: permissionProcedure("accounting:revenue_expense")
    .input(updateRecordSchema)
    .mutation(async ({ input, ctx }) =>
      ledger.updateRecord(input, ctx.branch, await resolveDbUserId(ctx.user)),
    ),

  cancelRecord: permissionProcedure("accounting:revenue_expense")
    .input(cancelRecordSchema)
    .mutation(async ({ input, ctx }) =>
      ledger.cancelRecord(input, ctx.branch, await resolveDbUserId(ctx.user)),
    ),

  // ─── Công nợ & báo cáo ────────────────────────────────────────────────────
  debts: permissionProcedure("accounting:debt")
    .input(debtSummarySchema)
    .query(({ input }) => reports.debtSummary(input)),

  profitLoss: permissionProcedure("accounting:read")
    .input(periodSchema)
    .query(({ input, ctx }) => reports.profitLoss(input, ctx.branch)),

  cashFlow: permissionProcedure("accounting:read")
    .input(periodSchema)
    .query(({ input, ctx }) => reports.cashFlow(input, ctx.branch)),

  reconciliation: permissionProcedure("accounting:read")
    .input(reconciliationSchema)
    .query(({ input, ctx }) => reports.reconciliation(input, ctx.branch)),
});
