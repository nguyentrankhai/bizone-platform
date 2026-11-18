import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { oidc } from "@/lib/session-client";

interface CallContext {
  headers?: Record<string, string>;
  /** set by `apiContext()` for the browser session (P6.7) */
  session?: boolean;
}

/** fetch for tRPC: a 401 on a session request → refresh the token once and retry. */
async function sessionFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 401 || typeof window === "undefined") return res;
  const sent = new Headers(init?.headers).get("authorization");
  const current = oidc.currentToken();
  if (!current || sent !== `Bearer ${current}`) return res; // not a session request
  const fresh = await oidc.refresh();
  if (!fresh) return res; // session ended → RequireAuth sends the user to Keycloak
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${fresh.accessToken}`);
  return fetch(url, { ...init, headers });
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      // Callers pass auth headers per call: `{ context: { headers } }`.
      // A batch shares one HTTP request, so take headers from the first op.
      async headers({ opList }) {
        const ctx = (opList[0]?.context ?? {}) as CallContext;
        const headers = { ...ctx.headers };
        if (ctx.session && typeof window !== "undefined") {
          const token = await oidc.getAccessToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }
        return headers;
      },
      fetch: sessionFetch,
    }),
  ],
});
