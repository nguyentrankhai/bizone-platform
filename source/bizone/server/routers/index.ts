import { router } from "@/server/trpc";
import { productRouter } from "./product";
import { categoryRouter } from "./category";
import { productSearchRouter } from "./productSearch";
import { warehouseRouter } from "./warehouse";
import { inventoryRouter } from "./inventory";
import { stockTakeRouter } from "./stockTake";
import { transferRouter } from "./transfer";

export const appRouter = router({
  product: productRouter,
  category: categoryRouter,
  productSearch: productSearchRouter,
  warehouse: warehouseRouter,
  inventory: inventoryRouter,
  stockTake: stockTakeRouter,
  transfer: transferRouter,
});

export type AppRouter = typeof appRouter;
