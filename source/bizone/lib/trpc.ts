import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      // Callers pass auth headers per call: `{ context: { headers } }`.
      // A batch shares one HTTP request, so take headers from the first op.
      headers({ opList }) {
        return (opList[0]?.context.headers as Record<string, string> | undefined) ?? {};
      },
    }),
  ],
});
