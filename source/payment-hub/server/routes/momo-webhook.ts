import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { ConnectorUnavailableError } from "@/services/connectors/registry";
import { momoResultPayload } from "@/services/connectors/momo";
import { txnCodeFromOrderId } from "@/services/connectors/momo/momo.util";
import { applyPaymentResult, resolveConnectorByCode } from "@/server/services/payment.service";

/**
 * POST /api/ipn/momo — MoMo IPN (server-to-server payment result, JSON body).
 *
 * MoMo expects HTTP 204 No Content once the notification is accepted. Processing is synchronous
 * (signature check + one conditional UPDATE, ~10 ms) so the status code reflects the outcome:
 *   204 applied / already final / still pending · 400 bad JSON, invalid signature, amount mismatch
 *   404 unknown order · 500 processing error.
 * A lost or failed IPN is recovered by the worker, which queries MoMo for Pending MoMo
 * transactions (server/jobs/syncPendingPayments.ts) — the "retry" path.
 */

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function fail(status: number, message: string): Response {
  return Response.json({ message }, { status });
}

export async function handleMomoIpn(req: NextRequest): Promise<Response> {
  const started = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Invalid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "Invalid body");

  const payload = momoResultPayload(body as Record<string, unknown>);
  const { orderId, signature } = payload;
  if (!orderId || !signature) return fail(400, "Invalid signature");
  const txnCode = txnCodeFromOrderId(orderId);

  try {
    const txn = await getPrisma().transaction.findUnique({
      where: { txnCode },
      select: { id: true, partnerConfigId: true },
    });

    // Verify with the secret of the partner config that created the payment (fallback-safe);
    // an unknown order is checked against the first Active MoMo config.
    const { connector } = await resolveConnectorByCode("momo", txn?.partnerConfigId);
    if (!connector.verifySignature(payload, signature)) {
      console.warn(`[momo-ipn] invalid signature order=${orderId}`);
      return fail(400, "Invalid signature");
    }
    if (!txn) return fail(404, "Order not found");

    const result = connector.processResult(payload);
    const applied = await applyPaymentResult(result, {
      endpoint: "/api/ipn/momo",
      createdBy: "partner:momo-ipn",
    });

    const ms = Date.now() - started;
    switch (applied.kind) {
      case "not_found":
        return fail(404, "Order not found");
      case "amount_mismatch":
        console.warn(`[momo-ipn] amount mismatch order=${orderId} (${ms}ms)`);
        return fail(400, "Invalid amount");
      case "pending":
        console.log(`[momo-ipn] order=${orderId} still pending (resultCode ${payload.resultCode})`);
        return noContent();
      case "already_final":
        return noContent();
      case "applied":
        console.log(`[momo-ipn] order=${orderId} → ${applied.status} (${ms}ms)`);
        return noContent();
    }
  } catch (e) {
    if (e instanceof ConnectorUnavailableError) console.error(`[momo-ipn] ${e.message}`);
    else console.error("[momo-ipn] error:", e instanceof Error ? e.message : e);
    return fail(500, "Unknown error");
  }
}
