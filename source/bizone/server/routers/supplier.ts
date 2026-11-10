import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { resolveDbUserId } from "@/server/services/user.service";
import * as supplier from "@/server/services/supplier.service";
import { assertFund } from "@/server/services/cashFund.service";
import {
  createSupplierSchema,
  listSuppliersSchema,
  priceComparisonSchema,
  recordPaymentSchema,
  supplierHistorySchema,
  updateSupplierSchema,
} from "@/lib/validators/supplier";

const idInput = z.object({ id: z.number().int().positive() });

/** Suppliers (SRS-SUP-01, 03, 04, 05) — purchase orders live in purchaseOrder.ts */
export const supplierRouter = router({
  list: permissionProcedure("supplier:read")
    .input(listSuppliersSchema)
    .query(({ input }) => supplier.listSuppliers(input)),

  options: permissionProcedure("supplier:read")
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(({ input }) => supplier.supplierOptions(input?.includeInactive)),

  get: permissionProcedure("supplier:read")
    .input(idInput)
    .query(({ input }) => supplier.getSupplier(input.id)),

  create: permissionProcedure("supplier:write")
    .input(createSupplierSchema)
    .mutation(({ input }) => supplier.createSupplier(input)),

  update: permissionProcedure("supplier:write")
    .input(updateSupplierSchema)
    .mutation(({ input }) => supplier.updateSupplier(input)),

  delete: permissionProcedure("supplier:write")
    .input(idInput)
    .mutation(({ input }) => supplier.deleteSupplier(input.id)),

  debts: permissionProcedure("supplier:read")
    .input(z.object({ supplierId: z.number().int().positive() }))
    .query(({ input }) => supplier.listSupplierDebts(input.supplierId)),

  recordPayment: permissionProcedure("supplier:manage_po")
    .input(recordPaymentSchema)
    .mutation(async ({ input, ctx }) => {
      const fund = input.fundId ? await assertFund(ctx.branch, input.fundId) : null;
      return supplier.recordSupplierPayment(
        input,
        await resolveDbUserId(ctx.user),
        fund?.branchId ?? ctx.branch.current,
      );
    }),

  history: permissionProcedure("supplier:read")
    .input(supplierHistorySchema)
    .query(({ input }) => supplier.supplierHistory(input)),

  priceComparison: permissionProcedure("supplier:read")
    .input(priceComparisonSchema)
    .query(({ input }) => supplier.priceComparison(input)),
});
