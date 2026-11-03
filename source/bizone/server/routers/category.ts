import { z } from "zod";
import { router, permissionProcedure } from "@/server/trpc";
import {
  getCategoryTree,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from "@/server/services/product.service";
import {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
} from "@/lib/validators/product";

export const categoryRouter = router({
  /** GET /trpc/category.tree — danh sách phân cấp tối đa 5 cấp */
  tree: permissionProcedure("product:read").query(async () => {
    return getCategoryTree();
  }),

  /** POST /trpc/category.create */
  create: permissionProcedure("product:write")
    .input(createCategorySchema)
    .mutation(async ({ input }) => {
      return createCategory(input);
    }),

  /** PUT /trpc/category.update */
  update: permissionProcedure("product:write")
    .input(z.object({ id: z.number().int().positive(), data: updateCategorySchema }))
    .mutation(async ({ input }) => {
      return updateCategory(input.id, input.data);
    }),

  /** DELETE /trpc/category.delete */
  delete: permissionProcedure("product:write")
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteCategory(input.id);
      return { success: true };
    }),

  /** POST /trpc/category.reorder — drag-drop sort */
  reorder: permissionProcedure("product:write")
    .input(reorderCategoriesSchema)
    .mutation(async ({ input }) => {
      await reorderCategories(input);
      return { success: true };
    }),
});
