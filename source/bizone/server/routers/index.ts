import { router } from "@/server/trpc";
import { productRouter } from "./product";
import { categoryRouter } from "./category";
import { productSearchRouter } from "./productSearch";

export const appRouter = router({
  product: productRouter,
  category: categoryRouter,
  productSearch: productSearchRouter,
});

export type AppRouter = typeof appRouter;
