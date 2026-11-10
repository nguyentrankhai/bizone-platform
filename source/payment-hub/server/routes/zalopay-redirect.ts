import type { NextRequest } from "next/server";
import { txnCodeFromAppTransId } from "@/services/connectors/zalopay/zalopay.util";
import { handleWalletRedirect } from "@/server/routes/wallet-redirect";

/**
 * GET /pay/zalopay/return — customer's browser comes back from ZaloPay (embed_data.redirecturl)
 * with `appid, apptransid, pmcid, bankcode, amount, discountamount, status, checksum`
 * (checksum = HMAC-SHA256(key2, appid|…|status)). Verified, never applied: status 1 only means the
 * customer finished on ZaloPay's page — the callback or a status query decides (wallet-redirect.ts).
 */
export function handleZalopayRedirect(req: NextRequest): Promise<Response> {
  return handleWalletRedirect(req, {
    code: "zalopay",
    label: "ZaloPay",
    orderParam: "apptransid",
    signatureParam: "checksum",
    txnCodeFromOrderId: txnCodeFromAppTransId,
  });
}
