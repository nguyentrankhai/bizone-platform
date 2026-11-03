import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";
import { appRouter } from "@/server/routers";
import { createTRPCContext } from "@/server/trpc";

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext(req),
    onError({ error }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error("[tRPC]", error);
      }
    },
  });

export { handler as GET, handler as POST };
