import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import {
  listOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  createRefund,
  exportOrdersToExcel,
} from "@/server/services/order.service";
import {
  listOrdersSchema,
  createOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  createRefundSchema,
} from "@/lib/validators/order";
import { auditTrpcCall } from "@/server/middleware/auditLog";

export const orderRouter = router({
  /** GET /trpc/order.list */
  list: permissionProcedure("order:read")
    .input(listOrdersSchema)
    .query(async ({ input }) => {
      return listOrders(input);
    }),

  /** GET /trpc/order.get?id=... */
  get: permissionProcedure("order:read")
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getOrder(input.id);
    }),

  /** POST /trpc/order.create */
  create: permissionProcedure("order:write")
    .input(createOrderSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user ? parseInt(ctx.user.id) || null : null;
      const result = await createOrder(input, userId);
      void auditTrpcCall("order.create", ctx, result.id, null, { channel: result.channel });
      return result;
    }),

  /** PUT /trpc/order.updateStatus */
  updateStatus: permissionProcedure("order:write")
    .input(z.object({ id: z.number().int().positive(), data: updateOrderStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user ? parseInt(ctx.user.id) || null : null;
      const result = await updateOrderStatus(input.id, input.data, userId);
      void auditTrpcCall("order.updateStatus", ctx, input.id, null, { status: input.data.status });
      return result;
    }),

  /** POST /trpc/order.cancel */
  cancel: permissionProcedure("order:write")
    .input(z.object({ id: z.number().int().positive(), data: cancelOrderSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user ? parseInt(ctx.user.id) || null : null;
      const result = await cancelOrder(input.id, input.data, userId);
      void auditTrpcCall("order.cancel", ctx, input.id, null, { reason: input.data.reason });
      return result;
    }),

  /** POST /trpc/order.refund */
  refund: permissionProcedure("order:write")
    .input(z.object({ id: z.number().int().positive(), data: createRefundSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user ? parseInt(ctx.user.id) || null : null;
      const result = await createRefund(input.id, input.data, userId);
      void auditTrpcCall("order.refund", ctx, input.id, null, {
        itemCount: input.data.items.length,
      });
      return result;
    }),

  /** POST /trpc/order.exportExcel — returns base64 xlsx */
  exportExcel: permissionProcedure("order:read")
    .input(listOrdersSchema)
    .mutation(async ({ input }) => {
      const buffer = await exportOrdersToExcel(input);
      return { data: buffer.toString("base64") };
    }),
});
