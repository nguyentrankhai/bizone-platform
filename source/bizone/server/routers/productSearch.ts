import { router, permissionProcedure } from "@/server/trpc";
import { searchProducts } from "@/server/services/product.service";
import { searchProductsSchema } from "@/lib/validators/product";

export const productSearchRouter = router({
  /**
   * GET /trpc/productSearch.search?q=...
   * Redis cache 5 phút, mục tiêu <300ms
   */
  search: permissionProcedure("product:read")
    .input(searchProductsSchema)
    .query(({ input }) => {
      return searchProducts(input);
    }),
});
