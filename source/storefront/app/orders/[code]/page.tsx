import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { bizone, StoreApiError } from "@/lib/bizone-sync";
import { currentStore } from "@/lib/store";
import { customerToken, guestOrders } from "@/lib/session";
import { cancelOrderAction, payOrderAction } from "@/app/actions";
import { Alert, PageTitle, StatusBadge, btn, btnOutline } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { fmtDateTime, fmtVnd } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/orders/[code]">): Promise<Metadata> {
  return { title: `Đơn ${(await params).code}` };
}

/** Chi tiết + theo dõi đơn: trạng thái, thanh toán online, lịch sử xử lý */
export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[code]">) {
  const { code } = await params;
  const sp = await searchParams;
  const store = await currentStore();
  const token = await customerToken(store);
  const phone = (await guestOrders(store)).get(code) ?? null;
  if (!token && !phone) notFound();
  // Either proves access: the logged-in buyer, or the phone remembered for a guest order
  let o;
  try {
    o = await bizone.order(store, code, { token, phone });
  } catch (e) {
    if (e instanceof StoreApiError && e.status === 404) notFound();
    throw e;
  }
  const waitingPayment =
    o.paymentMethod === "payhub" && o.paymentStatus !== "paid" && o.status === "pending";
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="space-y-5">
      <PageTitle back={{ href: "/orders", label: "Đơn hàng" }}>Đơn {o.code}</PageTitle>
      {sp.placed && <Alert kind="ok">Đặt hàng thành công! Cửa hàng sẽ liên hệ xác nhận đơn.</Alert>}
      {sp.payError && (
        <Alert>Chưa mở được trang thanh toán — bấm “Thanh toán ngay” để thử lại.</Alert>
      )}
      {sp.cancelled && <Alert kind="info">Đơn hàng đã được huỷ.</Alert>}
      {error && <Alert>{error}</Alert>}
      {o.paymentStatus === "paid" && o.paymentMethod === "payhub" && (
        <Alert kind="ok">
          Đã thanh toán online{o.payment?.txnCode ? ` (mã GD ${o.payment.txnCode})` : ""}.
        </Alert>
      )}
      {waitingPayment && sp.payment === "success" && (
        <Alert kind="info">Đang chờ cổng thanh toán xác nhận… trang tự cập nhật.</Alert>
      )}
      {waitingPayment && sp.payment === "failed" && (
        <Alert>Thanh toán chưa thành công. Bạn có thể thử lại.</Alert>
      )}
      {waitingPayment && <AutoRefresh seconds={5} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={o.status} label={o.statusLabel} />
              <span className="text-sm text-slate-500">Đặt lúc {fmtDateTime(o.createdAt)}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {o.items.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <Link href={`/products/${i.slug}`} className="hover:text-primary">
                      {i.name}
                    </Link>
                    {i.variant && <span className="text-slate-500"> · {i.variant}</span>}
                    <span className="text-slate-500"> × {i.quantity}</span>
                  </span>
                  <span className="shrink-0 font-medium">{fmtVnd(i.totalAmount)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-semibold">Theo dõi đơn hàng</h2>
            <ol className="space-y-3">
              {o.tracking.map((t, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${i === o.tracking.length - 1 ? "bg-primary" : "bg-slate-300"}`}
                  />
                  <div>
                    <div className="font-medium">{t.label}</div>
                    {t.note && <div className="text-slate-600">{t.note}</div>}
                    <div className="text-xs text-slate-400">{fmtDateTime(t.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
            {(o.shippingProvider || o.trackingCode) && (
              <p className="mt-3 text-sm text-slate-600">
                Vận chuyển: {o.shippingProvider ?? ""}{" "}
                {o.trackingCode ? `· mã vận đơn ${o.trackingCode}` : ""}
              </p>
            )}
          </section>
        </div>
        <aside className="space-y-4">
          <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="flex justify-between">
              <span>Tạm tính</span>
              <span>{fmtVnd(o.subtotal)}</span>
            </div>
            {o.discountAmount > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Giảm giá</span>
                <span>-{fmtVnd(o.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Phí giao hàng</span>
              <span>{o.shippingFee ? fmtVnd(o.shippingFee) : "Miễn phí"}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
              <span>Tổng</span>
              <span data-testid="order-total">{fmtVnd(o.totalAmount)}</span>
            </div>
            <div className="pt-1 text-slate-600">
              {o.paymentMethod === "payhub" ? "Thanh toán online" : "Thanh toán khi nhận hàng"} ·{" "}
              <span
                data-testid="payment-status"
                className={
                  o.paymentStatus === "paid"
                    ? "font-medium text-green-700"
                    : "font-medium text-amber-700"
                }
              >
                {o.paymentStatus === "paid" ? "Đã thanh toán" : "Chưa thanh toán"}
              </span>
            </div>
            {waitingPayment && o.paymentDueAt && (
              <div className="text-xs text-slate-500">
                Hạn thanh toán: {fmtDateTime(o.paymentDueAt)}
              </div>
            )}
          </section>
          <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <h2 className="font-semibold">Người nhận</h2>
            <div>
              {o.contact.name} · {o.contact.phone}
            </div>
            <div className="text-slate-600">{o.contact.address}</div>
            {o.note && <div className="text-slate-500">Ghi chú: {o.note}</div>}
          </section>
          {o.canPay && (
            <form action={payOrderAction}>
              <input type="hidden" name="code" value={o.code} />
              <button className={`${btn} w-full`}>Thanh toán ngay</button>
            </form>
          )}
          {o.canCancel && (
            <form action={cancelOrderAction} className="space-y-2">
              <input type="hidden" name="code" value={o.code} />
              <input type="hidden" name="reason" value="Khách đổi ý" />
              <button className={`${btnOutline} w-full text-red-600`}>Huỷ đơn hàng</button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
