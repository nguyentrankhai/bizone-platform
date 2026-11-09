import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import { resolveDbUserId } from "@/server/services/user.service";
import * as coupon from "@/server/services/coupon.service";
import {
  couponUsageSchema,
  createCouponSchema,
  issueVouchersSchema,
  listCouponsSchema,
  listVouchersSchema,
  toggleSchema,
  updateCouponSchema,
} from "@/lib/validators/marketing";

const idInput = z.object({ id: z.number().int().positive() });

/** Coupons (SRS-MKT-01) + personal vouchers (SRS-MKT-02). POS applies them in pricing.service */
export const couponRouter = router({
  list: permissionProcedure("marketing:coupon")
    .input(listCouponsSchema)
    .query(({ input }) => coupon.listCoupons(input)),
  options: permissionProcedure("marketing:coupon").query(() => coupon.couponOptions()),
  get: permissionProcedure("marketing:coupon")
    .input(idInput)
    .query(({ input }) => coupon.getCoupon(input.id)),
  create: permissionProcedure("marketing:coupon")
    .input(createCouponSchema)
    .mutation(async ({ input, ctx }) =>
      coupon.createCoupon(input, await resolveDbUserId(ctx.user)),
    ),
  update: permissionProcedure("marketing:coupon")
    .input(updateCouponSchema)
    .mutation(({ input }) => coupon.updateCoupon(input)),
  setActive: permissionProcedure("marketing:coupon")
    .input(toggleSchema)
    .mutation(({ input }) => coupon.setCouponActive(input.id, input.isActive)),
  delete: permissionProcedure("marketing:coupon")
    .input(idInput)
    .mutation(({ input }) => coupon.deleteCoupon(input.id)),
  usage: permissionProcedure("marketing:coupon")
    .input(couponUsageSchema)
    .query(({ input }) => coupon.couponUsageHistory(input)),

  issueVouchers: permissionProcedure("marketing:coupon")
    .input(issueVouchersSchema)
    .mutation(({ input }) => coupon.issueVouchers(input)),
  vouchers: permissionProcedure("marketing:coupon")
    .input(listVouchersSchema)
    .query(({ input }) => coupon.listVouchers(input)),
  cancelVoucher: permissionProcedure("marketing:coupon")
    .input(idInput)
    .mutation(({ input }) => coupon.cancelVoucher(input.id)),
});
