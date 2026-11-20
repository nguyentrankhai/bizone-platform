import { rateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { resolveConnectorByCode, syncPaymentStatus } from "@/server/services/payment.service";
import { renderPayPage } from "@/server/routes/pay-page";

/** Upper bound for the status query made while the customer waits on the redirect. */
const SYNC_TIMEOUT_MS = 5_000;
/** Recorded / PSP-queried hits of the return page per transaction per minute. */
const RETURN_HITS_PER_MINUTE = 5;

export interface WalletRedirectSpec {
  /** connectors.code — "momo", "zalopay", or a plugin code (P7.1) */
  code: string;
  /** PSP name shown to the customer */
  label: string;
  /** Path of this return URL (recorded with the raw data) */
  path: string;
  /** Transaction code + signature of the query string; null = not a payload of this PSP */
  keys(
    params: Record<string, string>,
  ):
    | { txnCode: string; signature: string }
    | null
    | Promise<{ txnCode: string; signature: string } | null>;
}

/** Spec of a PSP that puts its order id and signature in two query parameters. */
export function paramSpec(
  code: string,
  label: string,
  orderParam: string,
  signatureParam: string,
  txnCodeFromOrderId: (orderId: string) => string,
): WalletRedirectSpec {
  return {
    code,
    label,
    path: `/pay/${code}/return`,
    keys: (params) => {
      const orderId = params[orderParam];
      const signature = params[signatureParam];
      return orderId && signature ? { txnCode: txnCodeFromOrderId(orderId), signature } : null;
    },
  };
}

/**
 * GET /pay/{momo|zalopay}/return, /pay/plugin/{code}/return — the customer's browser comes back
 * from a wallet PSP / a connector plugin (P7.1).
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
  const keys = await spec.keys(params);
  if (!keys) {
    return renderPayPage({ title: "Liên kết không hợp lệ", tone: "error" }, 400);
  }
  const { txnCode, signature } = keys;

  const prisma = getPrisma();
  let txn = await prisma.transaction.findUnique({ where: { txnCode } });

  const { connector } = await resolveConnectorByCode(spec.code, txn?.partnerConfigId);
  if (!(await connector.verifySignature(params, signature))) {
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

  // A signed return URL stays valid: reloading / replaying it must not grow transaction_raw_data
  // or hammer the PSP (QA-4 #125) — beyond a few hits per minute only the page is rendered.
  const fresh = (
    await rateLimit(`rl:payhub:return:${txn.id}`, RETURN_HITS_PER_MINUTE, 60).catch(() => ({
      allowed: true,
    }))
  ).allowed;
  if (fresh)
    await prisma.transactionRawData.create({
      data: {
        transactionId: txn.id,
        direction: "Request",
        source: "Partner",
        endpoint: spec.path,
        body: params as Prisma.InputJsonValue,
      },
    });

  if (fresh && txn.status === "Pending") {
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

  const result = await connector.processResult(params);
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
