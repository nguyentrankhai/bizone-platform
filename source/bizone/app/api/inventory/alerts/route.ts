import { connection, type NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";
import { lowStockChannel } from "@/lib/inventory/channels";
import { isKnownTenant } from "@/lib/tenant";
const HEARTBEAT_MS = 25_000;

/**
 * GET /api/inventory/alerts — Server-Sent Events relaying low-stock alerts that
 * confirmTransaction publishes on Redis "bizone:low-stock:{tenantId}" — only the caller's
 * tenant channel is relayed. Auth (Bearer + X-Tenant-ID matching the token) is enforced by proxy.ts; clients read it with
 * fetch() streaming since EventSource cannot send an Authorization header.
 */
export async function GET(request: NextRequest) {
  await connection();
  // proxy.ts already checked that X-Tenant-ID matches the token's tenant claim
  const tenantId = request.headers.get("x-tenant-id");
  if (!isKnownTenant(tenantId)) {
    return Response.json(
      { success: false, error: { code: "FORBIDDEN", message: "Tenant is not provisioned" } },
      { status: 403 },
    );
  }
  const channel = lowStockChannel(tenantId);
  const sub = getRedis().duplicate();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const close = () => {
    clearInterval(heartbeat);
    sub.disconnect();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      sub.on("message", (_channel, message) => send(`event: low-stock\ndata: ${message}\n\n`));
      await sub.subscribe(channel);
      send(": connected\n\n");
      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      request.signal.addEventListener("abort", () => {
        close();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel: close,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
