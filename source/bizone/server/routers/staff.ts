import {
  assertBranchOrAll,
  branchFilter,
  resolveBranchScope,
  scopedStaffIds,
  type BranchScope,
} from "@/server/middleware/branchScope";
import { z } from "zod";
import { bizoneError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { activeBranches } from "@/server/services/posCatalog.service";
import { permissionProcedure, router, staffSelfProcedure } from "@/server/trpc";
import {
  assignShiftSchema,
  attendanceNoteSchema,
  calendarSchema,
  commissionRuleSchema,
  createStaffSchema,
  listCommissionsSchema,
  listStaffSchema,
  monthSchema,
  payCommissionsSchema,
  resetPasswordSchema,
  roleInputSchema,
  salesSchema,
  setStaffActiveSchema,
  setStaffRolesSchema,
  shiftInputSchema,
  timesheetSchema,
  updateCommissionRuleSchema,
  updateRoleSchema,
  updateShiftSchema,
  updateStaffSchema,
} from "@/lib/validators/staff";
import * as staff from "@/server/services/staff.service";
import * as shifts from "@/server/services/shift.service";
import * as attendance from "@/server/services/attendance.service";
import * as commission from "@/server/services/commission.service";
import { resolveDbUserId } from "@/server/services/user.service";
import { getStaffAccess } from "@/server/services/rbac.service";
import type { AuthUser } from "@/types/auth";

const idInput = z.object({ id: z.number().int().positive() });

/** An admin must keep an admin system role — otherwise they could lock the shop out */
async function guardSelfDemotion(actor: AuthUser, targetId: number, roleIds: number[]) {
  if (!actor.roles.includes("bizone-admin")) return;
  if ((await resolveDbUserId(actor)) !== targetId) return;
  const admin = await getPrisma().role.findUnique({
    where: { code: "admin" },
    select: { id: true },
  });
  if (admin && !roleIds.includes(admin.id)) {
    throw bizoneError("CONFLICT", "Không thể tự gỡ vai trò Quản trị viên của mình");
  }
}

const roleRouter = router({
  list: permissionProcedure("staff:read").query(() => staff.listRoles()),
  permissions: permissionProcedure("staff:read").query(() => staff.permissionCatalog()),
  create: permissionProcedure("staff:write")
    .input(roleInputSchema)
    .mutation(({ input }) => staff.createRole(input)),
  update: permissionProcedure("staff:write")
    .input(updateRoleSchema)
    .mutation(({ input }) => staff.updateRole(input)),
  delete: permissionProcedure("staff:write")
    .input(idInput)
    .mutation(({ input }) => staff.deleteRole(input.id)),
});

/** QA-3 (#96): the shift belongs to a branch in scope (store-wide shifts: admins only) */
async function assertShift(scope: BranchScope, shiftId: number) {
  const shift = await getPrisma().shift.findUnique({
    where: { id: shiftId },
    select: { branchId: true },
  });
  if (!shift) throw bizoneError("NOT_FOUND", `Ca làm việc #${shiftId} không tồn tại`);
  assertBranchOrAll(scope, shift.branchId);
}

async function assertStaffInScope(scope: BranchScope, userIds: number[]) {
  const allowed = await scopedStaffIds(scope);
  if (!allowed) return;
  const outside = userIds.filter((id) => !allowed.includes(id));
  if (outside.length)
    throw bizoneError("FORBIDDEN", `Nhân viên #${outside.join(", #")} thuộc chi nhánh khác`);
}

const shiftRouter = router({
  list: permissionProcedure("staff:read")
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(({ input }) => shifts.listShifts(input?.includeInactive)),
  // QA-3 (#96): shifts of other branches / store-wide shifts are off limits for branch managers
  create: permissionProcedure("staff:manage_shift")
    .input(shiftInputSchema)
    .mutation(({ input, ctx }) => {
      assertBranchOrAll(ctx.branch, input.branchId);
      return shifts.createShift(input);
    }),
  update: permissionProcedure("staff:manage_shift")
    .input(updateShiftSchema)
    .mutation(async ({ input, ctx }) => {
      await assertShift(ctx.branch, input.id);
      if (input.branchId !== undefined) assertBranchOrAll(ctx.branch, input.branchId);
      return shifts.updateShift(input);
    }),
  delete: permissionProcedure("staff:manage_shift")
    .input(idInput)
    .mutation(async ({ input, ctx }) => {
      await assertShift(ctx.branch, input.id);
      return shifts.deleteShift(input.id);
    }),
  assign: permissionProcedure("staff:manage_shift")
    .input(assignShiftSchema)
    .mutation(async ({ input, ctx }) => {
      await assertShift(ctx.branch, input.shiftId);
      await assertStaffInScope(ctx.branch, input.userIds);
      return shifts.assignShift(input);
    }),
  unassign: permissionProcedure("staff:manage_shift")
    .input(idInput)
    .mutation(async ({ input, ctx }) => {
      const row = await getPrisma().shiftAssignment.findUnique({
        where: { id: input.id },
        select: { shiftId: true },
      });
      if (row) await assertShift(ctx.branch, row.shiftId);
      return shifts.unassignShift(input.id);
    }),
  calendar: permissionProcedure("staff:read")
    .input(calendarSchema)
    .query(({ input, ctx }) =>
      // P4.6: shifts of the branch the user works on unless one is picked
      shifts.shiftCalendar({ ...input, branchId: branchFilter(ctx.branch, input.branchId) }),
    ),
});

const attendanceRouter = router({
  /** Any active staff member: own status today */
  me: staffSelfProcedure.query(({ ctx }) => attendance.myToday(ctx.user)),
  checkIn: staffSelfProcedure
    .input(attendanceNoteSchema)
    .mutation(({ ctx, input }) => attendance.checkIn(ctx.user, input.notes)),
  checkOut: staffSelfProcedure
    .input(attendanceNoteSchema)
    .mutation(({ ctx, input }) => attendance.checkOut(ctx.user, input.notes)),
  /** Own timesheet for anyone; other people's needs staff:manage_attendance */
  timesheet: staffSelfProcedure.input(timesheetSchema).query(async ({ ctx, input }) => {
    const access = await getStaffAccess(ctx.user);
    if (hasPermission(ctx.user, "staff:manage_attendance", access.capabilities)) {
      // QA-3 (#96): staff of the manager's branches only
      const scope = await resolveBranchScope(ctx.user, access, null);
      const userIds = await scopedStaffIds(scope);
      if (input.userId && userIds && !userIds.includes(input.userId))
        throw bizoneError("FORBIDDEN", "Nhân viên thuộc chi nhánh khác");
      return attendance.timesheet({ ...input, ...(userIds ? { userIds } : {}) });
    }
    const self = await resolveDbUserId(ctx.user);
    if (!self) throw bizoneError("FORBIDDEN", "Chưa có hồ sơ nhân viên");
    return attendance.timesheet({ ...input, userId: self });
  }),
});

const commissionRouter = router({
  rules: permissionProcedure("staff:read").query(() => commission.listRules()),
  createRule: permissionProcedure("staff:manage_commission")
    .input(commissionRuleSchema)
    .mutation(({ input }) => commission.createRule(input)),
  updateRule: permissionProcedure("staff:manage_commission")
    .input(updateCommissionRuleSchema)
    .mutation(({ input }) => commission.updateRule(input)),
  list: permissionProcedure("staff:manage_commission")
    .input(listCommissionsSchema)
    .query(async ({ input, ctx }) => {
      const userIds = await scopedStaffIds(ctx.branch); // QA-3 (#96)
      return commission.listCommissions({ ...input, ...(userIds ? { userIds } : {}) });
    }),
  /** Rebuild pending commissions now (normally done by the worker after each sale / month end) */
  recalculate: permissionProcedure("staff:manage_commission")
    .input(monthSchema)
    .mutation(({ input }) => commission.recalculateAll(input.month, input.userId)),
  pay: permissionProcedure("staff:manage_commission")
    .input(payCommissionsSchema)
    .mutation(({ input }) => commission.payCommissions(input)),
});

export const staffRouter = router({
  list: permissionProcedure("staff:read")
    .input(listStaffSchema)
    .query(({ input }) => staff.listStaff(input)),
  get: permissionProcedure("staff:read")
    .input(idInput)
    .query(({ input }) => staff.getStaff(input.id)),
  branches: permissionProcedure("staff:read").query(() => activeBranches()),
  create: permissionProcedure("staff:write")
    .input(createStaffSchema)
    .mutation(({ input }) => staff.createStaff(input)),
  update: permissionProcedure("staff:write")
    .input(updateStaffSchema)
    .mutation(({ input }) => staff.updateStaff(input)),
  setRoles: permissionProcedure("staff:write")
    .input(setStaffRolesSchema)
    .mutation(async ({ ctx, input }) => {
      await guardSelfDemotion(
        ctx.user,
        input.id,
        input.roles.map((r) => r.roleId),
      );
      return staff.setStaffRoles(input.id, input.roles);
    }),
  setActive: permissionProcedure("staff:write")
    .input(setStaffActiveSchema)
    .mutation(({ ctx, input }) => staff.setStaffActive(input.id, input.active, ctx.user)),
  resetPassword: permissionProcedure("staff:write")
    .input(resetPasswordSchema)
    .mutation(({ input }) => staff.resetStaffPassword(input.id, input.password, input.temporary)),
  /** Sales performance per seller (revenue, invoices, average); top products when userId given */
  sales: permissionProcedure("staff:read")
    .input(salesSchema)
    .query(async ({ input, ctx }) => {
      const userIds = await scopedStaffIds(ctx.branch); // QA-3 (#96)
      return commission.staffSales({ ...input, ...(userIds ? { userIds } : {}) });
    }),
  role: roleRouter,
  shift: shiftRouter,
  attendance: attendanceRouter,
  commission: commissionRouter,
});
