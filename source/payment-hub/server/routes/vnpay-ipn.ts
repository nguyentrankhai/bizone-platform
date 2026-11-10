import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { ConnectorUnavailableError } from "@/services/connectors/registry";
import { applyPaymentResult, resolveConnectorByCode } from "@/server/services/payment.service";

/**
 * GET /api/ipn/vnpay — VNPay Instant Payment Notification.
 *
 * VNPay expects HTTP 200 with JSON `{ RspCode, Message }`:
 *   00 confirmed · 01 order not found · 02 already confirmed · 04 invalid amount
 *   97 invalid signature · 99 unknown error
 * Any code other than 00/02 makes VNPay retry the IPN, which is how failed
 * processing is retried. Processing is synchronous (a few DB writes, well under the
 * 2s target) because the RspCode must reflect the outcome.
 */

type Rsp = { RspCode: string; Message: string };

function reply(body: Rsp): Response {
  return Response.json(body, { status: 200 });
}

export async function handleVnpayIpn(req: NextRequest): Promise<Response> {
  const started = Date.now();
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const txnCode = params.vnp_TxnRef;
  const signature = params.vnp_SecureHash;

  try {
    if (!txnCode || !signature) return reply({ RspCode: "97", Message: "Invalid signature" });

    const txn = await getPrisma().transaction.findUnique({
      where: { txnCode },
      select: { partnerConfigId: true },
    });

    const { connector } = await resolveConnectorByCode("vnpay", txn?.partnerConfigId);
    if (!connector.verifySignature(params, signature)) {
      console.warn(`[vnpay-ipn] invalid signature txn=${txnCode}`);
      return reply({ RspCode: "97", Message: "Invalid signature" });
    }
    if (!txn) return reply({ RspCode: "01", Message: "Order not found" });

    const result = connector.processResult(params);
    const applied = await applyPaymentResult(result, {
      endpoint: "/api/ipn/vnpay",
      createdBy: "partner:vnpay-ipn",
    });

    const ms = Date.now() - started;
    switch (applied.kind) {
      case "not_found":
        return reply({ RspCode: "01", Message: "Order not found" });
      case "amount_mismatch":
        console.warn(`[vnpay-ipn] amount mismatch txn=${txnCode} (${ms}ms)`);
        return reply({ RspCode: "04", Message: "Invalid amount" });
      case "already_final":
        return reply({ RspCode: "02", Message: "Order already confirmed" });
      case "pending": // VNPay results are always final; never reached
        return reply({ RspCode: "99", Message: "Unknown error" });
      case "applied":
        console.log(`[vnpay-ipn] txn=${txnCode} → ${applied.status} (${ms}ms)`);
        return reply({ RspCode: "00", Message: "Confirm Success" });
    }
  } catch (e) {
    if (e instanceof ConnectorUnavailableError) {
      console.error(`[vnpay-ipn] ${e.message}`);
    } else {
      console.error("[vnpay-ipn] error:", e instanceof Error ? e.message : e);
    }
    return reply({ RspCode: "99", Message: "Unknown error" });
  }
}
