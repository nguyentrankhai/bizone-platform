import type { Instrumentation } from "next";

/**
 * Observability hooks of the Next app (P7.5). `register` runs once per server instance;
 * `onRequestError` receives every error Next captures in route handlers, pages, server actions
 * and the proxy → Sentry (lib/sentry.ts, off without SENTRY_DSN). Background processes (worker,
 * realtime, monitor) call `installProcessHandlers` themselves.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initSentry } = await import("@/lib/sentry");
  initSentry("app");
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureException, flushSentry } = await import("@/lib/sentry");
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  captureException(err, {
    tags: { route: context.routePath, routeType: context.routeType },
    extra: { digest, renderSource: context.renderSource },
    request: { method: request.method, path: request.path, headers: request.headers },
  });
  await flushSentry(2000);
};
