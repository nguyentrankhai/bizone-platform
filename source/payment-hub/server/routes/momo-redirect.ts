import type { NextRequest } from "next/server";
import { txnCodeFromOrderId } from "@/services/connectors/momo/momo.util";
import { handleWalletRedirect } from "@/server/routes/wallet-redirect";

/**
 * GET /pay/momo/return — customer's browser comes back from MoMo (redirectUrl). The query string
 * carries the same signed fields as the IPN; verified, never applied (see wallet-redirect.ts).
 */
export function handleMomoRedirect(req: NextRequest): Promise<Response> {
  return handleWalletRedirect(req, {
    code: "momo",
    label: "MoMo",
    orderParam: "orderId",
    signatureParam: "signature",
    txnCodeFromOrderId,
  });
}
