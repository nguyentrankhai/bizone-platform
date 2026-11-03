import { router } from "@/server/trpc";

// Routers will be added here as modules are built (P2.x+)
// e.g. import { productRouter } from "./product";

export const appRouter = router({
  // placeholder — populated from P2.1 onward
});

export type AppRouter = typeof appRouter;
