"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, inputCls } from "@/components/staff/shared";
import { PAYMENT_METHODS, vnToday } from "./shared";
import { FundSelect, useFundOptions } from "@/components/accounting/shared";

/**
 * Record a payment to a supplier: for one PO (`poId`) or, without it, spread over the oldest
 * open debts first. `maxAmount` is what is owed in that scope (server re-checks).
 */
export function PaymentModal({
  auth,
  supplierId,
  supplierName,
  poId,
  poCode,
  maxAmount,
  onClose,
  onPaid,
}: {
  auth: ApiAuth;
  supplierId: number;
  supplierName: string;
  poId?: number;
  poCode?: string;
  maxAmount: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(Math.round(maxAmount)));
  const [method, setMethod] = useState<keyof typeof PAYMENT_METHODS>("bank_transfer");
  const [date, setDate] = useState(vnToday());
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // P4.8: quỹ chi tiền — undefined = tự chọn theo hình thức (tiền mặt → quỹ tiền mặt, CK → ngân hàng)
  const funds = useFundOptions(auth);
  const [pickedFund, setPickedFund] = useState<number | null | undefined>(undefined);
  const autoFund =
    (funds.data ?? []).find(
      (f) => f.type === (method === "cash" ? "cash" : method === "bank_transfer" ? "bank" : ""),
    )?.id ?? null;
  const fundId = pickedFund === undefined ? autoFund : pickedFund;

  const value = Number(amount.replace(/[^\d.]/g, ""));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!(value > 0)) return setError("Số tiền phải lớn hơn 0");
    if (value > maxAmount + 0.001)
      return setError(`Không được vượt số còn nợ ${fmtMoney(maxAmount)}`);
    setSaving(true);
    setError("");
    try {
      const res = await trpc.supplier.recordPayment.mutate(
        {
          supplierId,
          ...(poId ? { poId } : {}),
          amount: value,
          paymentMethod: method as "cash" | "bank_transfer" | "card" | "other",
          paymentDate: date,
          referenceCode: ref.trim() || undefined,
          notes: notes.trim() || undefined,
          ...(fundId ? { fundId } : {}),
        },
        apiContext(auth),
      );
      toast.success(
        `Đã ghi nhận thanh toán ${fmtMoney(res.amount)}${
          res.payments.length > 1 ? ` cho ${res.payments.length} đơn nhập` : ""
        } — phiếu chi ${res.voucher.code}`,
      );
      onPaid();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Ghi nhận thanh toán cho nhà cung cấp">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-600">
          {supplierName}
          {poCode ? ` · đơn ${poCode}` : " · trừ vào các khoản nợ cũ nhất trước"} — còn nợ{" "}
          <strong className="text-slate-800">{fmtMoney(maxAmount)}</strong>
        </p>
        <ErrorBox message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Số tiền (₫) *" htmlFor="pay-amount">
            <input
              id="pay-amount"
              className={`${inputCls} text-right tabular-nums`}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Ngày thanh toán" htmlFor="pay-date">
            <input
              id="pay-date"
              type="date"
              className={inputCls}
              value={date}
              max={vnToday()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Hình thức" htmlFor="pay-method">
            <select
              id="pay-method"
              className={inputCls}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {Object.entries(PAYMENT_METHODS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Số chứng từ / mã giao dịch" htmlFor="pay-ref">
            <input
              id="pay-ref"
              className={inputCls}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Chi từ quỹ"
          htmlFor="pay-fund"
          hint="Hệ thống tự lập phiếu chi “Tiền nhập hàng” trong sổ thu chi; chọn quỹ để trừ số dư quỹ"
        >
          <FundSelect
            id="pay-fund"
            funds={funds.data ?? []}
            value={fundId}
            onChange={setPickedFund}
          />
        </Field>
        <Field label="Ghi chú" htmlFor="pay-notes">
          <input
            id="pay-notes"
            className={inputCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Đang lưu…" : "Ghi nhận thanh toán"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
