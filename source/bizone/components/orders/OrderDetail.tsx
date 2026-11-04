"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Truck, RotateCcw, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  fmtMoney,
  fmtDate,
  errorMessage,
  type ApiAuth,
} from "@/components/inventory/shared";
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  CHANNEL_LABEL,
  NEXT_STATUS,
  NEXT_STATUS_LABEL,
} from "./shared";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

type OrderFull = inferRouterOutputs<AppRouter>["order"]["get"];

interface OrderDetailProps {
  orderId: number;
  auth: ApiAuth;
}

export function OrderDetail({ orderId, auth }: OrderDetailProps) {
  const router = useRouter();
  const toast = useToast();
  const ctx = apiContext(auth);

  const [order, setOrder] = useState<OrderFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showRefund, setShowRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await trpc.order.get.query({ id: orderId }, ctx);
      setOrder(data);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleUpdateStatus(
    newStatus:
      "confirmed" | "preparing" | "shipping" | "delivered" | "completed" | "cancelled" | "returned",
  ) {
    setUpdating(true);
    try {
      await trpc.order.updateStatus.mutate({ id: orderId, data: { status: newStatus } }, ctx);
      toast.success("Cập nhật trạng thái thành công");
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUpdating(false);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setUpdating(true);
    try {
      await trpc.order.cancel.mutate({ id: orderId, data: { reason: cancelReason } }, ctx);
      toast.success("Đã huỷ đơn hàng");
      setShowCancel(false);
      setCancelReason("");
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUpdating(false);
    }
  }

  async function handleRefund() {
    if (!refundReason.trim() || !order) return;
    setUpdating(true);
    try {
      const items = order.orderItems.map((item) => ({
        orderItemId: item.id,
        quantity: item.quantity,
        refundAmount: Number(item.totalAmount),
      }));
      await trpc.order.refund.mutate({ id: orderId, data: { reason: refundReason, items } }, ctx);
      toast.success("Tạo hoàn trả thành công");
      setShowRefund(false);
      setRefundReason("");
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Đang tải...
      </div>
    );
  }
  if (!order) {
    return <div className="py-16 text-center text-red-500">Không tìm thấy đơn hàng</div>;
  }

  const nextStatus = NEXT_STATUS[order.status];
  const canCancel = ["pending", "confirmed", "preparing"].includes(order.status);
  const canRefund = ["completed", "delivered", "returned"].includes(order.status);
  const statusInfo = ORDER_STATUS[order.status];
  const paymentInfo = PAYMENT_STATUS[order.paymentStatus];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/orders")}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Đơn hàng {order.orderCode}</h1>
            <p className="text-sm text-slate-400">Tạo ngày {fmtDate(order.createdAt, true)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCancel && (
            <button
              onClick={() => setShowCancel(true)}
              className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <XCircle className="h-4 w-4" />
              Huỷ đơn
            </button>
          )}
          {canRefund && (
            <button
              onClick={() => setShowRefund(true)}
              className="flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50"
            >
              <RotateCcw className="h-4 w-4" />
              Hoàn trả
            </button>
          )}
          {nextStatus && (
            <button
              onClick={() =>
                void handleUpdateStatus(
                  nextStatus as
                    | "confirmed"
                    | "preparing"
                    | "shipping"
                    | "delivered"
                    | "completed"
                    | "cancelled"
                    | "returned",
                )
              }
              disabled={updating}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Truck className="h-4 w-4" />
              {NEXT_STATUS_LABEL[nextStatus] ?? nextStatus}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Order info */}
        <div className="space-y-4 lg:col-span-2">
          {/* Order info */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">
              Thông tin đơn hàng
            </h3>
            <div className="space-y-2.5 text-sm">
              <InfoRow label="Mã đơn hàng" value={order.orderCode} />
              <InfoRow
                label="Kênh"
                value={CHANNEL_LABEL[order.channel ?? ""] ?? order.channel ?? "—"}
              />
              <InfoRow
                label="Trạng thái"
                value={
                  statusInfo ? (
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}
                    >
                      {statusInfo.label}
                    </span>
                  ) : (
                    order.status
                  )
                }
              />
              <InfoRow
                label="Thanh toán"
                value={
                  paymentInfo ? (
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${paymentInfo.className}`}
                    >
                      {paymentInfo.label}
                    </span>
                  ) : (
                    order.paymentStatus
                  )
                }
              />
              {order.paymentMethod && (
                <InfoRow label="Phương thức TT" value={order.paymentMethod} />
              )}
              {order.notes && <InfoRow label="Ghi chú" value={order.notes} />}
            </div>
          </div>

          {/* Customer */}
          {order.customer && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">
                Khách hàng
              </h3>
              <div className="space-y-2.5 text-sm">
                <InfoRow label="Họ tên" value={order.customer.fullName} />
                <InfoRow label="SĐT" value={order.customer.phone} />
                <InfoRow label="Email" value={order.customer.email ?? "—"} />
              </div>
            </div>
          )}

          {/* Products */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">
              Sản phẩm
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="pb-2 text-left font-medium text-slate-500">Sản phẩm</th>
                  <th className="pb-2 text-left font-medium text-slate-500">SKU</th>
                  <th className="pb-2 text-center font-medium text-slate-500">SL</th>
                  <th className="pb-2 text-right font-medium text-slate-500">Đơn giá</th>
                  <th className="pb-2 text-right font-medium text-slate-500">Giảm</th>
                  <th className="pb-2 text-right font-medium text-slate-500">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {order.orderItems.map((item) => (
                  <tr key={item.id} className="border-t border-slate-50">
                    <td className="py-2.5">
                      <div>{item.product?.name ?? "—"}</div>
                      {item.variant && (
                        <div className="text-xs text-slate-400">SKU: {item.variant.sku}</div>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-400">{item.product?.sku ?? "—"}</td>
                    <td className="py-2.5 text-center">{item.quantity}</td>
                    <td className="py-2.5 text-right">{fmtMoney(item.unitPrice)}</td>
                    <td className="py-2.5 text-right text-emerald-600">
                      {Number(item.discountAmount) > 0 ? `-${fmtMoney(item.discountAmount)}` : "0"}
                    </td>
                    <td className="py-2.5 text-right font-medium">{fmtMoney(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Shipping */}
          {(order.shippingProvider ?? order.trackingCode ?? order.shippingAddress) && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">
                Vận chuyển
              </h3>
              <div className="space-y-2.5 text-sm">
                {order.shippingAddress && (
                  <InfoRow label="Địa chỉ giao" value={order.shippingAddress} />
                )}
                {order.shippingProvider && <InfoRow label="ĐVVC" value={order.shippingProvider} />}
                {order.trackingCode && (
                  <InfoRow
                    label="Mã vận đơn"
                    value={<span className="font-medium text-blue-600">{order.trackingCode}</span>}
                  />
                )}
              </div>
            </div>
          )}

          {/* Refunds */}
          {order.orderRefunds.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">
                Hoàn trả
              </h3>
              {order.orderRefunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-blue-600">{r.refundCode}</span>
                    <span className="ml-2 text-slate-400">{fmtDate(r.createdAt)}</span>
                    {r.reason && <div className="text-xs text-slate-400">{r.reason}</div>}
                  </div>
                  <span className="font-semibold text-orange-600">
                    {fmtMoney(r.totalRefundAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Payment summary + Timeline */}
        <div className="space-y-4">
          {/* Payment summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">
              Thanh toán
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Tạm tính</span>
                <span>{fmtMoney(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Giảm giá</span>
                <span>-{fmtMoney(order.discountAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phí vận chuyển</span>
                <span>{fmtMoney(order.shippingFee)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold">
                <span>Tổng cộng</span>
                <span>{fmtMoney(order.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="mb-4 border-b border-slate-100 pb-3 text-sm font-semibold text-slate-800">
              Lịch sử đơn hàng
            </h3>
            <div className="space-y-0">
              {order.orderTracking.map((t, i) => {
                const isLast = i === order.orderTracking.length - 1;
                const info = ORDER_STATUS[t.status];
                return (
                  <div key={t.id} className="relative flex gap-3 pb-4">
                    {!isLast && (
                      <div className="absolute top-6 bottom-0 left-3 w-px bg-slate-200" />
                    )}
                    <div
                      className={`z-10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs ${isLast ? "bg-blue-600 text-white" : "bg-emerald-100 text-emerald-700"}`}
                    >
                      {isLast ? "●" : "✓"}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        {info?.label ?? t.status}
                      </div>
                      {t.note && <div className="text-xs text-slate-400">{t.note}</div>}
                      <div className="mt-0.5 text-xs text-slate-400">
                        {fmtDate(t.createdAt, true)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      <Modal open={showCancel} onClose={() => setShowCancel(false)} title="Huỷ đơn hàng" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Vui lòng nhập lý do huỷ đơn hàng <strong>{order.orderCode}</strong>.
          </p>
          <textarea
            className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none"
            rows={3}
            placeholder="Lý do huỷ..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCancel(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Đóng
            </button>
            <button
              onClick={() => void handleCancel()}
              disabled={!cancelReason.trim() || updating}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Huỷ đơn
            </button>
          </div>
        </div>
      </Modal>

      {/* Refund Modal */}
      <Modal open={showRefund} onClose={() => setShowRefund(false)} title="Tạo hoàn trả" size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Hoàn trả toàn bộ sản phẩm của đơn hàng <strong>{order.orderCode}</strong>
          </p>
          <textarea
            className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none"
            rows={2}
            placeholder="Lý do hoàn trả..."
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowRefund(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Đóng
            </button>
            <button
              onClick={() => void handleRefund()}
              disabled={!refundReason.trim() || updating}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Xác nhận hoàn trả
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="w-36 flex-shrink-0 text-slate-500">{label}</span>
      <span className="flex-1 font-medium text-slate-800">{value}</span>
    </div>
  );
}
