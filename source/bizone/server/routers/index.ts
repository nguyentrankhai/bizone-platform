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
import { supplierRouter } from "./supplier";
import { purchaseOrderRouter } from "./purchaseOrder";
import { couponRouter } from "./coupon";
import { flashSaleRouter } from "./flashSale";
import { promotionRouter } from "./promotion";
import { branchRouter } from "./branch";

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
  supplier: supplierRouter,
  purchaseOrder: purchaseOrderRouter,
  coupon: couponRouter,
  flashSale: flashSaleRouter,
  promotion: promotionRouter,
  branch: branchRouter,
});

export type AppRouter = typeof appRouter;
