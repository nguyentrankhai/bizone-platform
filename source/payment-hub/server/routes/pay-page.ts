import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { PaymentError, initiatePayment } from "@/server/services/payment.service";
import type { QrDto } from "@/server/services/qr.service";
import { ROUTE_MAP, isPaymentMethod } from "@/services/routing/routeMap";
import { availableMethods } from "@/services/routing/routeEngine";

/** Minimal customer-facing HTML (no admin layout, no client JS). */

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const TONE_COLOR = { success: "#10B981", error: "#EF4444", info: "#2563EB" } as const;

export function renderPayPage(
  opts: {
    title: string;
    message?: string;
    tone: keyof typeof TONE_COLOR;
    links?: { href: string; label: string }[];
    /** Extra trusted HTML (already escaped) below the message */
    bodyHtml?: string;
    /** Reload the page after N seconds (status polling without client JS) */
    refreshSeconds?: number;
  },
  status = 200,
): Response {
  const links = (opts.links ?? [])
    .map(
      (l) =>
        `<a href="${esc(l.href)}" style="display:block;margin-top:12px;padding:12px 16px;border-radius:8px;background:#2563EB;color:#fff;text-decoration:none;font-weight:600">${esc(l.label)}</a>`,
    )
    .join("");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${opts.refreshSeconds ? `<meta http-equiv="refresh" content="${Math.max(1, Math.round(opts.refreshSeconds))}">` : ""}<title>${esc(opts.title)} — Payment Hub</title></head>
<body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#F8FAFC;color:#0F172A">
<main style="max-width:420px;margin:64px auto;padding:32px 24px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center">
<div style="width:48px;height:48px;margin:0 auto 16px;border-radius:50%;background:${TONE_COLOR[opts.tone]}"></div>
<h1 style="font-size:20px;margin:0 0 8px">${esc(opts.title)}</h1>
${opts.message ? `<p style="margin:0;color:#475569">${esc(opts.message)}</p>` : ""}
${opts.bodyHtml ?? ""}
${links}
</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function clientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}

const vnd = (n: number | string) => `${Number(n).toLocaleString("vi-VN")} ₫`;

/** Seconds between reloads of the QR screen (picks up payment status / QR refresh). */
const QR_POLL_SECONDS = 15;

function qrBody(qr: QrDto): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 0;color:#64748B;text-align:left">${esc(k)}</td><td style="padding:4px 0;text-align:right;font-weight:600">${esc(v)}</td></tr>`;
  const expires = new Date(qr.expires_at).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `<img src="${esc(qr.image_base64)}" alt="Mã VietQR" width="260" height="260" style="display:block;margin:16px auto;width:260px;height:260px">
<table style="width:100%;font-size:14px;border-collapse:collapse">
${row("Số tiền", vnd(qr.amount))}
${row("Ngân hàng (BIN)", qr.bank.bin)}
${row("Số tài khoản", qr.bank.account_no)}
${qr.bank.account_name ? row("Chủ tài khoản", qr.bank.account_name) : ""}
${row("Nội dung", qr.transfer_note)}
${row("Mã QR hết hạn lúc", expires)}
</table>
<p style="margin:12px 0 0;font-size:13px;color:#64748B">Quét bằng app ngân hàng bất kỳ. Trang tự cập nhật khi thanh toán được xác nhận.</p>`;
}

const FINAL_PAGES: Record<string, { title: string; tone: keyof typeof TONE_COLOR }> = {
  Success: { title: "Thanh toán thành công", tone: "success" },
  Refunded: { title: "Giao dịch đã được hoàn tiền", tone: "info" },
  PartiallyRefunded: { title: "Giao dịch đã được hoàn tiền một phần", tone: "info" },
  Failed: { title: "Thanh toán không thành công", tone: "error" },
  Expired: { title: "Giao dịch đã hết hạn", tone: "error" },
};

async function renderPicker(
  txn: { txnCode: string; amount: { toString(): string }; merchantId: number },
  notice?: string,
): Promise<Response> {
  const methods = await availableMethods(txn.merchantId, Number(txn.amount));
  if (methods.length === 0) {
    return renderPayPage(
      {
        title: "Chưa thể thanh toán",
        message: "Hiện chưa có phương thức thanh toán khả dụng. Vui lòng thử lại sau.",
        tone: "error",
      },
      503,
    );
  }
  return renderPayPage(
    {
      title: "Chọn phương thức thanh toán",
      message: `${txn.txnCode} — ${vnd(txn.amount.toString())}`,
      tone: "info",
      bodyHtml: notice
        ? `<p style="margin:12px 0 0;padding:8px 12px;border-radius:8px;background:#FEF3C7;color:#92400E;font-size:14px">${esc(notice)}</p>`
        : undefined,
      links: methods.map((m) => ({
        href: `/pay/${encodeURIComponent(txn.txnCode)}?method=${m}`,
        label: ROUTE_MAP[m].label,
      })),
    },
    notice ? 503 : 200,
  );
}

/**
 * GET /pay/{txnCode}[?method=vnpay_qr|vietqr|…][&choose=1] — hosted payment entry point
 * (payment_url returned by POST /api/v1/transactions).
 *  - no method → picker listing only the methods the Route Engine can serve right now
 *  - redirect method → 302 to the PSP chosen by the Route Engine (with fallback)
 *  - vietqr → QR screen (reloads every 15 s to show the result / a refreshed QR)
 *  - method unavailable (partner down/disabled) → picker with the remaining methods
 */
export async function handlePayEntry(req: NextRequest, txnCode: string): Promise<Response> {
  const txn = await getPrisma().transaction.findUnique({
    where: { txnCode },
    select: {
      txnCode: true,
      amount: true,
      status: true,
      paymentMethod: true,
      merchantId: true,
      expiredAt: true,
    },
  });
  if (!txn) return renderPayPage({ title: "Không tìm thấy giao dịch", tone: "error" }, 404);

  const final = FINAL_PAGES[txn.status];
  if (final) {
    return renderPayPage(
      { ...final, message: `${txn.txnCode} — ${vnd(txn.amount.toString())}` },
      txn.status === "Success" ? 200 : 409,
    );
  }
  if (txn.expiredAt && txn.expiredAt <= new Date()) {
    return renderPayPage({ title: "Giao dịch đã hết hạn", tone: "error" }, 409);
  }

  const params = req.nextUrl.searchParams;
  const method = params.get("method") ?? (params.get("choose") ? null : txn.paymentMethod);
  if (!method) return renderPicker(txn);
  if (!isPaymentMethod(method)) {
    return renderPayPage({ title: "Phương thức không hỗ trợ", tone: "error" }, 400);
  }

  try {
    const initiated = await initiatePayment(txn.txnCode, method, clientIp(req));
    if (initiated.kind === "redirect") return Response.redirect(initiated.paymentUrl, 302);

    const secondsLeft = (new Date(initiated.qr.expires_at).getTime() - Date.now()) / 1000;
    return renderPayPage({
      title: "Quét mã VietQR để thanh toán",
      message: txn.txnCode,
      tone: "info",
      bodyHtml: qrBody(initiated.qr),
      refreshSeconds: Math.min(QR_POLL_SECONDS, Math.max(1, secondsLeft + 1)),
      links: [
        {
          href: `/pay/${encodeURIComponent(txn.txnCode)}?choose=1`,
          label: "Chọn phương thức khác",
        },
      ],
    });
  } catch (e) {
    if (e instanceof PaymentError) {
      if (e.code === "SERVICE_UNAVAILABLE") {
        // Graceful degradation: this method's partners are down → offer the others.
        return renderPicker(
          txn,
          `${ROUTE_MAP[method].label} tạm thời không khả dụng. Vui lòng chọn phương thức khác.`,
        );
      }
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "VALIDATION_ERROR" ? 400 : 409;
      return renderPayPage(
        { title: "Không thể thanh toán", message: e.message, tone: "error" },
        status,
      );
    }
    throw e;
  }
}
