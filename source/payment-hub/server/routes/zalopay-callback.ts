import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { ConnectorUnavailableError } from "@/services/connectors/registry";
import { parseCallbackData } from "@/services/connectors/zalopay";
import { txnCodeFromAppTransId } from "@/services/connectors/zalopay/zalopay.util";
import { applyPaymentResult, resolveConnectorByCode } from "@/server/services/payment.service";

/**
 * POST /api/ipn/zalopay — ZaloPay callback (server-to-server, sent only for paid orders).
 *
 * Body `{ data: "<JSON string>", mac, type }`, mac = HMAC-SHA256(key2, data). ZaloPay expects
 * HTTP 200 with `{ return_code, return_message }`:
 *   1  accepted — applied, already final or duplicate (ZaloPay stops)
 *   2  invalid  — bad body, wrong mac / app_id, unknown order, amount mismatch (no point retrying)
 *   0  error while processing — ZaloPay calls back again (up to 3 times)
 * Processing is synchronous (mac check + one conditional UPDATE). A lost callback is recovered by
 * the worker querying ZaloPay for Pending orders (server/jobs/syncPendingPayments.ts).
 */

function answer(returnCode: 0 | 1 | 2, message: string): Response {
  return Response.json({ return_code: returnCode, return_message: message }, { status: 200 });
}

export async function handleZalopayCallback(req: NextRequest): Promise<Response> {
  const started = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return answer(2, "Invalid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return answer(2, "Invalid body");
  const { data, mac, type } = body as { data?: unknown; mac?: unknown; type?: unknown };
  if (typeof data !== "string" || typeof mac !== "string") return answer(2, "Invalid mac");
  // type 1 = order payment; other callback types (agreement binding…) are not used here.
  if (type !== undefined && Number(type) !== 1) return answer(2, "Unsupported callback type");

  const fields = parseCallbackData(data);
  if (!fields?.app_trans_id) return answer(2, "Invalid data");
  const appTransId = fields.app_trans_id;
  const txnCode = txnCodeFromAppTransId(appTransId);

  try {
    const txn = await getPrisma().transaction.findUnique({
      where: { txnCode },
      select: { id: true, partnerConfigId: true },
    });

    // Verify with key2 of the partner config that created the order (fallback-safe); an unknown
    // order is checked against the first Active ZaloPay config.
    const { connector } = await resolveConnectorByCode("zalopay", txn?.partnerConfigId);
    if (!connector.verifySignature({ data }, mac)) {
      console.warn(`[zalopay-callback] invalid mac app_trans_id=${appTransId}`);
      return answer(2, "mac not equal");
    }
    if (!txn) return answer(2, "Order not found");

    const result = connector.processResult(fields);
    const applied = await applyPaymentResult(result, {
      endpoint: "/api/ipn/zalopay",
      createdBy: "partner:zalopay-callback",
    });

    const ms = Date.now() - started;
    switch (applied.kind) {
      case "not_found":
        return answer(2, "Order not found");
      case "amount_mismatch":
        console.warn(`[zalopay-callback] amount mismatch app_trans_id=${appTransId} (${ms}ms)`);
        return answer(2, "Invalid amount");
      case "pending":
        return answer(1, "success");
      case "already_final":
        return answer(1, "success");
      case "applied":
        console.log(`[zalopay-callback] app_trans_id=${appTransId} → ${applied.status} (${ms}ms)`);
        return answer(1, "success");
    }
  } catch (e) {
    if (e instanceof ConnectorUnavailableError) console.error(`[zalopay-callback] ${e.message}`);
    else console.error("[zalopay-callback] error:", e instanceof Error ? e.message : e);
    return answer(0, "Unknown error");
  }
}
