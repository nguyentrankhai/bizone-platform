import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { resolveConnectorByCode, syncPaymentStatus } from "@/server/services/payment.service";
import { renderPayPage } from "@/server/routes/pay-page";

/** Upper bound for the status query made while the customer waits on the redirect. */
const SYNC_TIMEOUT_MS = 5_000;

export interface WalletRedirectSpec {
  /** connectors.code — "momo", "zalopay" */
  code: string;
  /** PSP name shown to the customer */
  label: string;
  /** Query parameter holding the PSP order id (MoMo orderId, ZaloPay apptransid) */
  orderParam: string;
  /** Query parameter holding the signature (MoMo signature, ZaloPay checksum) */
  signatureParam: string;
  txnCodeFromOrderId(orderId: string): string;
}

/**
 * GET /pay/{momo|zalopay}/return — the customer's browser comes back from a wallet PSP.
 *
 * The query string is signed by the PSP. It is verified but never applied: the IPN / callback — or
 * a server-to-server status query — is the source of truth. When the transaction is still Pending
 * (notification late, or unreachable like in dev), Payment Hub queries the PSP once so the
 * merchant's return_url carries the real status.
 */
export async function handleWalletRedirect(
  req: NextRequest,
  spec: WalletRedirectSpec,
): Promise<Response> {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const orderId = params[spec.orderParam];
  const signature = params[spec.signatureParam];
  if (!orderId || !signature) {
    return renderPayPage({ title: "Liên kết không hợp lệ", tone: "error" }, 400);
  }

  const prisma = getPrisma();
  const txnCode = spec.txnCodeFromOrderId(orderId);
  let txn = await prisma.transaction.findUnique({ where: { txnCode } });

  const { connector } = await resolveConnectorByCode(spec.code, txn?.partnerConfigId);
  if (!connector.verifySignature(params, signature)) {
    return renderPayPage(
      {
        title: "Chữ ký không hợp lệ",
        message: `Dữ liệu trả về từ ${spec.label} không hợp lệ. Vui lòng liên hệ cửa hàng.`,
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
      endpoint: `/pay/${spec.code}/return`,
      body: params as Prisma.InputJsonValue,
    },
  });

  if (txn.status === "Pending") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        syncPaymentStatus(txn, `system:${spec.code}-return`),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("status query timed out")), SYNC_TIMEOUT_MS);
        }),
      ]);
      txn = (await prisma.transaction.findUnique({ where: { id: txn.id } })) ?? txn;
    } catch (e) {
      console.warn(
        `[${spec.code}-return] status query failed for ${txn.txnCode}: ${e instanceof Error ? e.message : e}`,
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
  // The transaction status (IPN / query) wins over what the browser says.
  if (txn.status === "Success" || (txn.status === "Pending" && result.outcome === "Success")) {
    return txn.status === "Success"
      ? renderPayPage({
          title: "Thanh toán thành công",
          message: `Giao dịch ${txn.txnCode} — ${amount}`,
          tone: "success",
        })
      : renderPayPage({
          title: "Đang xử lý thanh toán",
          message: `Giao dịch ${txn.txnCode} — ${amount}. Kết quả sẽ được cập nhật trong giây lát.`,
          tone: "info",
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
    links:
      txn.status === "Pending"
        ? [{ href: `/pay/${encodeURIComponent(txn.txnCode)}?choose=1`, label: "Thanh toán lại" }]
        : undefined,
  });
}
