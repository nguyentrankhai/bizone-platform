"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, PackageCheck, Pencil, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtMoney,
  fmtNumber,
  type ApiAuth,
} from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  btnPrimary,
  btnSecondary,
  inputCls,
  useLoad,
} from "@/components/staff/shared";
import { PaymentModal } from "./PaymentModal";
import {
  Badge,
  DEBT_STATUS,
  PAYMENT_METHODS,
  PO_STATUS,
  SupplierNav,
  fmtDay,
  vnToday,
  type Outputs,
} from "./shared";

type Po = Outputs["purchaseOrder"]["get"];

export function PurchaseOrderDetail({ auth, poId }: { auth: ApiAuth; poId: number }) {
  const ctx = apiContext(auth);
  const data = useLoad(`po:${poId}`, () => trpc.purchaseOrder.get.query({ id: poId }, ctx));
  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const po = data.data;

  if (!po) {
    return (
      <div className="space-y-4">
        <SupplierNav />
        <ErrorBox message={data.error} />
        {!data.error && <p className="py-12 text-center text-sm text-slate-400">Đang tải…</p>}
      </div>
    );
  }

  const open = po.status === "pending" || po.status === "partial";
  const ordered = po.items.reduce((s, i) => s + i.quantity, 0);
  const received = po.items.reduce((s, i) => s + i.receivedQuantity, 0);

  return (
    <div className="space-y-5">
      <SupplierNav />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/purchase-orders"
            className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> Đơn nhập hàng
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">{po.poCode}</h1>
            <Badge map={PO_STATUS} value={po.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            <Link
              href={`/suppliers/${po.supplier.id}`}
              className="font-medium text-slate-700 hover:text-primary"
            >
              {po.supplier.name}
            </Link>{" "}
            · Kho {po.warehouse?.name ?? "—"} · Tạo {fmtDate(po.createdAt, true)}
            {po.createdBy && <> bởi {po.createdBy.fullName || po.createdBy.username}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {po.status === "pending" && (
            <Link href={`/purchase-orders/${po.id}/edit`} className={btnSecondary}>
              <Pencil className="h-4 w-4" /> Sửa
            </Link>
          )}
          {open && (
            <button type="button" className={btnSecondary} onClick={() => setCancelling(true)}>
              <Ban className="h-4 w-4" /> {po.status === "partial" ? "Huỷ phần còn lại" : "Huỷ đơn"}
            </button>
          )}
          {po.debt && po.debt.remainingAmount > 0 && (
            <button type="button" className={btnSecondary} onClick={() => setPaying(true)}>
              <Wallet className="h-4 w-4" /> Thanh toán
            </button>
          )}
          {open && (
            <button type="button" className={btnPrimary} onClick={() => setReceiving(true)}>
              <PackageCheck className="h-4 w-4" /> Nhận hàng
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Box
          label="Tổng đơn"
          value={fmtMoney(po.totalAmount)}
          sub={`${fmtNumber(received)}/${fmtNumber(ordered)} đã nhận`}
        />
        <Box
          label="Công nợ"
          value={po.debt ? fmtMoney(po.debt.remainingAmount) : "—"}
          sub={
            po.debt
              ? `Phải trả ${fmtMoney(po.debt.totalAmount)} · đã trả ${fmtMoney(po.debt.paidAmount)}`
              : "Phát sinh khi nhận hàng"
          }
          badge={
            po.debt ? (
              <Badge map={DEBT_STATUS} value={po.debt.isOverdue ? "overdue" : po.debt.status} />
            ) : null
          }
        />
        <Box
          label="Hạn thanh toán"
          value={fmtDay(po.debt?.dueDate)}
          sub={
            po.supplier.paymentTerms
              ? `Điều khoản: ${po.supplier.paymentTerms}`
              : "NCC chưa có điều khoản"
          }
          danger={po.debt?.isOverdue}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          Sản phẩm
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">Sản phẩm</th>
                <th className="px-4 py-2 text-right">Đặt</th>
                <th className="px-4 py-2 text-right">Đã nhận</th>
                <th className="px-4 py-2 text-right">Đơn giá</th>
                <th className="px-4 py-2 text-right">CK %</th>
                <th className="px-4 py-2 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {po.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-800">{i.product.name}</div>
                    <div className="text-xs text-slate-500">{i.variant?.sku ?? i.product.sku}</div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtNumber(i.quantity)}</td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      i.receivedQuantity >= i.quantity
                        ? "text-emerald-700"
                        : i.receivedQuantity > 0
                          ? "text-blue-700"
                          : "text-slate-400"
                    }`}
                  >
                    {fmtNumber(i.receivedQuantity)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(i.unitCost)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {i.discountPercent ? fmtNumber(i.discountPercent) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {fmtMoney(i.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <Total label="Tiền hàng" value={po.subtotal} />
              {po.discountAmount > 0 && <Total label="Chiết khấu đơn" value={-po.discountAmount} />}
              {po.taxAmount > 0 && <Total label="Thuế / phí" value={po.taxAmount} />}
              <Total label="Tổng cộng" value={po.totalAmount} strong />
            </tfoot>
          </table>
        </div>
      </section>

      {po.notes && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm whitespace-pre-line text-slate-700">
          {po.notes}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Phiếu nhập kho ({po.receipts.length})
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {po.receipts.length === 0 && (
              <li className="px-4 py-6 text-center text-slate-400">Chưa nhận hàng</li>
            )}
            {po.receipts.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">{r.code}</span>
                  <span className="text-slate-500">{fmtDate(r.createdAt, true)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {r.items
                    .map((it) => {
                      const line = po.items.find(
                        (x) =>
                          x.product.id === it.productId && (x.variant?.id ?? null) === it.variantId,
                      );
                      return `${line?.product.name ?? `#${it.productId}`} × ${fmtNumber(it.quantity)}${
                        it.batchCode
                          ? ` (lô ${it.batchCode}${it.expiryDate ? `, HSD ${fmtDay(it.expiryDate)}` : ""})`
                          : ""
                      }`;
                    })
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Thanh toán ({po.payments.length})
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {po.payments.length === 0 && (
              <li className="px-4 py-6 text-center text-slate-400">Chưa thanh toán</li>
            )}
            {po.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  {fmtDay(p.paymentDate)} ·{" "}
                  {PAYMENT_METHODS[p.paymentMethod ?? ""] ?? p.paymentMethod}
                  {p.referenceCode && <span className="text-slate-500"> · {p.referenceCode}</span>}
                </span>
                <span className="font-medium tabular-nums">{fmtMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {receiving && (
        <ReceiveModal
          auth={auth}
          po={po}
          onClose={() => setReceiving(false)}
          onDone={() => {
            setReceiving(false);
            data.reload();
          }}
        />
      )}
      {cancelling && (
        <CancelModal
          auth={auth}
          po={po}
          onClose={() => setCancelling(false)}
          onDone={() => {
            setCancelling(false);
            data.reload();
          }}
        />
      )}
      {paying && po.debt && (
        <PaymentModal
          auth={auth}
          supplierId={po.supplier.id}
          supplierName={po.supplier.name}
          poId={po.id}
          poCode={po.poCode}
          maxAmount={po.debt.remainingAmount}
          onClose={() => setPaying(false)}
          onPaid={() => {
            setPaying(false);
            data.reload();
          }}
        />
      )}
    </div>
  );
}

function Box({
  label,
  value,
  sub,
  badge,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        {label}
        {badge}
      </div>
      <div
        className={`mt-1 text-xl font-bold tabular-nums ${danger ? "text-red-600" : "text-slate-800"}`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? "bg-slate-50" : undefined}>
      <td
        colSpan={5}
        className={`px-4 py-1.5 text-right ${strong ? "font-semibold text-slate-700" : "text-slate-500"}`}
      >
        {label}
      </td>
      <td
        className={`px-4 py-1.5 text-right tabular-nums ${strong ? "font-bold text-slate-900" : ""}`}
      >
        {fmtMoney(value)}
      </td>
    </tr>
  );
}

interface ReceiveLine {
  itemId: number;
  name: string;
  sku: string;
  left: number;
  quantity: string;
  batchCode: string;
  expiryDate: string;
}

function ReceiveModal({
  auth,
  po,
  onClose,
  onDone,
}: {
  auth: ApiAuth;
  po: Po;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [lines, setLines] = useState<ReceiveLine[]>(
    po.items
      .filter((i) => i.receivedQuantity < i.quantity)
      .map((i) => ({
        itemId: i.id,
        name: i.product.name,
        sku: i.variant?.sku ?? i.product.sku,
        left: i.quantity - i.receivedQuantity,
        quantity: String(i.quantity - i.receivedQuantity),
        batchCode: "",
        expiryDate: "",
      })),
  );
  const [dueDate, setDueDate] = useState(po.debt?.dueDate ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (id: number, field: "quantity" | "batchCode" | "expiryDate", value: string) =>
    setLines((ls) => ls.map((l) => (l.itemId === id ? { ...l, [field]: value } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const items = lines.map((l) => ({ ...l, qty: Number(l.quantity || 0) }));
    const bad = items.find((l) => !Number.isInteger(l.qty) || l.qty < 0 || l.qty > l.left);
    if (bad) return setError(`"${bad.name}": nhận từ 0 đến ${bad.left}`);
    if (!items.some((l) => l.qty > 0)) return setError("Nhập số lượng nhận cho ít nhất 1 sản phẩm");
    setSaving(true);
    try {
      const res = await trpc.purchaseOrder.receive.mutate(
        {
          id: po.id,
          items: items
            .filter((l) => l.qty > 0)
            .map((l) => ({
              itemId: l.itemId,
              quantity: l.qty,
              ...(l.batchCode.trim() ? { batchCode: l.batchCode.trim() } : {}),
              ...(l.expiryDate ? { expiryDate: l.expiryDate } : {}),
            })),
          ...(dueDate ? { dueDate } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        apiContext(auth),
      );
      toast.success(
        `Đã nhập kho (phiếu ${res.receipt.transactionCode}) — ${
          res.status === "received" ? "đơn đã nhận đủ" : "còn hàng chưa nhận"
        }`,
      );
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="xl" title={`Nhận hàng — ${po.poCode}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-600">
          Hàng nhận sẽ cộng vào tồn kho <strong>{po.warehouse?.name}</strong> qua phiếu nhập kho tự
          động, và ghi công nợ phải trả cho {po.supplier.name}.
        </p>
        <ErrorBox message={error} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm [&_th]:whitespace-nowrap">
            <thead className="text-left text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-2">Sản phẩm</th>
                <th className="w-20 px-2 py-2 text-right">Còn lại</th>
                <th className="w-28 px-2 py-2 text-right">Nhận</th>
                <th className="w-36 px-2 py-2">Số lô</th>
                <th className="w-40 px-2 py-2">Hạn sử dụng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.itemId}>
                  <td className="py-2 pr-2">
                    <div className="font-medium text-slate-800">{l.name}</div>
                    <div className="text-xs text-slate-500">{l.sku}</div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.left}</td>
                  <td className="px-2 py-2">
                    <input
                      className={`${inputCls} text-right tabular-nums`}
                      inputMode="numeric"
                      value={l.quantity}
                      onChange={(e) => set(l.itemId, "quantity", e.target.value)}
                      aria-label={`Số lượng nhận ${l.name}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={inputCls}
                      value={l.batchCode}
                      placeholder="Tuỳ chọn"
                      onChange={(e) => set(l.itemId, "batchCode", e.target.value)}
                      aria-label={`Số lô ${l.name}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="date"
                      className={inputCls}
                      value={l.expiryDate}
                      onChange={(e) => set(l.itemId, "expiryDate", e.target.value)}
                      aria-label={`Hạn sử dụng ${l.name}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Hạn thanh toán công nợ"
            htmlFor="rcv-due"
            hint={
              po.debt ? "Để nguyên nếu không đổi" : "Để trống: theo điều khoản thanh toán của NCC"
            }
          >
            <input
              id="rcv-due"
              type="date"
              className={inputCls}
              value={dueDate}
              min={vnToday()}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field label="Ghi chú phiếu nhập" htmlFor="rcv-notes">
            <input
              id="rcv-notes"
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Đang nhập kho…" : "Xác nhận nhập kho"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CancelModal({
  auth,
  po,
  onClose,
  onDone,
}: {
  auth: ApiAuth;
  po: Po;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await trpc.purchaseOrder.cancel.mutate(
        { id: po.id, reason: reason.trim() || undefined },
        apiContext(auth),
      );
      toast.success(`Đã huỷ ${po.status === "partial" ? "phần còn lại của " : ""}đơn ${po.poCode}`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={po.status === "partial" ? "Huỷ phần chưa nhận" : `Huỷ đơn ${po.poCode}`}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          {po.status === "partial"
            ? "Hàng đã nhận và công nợ của phần đó được giữ nguyên; phần chưa nhận sẽ không nhận được nữa."
            : "Đơn chưa nhận hàng nên không ảnh hưởng tồn kho hay công nợ."}
        </p>
        <ErrorBox message={error} />
        <Field label="Lý do" htmlFor="cancel-reason">
          <input
            id="cancel-reason"
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Không
          </button>
          <button
            type="submit"
            className={`${btnPrimary} bg-red-600 hover:bg-red-700`}
            disabled={saving}
          >
            {saving ? "Đang huỷ…" : "Xác nhận huỷ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
