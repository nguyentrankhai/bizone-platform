"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtDate, fmtMoney } from "@/components/inventory/shared";
import { ORDER_STATUS, PAYMENT_STATUS, channelLabel } from "@/components/orders/shared";
import { METHOD_LABEL } from "@/components/reports/shared";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { cn } from "@/lib/utils";
import { Card, DataStatus, Skeleton } from "./shared";
import { useApiAuth } from "@/components/auth/AuthProvider";

type Order = inferRouterOutputs<AppRouter>["order"]["get"];

/**
 * Read-only order view on the phone (P6.4). Processing (confirm, ship, cancel, refund) stays on
 * the full order page — one place for the status rules (P6.1 website / P6.2 marketplace).
 */
export function MobileOrderDetail({ orderId }: { orderId: number }) {
  const auth = useApiAuth();
  const q = useOfflineQuery<Order>(auth, `order:${orderId}`, () =>
    trpc.order.get.query({ id: orderId }, apiContext(auth)),
  );
  const o = q.data;

  return (
    <div>
      <Link
        href="/mobile/orders"
        className="mb-1 -ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-slate-600"
      >
        <ArrowLeft className="h-4 w-4" /> Đơn hàng
      </Link>
      <h1 className="text-xl font-bold text-slate-900">{o ? o.orderCode : "Chi tiết đơn"}</h1>
      <DataStatus {...q} onRefresh={() => void q.refresh()} />

      {!o ? (
        q.loading ? (
          <Skeleton rows={3} />
        ) : null
      ) : (
        <>
          <Card>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge {...ORDER_STATUS[o.status]} />
              <Badge {...PAYMENT_STATUS[o.paymentStatus]} />
            </div>
            <Rows
              rows={[
                ["Kênh", channelLabel(o)],
                ["Chi nhánh", o.branch?.name ?? "—"],
                ["Ngày tạo", fmtDate(o.createdAt, true)],
                [
                  "Thanh toán",
                  o.paymentMethod ? (METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod) : "—",
                ],
                ...(o.notes ? [["Ghi chú", o.notes] as [string, string]] : []),
              ]}
            />
          </Card>

          <Card title="Khách hàng / người nhận">
            <Rows
              rows={[
                ["Khách", o.customer?.fullName ?? "Khách lẻ"],
                ["SĐT", o.contactPhone ?? o.customer?.phone ?? "—"],
                ...(o.contactName && o.contactName !== o.customer?.fullName
                  ? [["Người nhận", o.contactName] as [string, string]]
                  : []),
                ...(o.shippingAddress ? [["Địa chỉ", o.shippingAddress] as [string, string]] : []),
                ...(o.shippingProvider
                  ? [
                      [
                        "ĐVVC",
                        `${o.shippingProvider}${o.trackingCode ? ` · ${o.trackingCode}` : ""}`,
                      ] as [string, string],
                    ]
                  : []),
              ]}
            />
            {(o.contactPhone ?? o.customer?.phone) && (
              <a
                href={`tel:${o.contactPhone ?? o.customer?.phone}`}
                className="mt-3 flex h-11 items-center justify-center rounded-lg border border-slate-200 text-sm font-medium text-primary"
              >
                Gọi khách
              </a>
            )}
          </Card>

          <Card title={`Sản phẩm (${o.orderItems.length})`}>
            <ul className="divide-y divide-slate-100">
              {o.orderItems.map((i) => (
                <li key={i.id} className="flex gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-800">{i.product?.name}</span>
                    <span className="block text-xs text-slate-400">
                      {i.variant?.sku ?? i.product?.sku} · {i.quantity} × {fmtMoney(i.unitPrice)}
                    </span>
                  </span>
                  <span className="font-medium text-slate-800">{fmtMoney(i.totalAmount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-sm">
              <Line label="Tạm tính" value={fmtMoney(o.subtotal)} />
              {Number(o.discountAmount) > 0 && (
                <Line label="Giảm giá" value={`-${fmtMoney(o.discountAmount)}`} />
              )}
              {Number(o.shippingFee) > 0 && (
                <Line label="Phí giao" value={fmtMoney(o.shippingFee)} />
              )}
              <Line label="Tổng cộng" value={fmtMoney(o.totalAmount)} strong />
            </div>
          </Card>

          {o.orderTracking.length > 0 && (
            <Card title="Lịch sử">
              <ol className="space-y-2 border-l-2 border-slate-100 pl-3">
                {[...o.orderTracking].reverse().map((t) => (
                  <li key={t.id} className="text-sm">
                    <span className="font-medium text-slate-700">
                      {ORDER_STATUS[t.status]?.label ?? t.status}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">
                      {fmtDate(t.createdAt, true)}
                    </span>
                    {t.note && <span className="block text-xs text-slate-500">{t.note}</span>}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <Link
            href={`/orders/${o.id}`}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-white"
          >
            Xử lý đơn trên bản đầy đủ <ExternalLink className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}

function Badge(props: { label?: string; className?: string } | undefined) {
  if (!props?.label) return null;
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", props.className)}>
      {props.label}
    </span>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
          <dd className="min-w-0 flex-1 break-words text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex justify-between",
        strong ? "font-semibold text-slate-900" : "text-slate-600",
      )}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
