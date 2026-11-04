import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { PaymentError, initiatePayment } from "@/server/services/payment.service";
import { definitionForMethod } from "@/services/connectors/registry";

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
  },
  status = 200,
): Response {
  const links = (opts.links ?? [])
    .map(
      (l) =>
        `<a href="${esc(l.href)}" style="display:block;margin-top:12px;padding:12px 16px;border-radius:8px;background:#2563EB;color:#fff;text-decoration:none;font-weight:600">${esc(l.label)}</a>`,
    )
    .join("");
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)} — Payment Hub</title></head>
<body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#F8FAFC;color:#0F172A">
<main style="max-width:420px;margin:64px auto;padding:32px 24px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center">
<div style="width:48px;height:48px;margin:0 auto 16px;border-radius:50%;background:${TONE_COLOR[opts.tone]}"></div>
<h1 style="font-size:20px;margin:0 0 8px">${esc(opts.title)}</h1>
${opts.message ? `<p style="margin:0;color:#475569">${esc(opts.message)}</p>` : ""}
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

const METHOD_LABELS: Record<string, string> = {
  vnpay: "VNPay (chọn trên cổng VNPay)",
  vnpay_qr: "VNPay QR",
  vnpay_atm: "Thẻ ATM / Tài khoản ngân hàng",
  vnpay_card: "Thẻ quốc tế",
};

/**
 * GET /pay/{txnCode}[?method=vnpay_qr] — hosted payment entry point (payment_url
 * returned by POST /api/v1/transactions). With a method, redirects to the PSP;
 * without one, shows the method picker.
 */
export async function handlePayEntry(req: NextRequest, txnCode: string): Promise<Response> {
  const txn = await getPrisma().transaction.findUnique({
    where: { txnCode },
    select: { txnCode: true, amount: true, status: true, paymentMethod: true },
  });
  if (!txn) return renderPayPage({ title: "Không tìm thấy giao dịch", tone: "error" }, 404);

  const method = req.nextUrl.searchParams.get("method") ?? txn.paymentMethod;
  if (!method) {
    return renderPayPage({
      title: "Chọn phương thức thanh toán",
      message: `${txn.txnCode} — ${Number(txn.amount).toLocaleString("vi-VN")} ₫`,
      tone: "info",
      links: Object.entries(METHOD_LABELS).map(([m, label]) => ({
        href: `/pay/${encodeURIComponent(txn.txnCode)}?method=${m}`,
        label,
      })),
    });
  }
  if (!definitionForMethod(method)) {
    return renderPayPage({ title: "Phương thức không hỗ trợ", tone: "error" }, 400);
  }

  try {
    const { paymentUrl } = await initiatePayment(txn.txnCode, method, clientIp(req));
    return Response.redirect(paymentUrl, 302);
  } catch (e) {
    if (e instanceof PaymentError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "SERVICE_UNAVAILABLE" ? 503 : 409;
      return renderPayPage(
        { title: "Không thể thanh toán", message: e.message, tone: "error" },
        status,
      );
    }
    throw e;
  }
}
