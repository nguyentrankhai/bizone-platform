import { z } from "zod";
import { router, permissionProcedure, protectedProcedure } from "@/server/trpc";
import {
  createBranchSchema,
  setBranchConfigSchema,
  updateBranchSchema,
} from "@/lib/validators/branch";
import {
  branchConfig,
  createBranch,
  deleteBranch,
  getBranch,
  listBranches,
  myBranches,
  setBranchConfig,
  setBranchStatus,
  setDefaultBranch,
  updateBranch,
} from "@/server/services/branch.service";
import { assertBranch, resolveBranchScope } from "@/server/middleware/branchScope";
import { getStaffAccess } from "@/server/services/rbac.service";

const id = z.object({ id: z.number().int().positive() });

export const branchRouter = router({
  /**
   * Chi nhánh người dùng được mở (BranchSwitcher). Any signed-in staff: the scope ignores the
   * X-Branch-ID header here so a stale selection can't lock the switcher out.
   */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const access = await getStaffAccess(ctx.user!);
    return myBranches(await resolveBranchScope(ctx.user!, access, null));
  }),

  list: permissionProcedure("config:read")
    .input(z.object({ includeInactive: z.boolean().default(true) }).optional())
    .query(({ input }) => listBranches(input?.includeInactive ?? true)),

  get: permissionProcedure("config:read")
    .input(id)
    .query(({ input, ctx }) => {
      // QA-3 (#99): branch managers see their branches only (admins also inactive ones)
      if (!ctx.branch.canAll) assertBranch(ctx.branch, input.id);
      return getBranch(input.id);
    }),

  create: permissionProcedure("config:write")
    .input(createBranchSchema)
    .mutation(({ input }) => createBranch(input)),

  update: permissionProcedure("config:write")
    .input(updateBranchSchema)
    .mutation(({ input }) => updateBranch(input)),

  setStatus: permissionProcedure("config:write")
    .input(id.extend({ status: z.enum(["active", "inactive"]) }))
    .mutation(({ input }) => setBranchStatus(input.id, input.status)),

  setDefault: permissionProcedure("config:write")
    .input(id)
    .mutation(({ input }) => setDefaultBranch(input.id)),

  delete: permissionProcedure("config:write")
    .input(id)
    .mutation(({ input }) => deleteBranch(input.id)),

  config: permissionProcedure("config:read")
    .input(z.object({ branchId: z.number().int().positive() }))
    .query(({ input, ctx }) => {
      // QA-3 (#99): no reading the bank account of other branches
      if (!ctx.branch.canAll) assertBranch(ctx.branch, input.branchId);
      return branchConfig(input.branchId);
    }),

  setConfig: permissionProcedure("config:write")
    .input(setBranchConfigSchema)
    .mutation(({ input }) => setBranchConfig(input)),
});
