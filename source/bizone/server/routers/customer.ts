import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { resolveDbUserId } from "@/server/services/user.service";
import {
  listCustomers,
  getCustomer,
  searchByPhone,
  createCustomer,
  updateCustomer,
  adjustLoyaltyPoints,
  createDebt,
  payDebt,
  mergeCustomers,
  exportCustomersToExcel,
} from "@/server/services/customer.service";
import {
  listCustomersSchema,
  createCustomerSchema,
  updateCustomerSchema,
  adjustPointsSchema,
  createDebtSchema,
  payDebtSchema,
  mergeCustomersSchema,
} from "@/lib/validators/customer";

export const customerRouter = router({
  list: permissionProcedure("crm:read")
    .input(listCustomersSchema)
    .query(({ input }) => listCustomers(input)),

  get: permissionProcedure("crm:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getCustomer(input.id)),

  searchByPhone: permissionProcedure("crm:read")
    .input(z.object({ phone: z.string().min(3) }))
    .query(({ input }) => searchByPhone(input.phone)),

  create: permissionProcedure("crm:write")
    .input(createCustomerSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user ? await resolveDbUserId(ctx.user) : null;
      return createCustomer(input, userId);
    }),

  update: permissionProcedure("crm:write")
    .input(z.object({ id: z.number().int().positive(), data: updateCustomerSchema }))
    .mutation(({ input }) => updateCustomer(input.id, input.data)),

  adjustPoints: permissionProcedure("crm:manage_points")
    .input(z.object({ customerId: z.number().int().positive(), data: adjustPointsSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user ? await resolveDbUserId(ctx.user) : null;
      return adjustLoyaltyPoints(input.customerId, input.data, userId);
    }),

  createDebt: permissionProcedure("crm:manage_debt")
    .input(z.object({ customerId: z.number().int().positive(), data: createDebtSchema }))
    .mutation(({ input }) => createDebt(input.customerId, input.data)),

  payDebt: permissionProcedure("crm:manage_debt")
    .input(z.object({ customerId: z.number().int().positive(), data: payDebtSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user ? await resolveDbUserId(ctx.user) : null;
      return payDebt(input.customerId, input.data, userId);
    }),

  merge: permissionProcedure("crm:write")
    .input(mergeCustomersSchema)
    .mutation(({ input }) => mergeCustomers(input)),

  exportExcel: permissionProcedure("crm:read")
    .input(listCustomersSchema)
    .mutation(async ({ input }) => {
      const buf = await exportCustomersToExcel(input);
      return { data: buf.toString("base64") };
    }),
});
