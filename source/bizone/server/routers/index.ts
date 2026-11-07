import { router } from "@/server/trpc";
import { productRouter } from "./product";
import { categoryRouter } from "./category";
import { productSearchRouter } from "./productSearch";
import { warehouseRouter } from "./warehouse";
import { inventoryRouter } from "./inventory";
import { stockTakeRouter } from "./stockTake";
import { transferRouter } from "./transfer";
import { posRouter } from "./pos";
import { orderRouter } from "./order";
import { customerRouter } from "./customer";
import { dashboardRouter } from "./dashboard";
import { auditLogRouter } from "./auditLog";
import { staffRouter } from "./staff";
import { reportsRouter } from "./reports";

export const appRouter = router({
  product: productRouter,
  category: categoryRouter,
  productSearch: productSearchRouter,
  warehouse: warehouseRouter,
  inventory: inventoryRouter,
  stockTake: stockTakeRouter,
  transfer: transferRouter,
  pos: posRouter,
  order: orderRouter,
  customer: customerRouter,
  dashboard: dashboardRouter,
  auditLog: auditLogRouter,
  staff: staffRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
