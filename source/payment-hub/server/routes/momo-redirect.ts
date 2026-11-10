import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { txnCodeFromOrderId } from "@/services/connectors/momo/momo.util";
import { resolveConnectorByCode, syncPaymentStatus } from "@/server/services/payment.service";
import { renderPayPage } from "@/server/routes/pay-page";

/** Upper bound for the status query made while the customer waits on the redirect. */
const SYNC_TIMEOUT_MS = 5_000;

/**
 * GET /pay/momo/return — customer's browser comes back from MoMo (redirectUrl).
 *
 * The query string carries the same signed fields as the IPN. It is verified but never applied:
 * the IPN — or a server-to-server query to MoMo — is the source of truth. When the transaction
 * is still Pending (IPN late, or unreachable like in dev), Payment Hub queries MoMo once so the
 * merchant's return_url carries the real status.
 */
export async function handleMomoRedirect(req: NextRequest): Promise<Response> {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { orderId, signature } = params;
  if (!orderId || !signature) {
    return renderPayPage({ title: "Liên kết không hợp lệ", tone: "error" }, 400);
  }

  const prisma = getPrisma();
  const txnCode = txnCodeFromOrderId(orderId);
  let txn = await prisma.transaction.findUnique({ where: { txnCode } });

  const { connector } = await resolveConnectorByCode("momo", txn?.partnerConfigId);
  if (!connector.verifySignature(params, signature)) {
    return renderPayPage(
      {
        title: "Chữ ký không hợp lệ",
        message: "Dữ liệu trả về từ MoMo không hợp lệ. Vui lòng liên hệ cửa hàng.",
        tone: "error",
      },
      400,
    );
  }
  if (!txn) return renderPayPage({ title: "Không tìm thấy giao dịch", tone: "error" }, 404);

  await prisma.transactionRawData.create({
    data: {
      transactionId: txn.id,
      direction: "Request",
      source: "Partner",
      endpoint: "/pay/momo/return",
      body: params as Prisma.InputJsonValue,
    },
  });

  if (txn.status === "Pending") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        syncPaymentStatus(txn, "system:momo-return"),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("status query timed out")), SYNC_TIMEOUT_MS);
        }),
      ]);
      txn = (await prisma.transaction.findUnique({ where: { id: txn.id } })) ?? txn;
    } catch (e) {
      console.warn(
        `[momo-return] status query failed for ${txn.txnCode}: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const result = connector.processResult(params);
  const resultText =
    result.outcome === "Success" ? "success" : result.outcome === "Failed" ? "failed" : "pending";

  if (txn.returnUrl) {
    const target = new URL(txn.returnUrl);
    target.searchParams.set("txn_code", txn.txnCode);
    if (txn.merchantTxnId) target.searchParams.set("merchant_txn_id", txn.merchantTxnId);
    target.searchParams.set("status", txn.status);
    target.searchParams.set("result", resultText);
    if (result.errorCode) target.searchParams.set("error_code", result.errorCode);
    return Response.redirect(target.toString(), 302);
  }

  const amount = `${Number(txn.amount).toLocaleString("vi-VN")} ₫`;
  if (result.outcome === "Success") {
    return renderPayPage({
      title: "Thanh toán thành công",
      message: `Giao dịch ${txn.txnCode} — ${amount}`,
      tone: "success",
    });
  }
  if (result.outcome === "Pending") {
    return renderPayPage({
      title: "Đang xử lý thanh toán",
      message: `Giao dịch ${txn.txnCode} — ${amount}. Kết quả sẽ được cập nhật trong giây lát.`,
      tone: "info",
    });
  }
  return renderPayPage({
    title: "Thanh toán không thành công",
    message: `${result.errorMessage ?? "Giao dịch thất bại"} (mã ${result.errorCode ?? "?"})`,
    tone: "error",
  });
}
