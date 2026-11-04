import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { resolveConnectorByCode } from "@/server/services/payment.service";
import { renderPayPage } from "@/server/routes/pay-page";

/**
 * GET /pay/vnpay/return — customer's browser comes back from VNPay.
 *
 * Verifies vnp_SecureHash, records the raw params, then forwards the customer to the
 * merchant's return_url. The redirect never changes transaction status — VNPay's IPN
 * (server-to-server, signed) is the source of truth; the merchant should read the
 * final status via API/webhook.
 */
export async function handleVnpayRedirect(req: NextRequest): Promise<Response> {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const txnCode = params.vnp_TxnRef;
  const signature = params.vnp_SecureHash;
  if (!txnCode || !signature) {
    return renderPayPage({ title: "Liên kết không hợp lệ", tone: "error" }, 400);
  }

  const prisma = getPrisma();
  const txn = await prisma.transaction.findUnique({ where: { txnCode } });

  const { connector } = await resolveConnectorByCode("vnpay", txn?.partnerConfigId);
  if (!connector.verifySignature(params, signature)) {
    return renderPayPage(
      {
        title: "Chữ ký không hợp lệ",
        message: "Dữ liệu trả về từ VNPay không hợp lệ. Vui lòng liên hệ cửa hàng.",
        tone: "error",
      },
      400,
    );
  }
  if (!txn) {
    return renderPayPage({ title: "Không tìm thấy giao dịch", tone: "error" }, 404);
  }

  await prisma.transactionRawData.create({
    data: {
      transactionId: txn.id,
      direction: "Request",
      source: "Partner",
      endpoint: "/pay/vnpay/return",
      body: params as Prisma.InputJsonValue,
    },
  });

  const result = connector.processResult(params);
  const resultText = result.outcome === "Success" ? "success" : "failed";

  if (txn.returnUrl) {
    const target = new URL(txn.returnUrl);
    target.searchParams.set("txn_code", txn.txnCode);
    if (txn.merchantTxnId) target.searchParams.set("merchant_txn_id", txn.merchantTxnId);
    target.searchParams.set("status", txn.status);
    target.searchParams.set("result", resultText);
    if (result.errorCode) target.searchParams.set("error_code", result.errorCode);
    return Response.redirect(target.toString(), 302);
  }

  return renderPayPage(
    result.outcome === "Success"
      ? {
          title: "Thanh toán thành công",
          message: `Giao dịch ${txn.txnCode} — ${Number(txn.amount).toLocaleString("vi-VN")} ₫`,
          tone: "success",
        }
      : {
          title: "Thanh toán không thành công",
          message: `${result.errorMessage ?? "Giao dịch thất bại"} (mã ${result.errorCode ?? "?"})`,
          tone: "error",
        },
  );
}
