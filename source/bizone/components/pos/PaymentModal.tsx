"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Printer, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { vietQrPayload } from "@/lib/pos/vietqr";
import type { DisplayQr, PaymentCompleted } from "@/lib/pos/protocol";
import type { PaymentInput, PaymentMethod } from "@/lib/validators/pos";
import { errorMessage, fmtMoney, type RouterOutputs } from "@/components/inventory/shared";
import { NumericKeypad } from "./NumericKeypad";
import { PaymentQr } from "./PaymentQr";

type StoreInfo = RouterOutputs["pos"]["storeInfo"];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tiền mặt",
  transfer: "Chuyển khoản",
  card: "Thẻ",
  wallet: "Ví điện tử",
  qr: "QR Code",
};
const METHODS = Object.keys(METHOD_LABEL) as PaymentMethod[];

interface PaymentModalProps {
  open: boolean;
  initialMethod: PaymentMethod;
  total: number;
  /** Shown in the bank note so the shop can match the transfer */
  reference: string;
  store: StoreInfo | null;
  onClose: () => void;
  onShowQr: (qr: DisplayQr | null) => void;
  onConfirm: (payments: PaymentInput[]) => Promise<PaymentCompleted>;
  onPrint: (invoiceId: number) => void;
}

/** Modal thanh toán: chọn phương thức, nhập tiền khách, tính tiền thừa, QR chuyển khoản */
export function PaymentModal({
  open,
  initialMethod,
  total,
  reference,
  store,
  onClose,
  onShowQr,
  onConfirm,
  onPrint,
}: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [amount, setAmount] = useState("");
  const [refCode, setRefCode] = useState("");
  const [lines, setLines] = useState<PaymentInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PaymentCompleted | null>(null);

  const paidLines = lines.reduce((s, l) => s + l.amount, 0);
  const due = Math.max(0, total - paidLines);
  const entered = Number(amount || 0);

  // Reset whenever the modal opens for a new sale
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMethod(initialMethod);
    setLines([]);
    setRefCode("");
    setError(null);
    setDone(null);
    setAmount(String(total));
  }, [open, initialMethod, total]);

  const bankQr = useMemo<DisplayQr | null>(() => {
    if (!store?.bank || (method !== "transfer" && method !== "qr") || due <= 0) return null;
    const amt = entered > 0 ? Math.min(entered, due) : due;
    return {
      amount: amt,
      payload: vietQrPayload(store.bank, amt, reference),
      bankName: store.bank.bankName,
      accountNo: store.bank.accountNo,
      accountName: store.bank.accountName,
    };
  }, [store, method, due, entered, reference]);

  // Mirror the QR to the customer display while it is on screen here
  useEffect(() => {
    if (!open || done) return;
    onShowQr(bankQr);
  }, [open, done, bankQr, onShowQr]);

  function pickMethod(m: PaymentMethod) {
    setMethod(m);
    setError(null);
    setAmount(String(due));
  }

  function addLine() {
    if (!(entered > 0)) return setError("Nhập số tiền");
    if (method !== "cash" && entered > due)
      return setError(`${METHOD_LABEL[method]} không được vượt số còn lại`);
    setLines((prev) => [...prev, { method, amount: entered, referenceCode: refCode || null }]);
    setRefCode("");
    setAmount(String(Math.max(0, due - entered)));
    setError(null);
  }

  // What will be sent: the split lines plus whatever is entered now
  const payments: PaymentInput[] = useMemo(
    () =>
      entered > 0 ? [...lines, { method, amount: entered, referenceCode: refCode || null }] : lines,
    [lines, entered, method, refCode],
  );
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const change = Math.max(0, paidTotal - total);
  const short = Math.max(0, total - paidTotal);

  async function confirm() {
    if (busy || done) return;
    if (short > 0) return setError(`Còn thiếu ${fmtMoney(short)}`);
    setBusy(true);
    setError(null);
    try {
      setDone(await onConfirm(payments));
      onShowQr(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (
        (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) ||
        e.key === "F9"
      ) {
        e.preventDefault();
        if (done) onClose();
        else void confirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  return (
    <div
      // Above the toast container (z-50) so a toast never covers the confirm button
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Thanh toán"
    >
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{done ? "Thanh toán thành công" : "Thanh toán"}</h2>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <CheckCircle2 className="h-16 w-16 text-emerald-500" />
            <p className="text-sm text-gray-500">Hóa đơn {done.invoiceCode}</p>
            <p className="text-3xl font-bold">{fmtMoney(done.amount)}</p>
            {done.change > 0 && (
              <p className="text-xl">
                Tiền thừa trả khách:{" "}
                <strong className="text-emerald-600">{fmtMoney(done.change)}</strong>
              </p>
            )}
            {done.pointsEarned > 0 && (
              <p className="text-sm text-gray-500">Khách được cộng {done.pointsEarned} điểm</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => onPrint(done.invoiceId)}
                className="flex h-12 items-center gap-2 rounded-xl border border-gray-300 px-5 font-medium hover:bg-gray-50"
              >
                <Printer className="h-5 w-5" /> In hóa đơn
              </button>
              <button
                onClick={onClose}
                className="h-12 rounded-xl bg-blue-600 px-6 font-semibold text-white hover:bg-blue-700"
              >
                Đơn mới (Enter)
              </button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 md:grid-cols-[1fr_280px]">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-5 gap-2" role="tablist">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={method === m}
                    onClick={() => pickMethod(m)}
                    className={cn(
                      "h-12 rounded-lg border text-sm font-medium",
                      method === m
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-200 hover:bg-gray-50",
                    )}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>

              <label className="text-sm font-medium text-gray-700">
                {method === "cash"
                  ? "Tiền khách đưa"
                  : `Số tiền ${METHOD_LABEL[method].toLowerCase()}`}
                <input
                  value={amount ? Number(amount).toLocaleString("vi-VN") : ""}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  aria-label="Số tiền"
                  className="mt-1 h-14 w-full rounded-xl border border-gray-300 px-4 text-right text-2xl font-bold outline-none focus:border-blue-500"
                />
              </label>

              {method === "cash" ? (
                <NumericKeypad value={amount} onChange={setAmount} due={due} />
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl bg-gray-50 p-4">
                  {bankQr ? (
                    <>
                      <PaymentQr payload={bankQr.payload} size={200} />
                      <p className="text-center text-sm text-gray-600">
                        {bankQr.bankName} · {bankQr.accountNo}
                        <br />
                        {bankQr.accountName} — <strong>{fmtMoney(bankQr.amount)}</strong>
                      </p>
                    </>
                  ) : method === "transfer" || method === "qr" ? (
                    <p className="text-center text-sm text-amber-700">
                      Chưa cấu hình tài khoản ngân hàng (bank_bin, bank_account_no trong Cài đặt) —
                      không tạo được VietQR.
                    </p>
                  ) : null}
                  <input
                    value={refCode}
                    onChange={(e) => setRefCode(e.target.value)}
                    placeholder="Mã giao dịch / 4 số cuối thẻ (tuỳ chọn)"
                    aria-label="Mã tham chiếu"
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <button
                onClick={addLine}
                className="h-11 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
              >
                + Thanh toán kết hợp (thêm phương thức khác)
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-4">
              <Line label="Cần thanh toán" value={fmtMoney(total)} strong />
              {lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{METHOD_LABEL[l.method]}</span>
                  <span className="flex items-center gap-2">
                    {fmtMoney(l.amount)}
                    <button
                      aria-label="Bỏ dòng thanh toán"
                      onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </span>
                </div>
              ))}
              <Line label="Khách trả" value={fmtMoney(paidTotal)} />
              {short > 0 ? (
                <Line label="Còn thiếu" value={fmtMoney(short)} className="text-red-600" />
              ) : (
                <Line
                  label="Tiền thừa"
                  value={fmtMoney(change)}
                  className="text-xl text-emerald-600"
                  strong
                />
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={confirm}
                disabled={busy || short > 0}
                className="mt-auto h-14 rounded-xl bg-blue-600 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {busy ? "Đang xử lý..." : "Xác nhận (Enter)"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between", className)}>
      <span className="text-sm text-gray-600">{label}</span>
      <span className={strong ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
