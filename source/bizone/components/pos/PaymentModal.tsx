"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Printer, Trash2, X, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { vietQrPayload } from "@/lib/pos/vietqr";
import type { DisplayQr, PayhubIntentView, PaymentCompleted } from "@/lib/pos/protocol";
import type { PaymentInput, PaymentMethod } from "@/lib/validators/pos";
import {
  apiContext,
  errorMessage,
  fmtMoney,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
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
/** Labels incl. server-side credit lines (payments shown on invoices / shift summary) */
export const ANY_METHOD_LABEL: Record<string, string> = {
  ...METHOD_LABEL,
  exchange: "Cấn trừ hàng đổi",
  deposit: "Tiền cọc",
};
const METHODS = Object.keys(METHOD_LABEL) as PaymentMethod[];

/** What the done screen shows: an invoice (printable) or another kind of receipt (deposit) */
export interface PaymentResult extends PaymentCompleted {
  headline?: string;
  notes?: string[];
}

interface PaymentModalProps {
  open: boolean;
  initialMethod: PaymentMethod;
  total: number;
  /** Shown in the bank note so the shop can match the transfer */
  reference: string;
  store: StoreInfo | null;
  /** Shift + auth for Payment Hub card/QR (omit to disable Payment Hub in this modal) */
  sessionId?: number;
  auth?: ApiAuth;
  /** Latest Payment Hub update pushed over WS (faster than polling) */
  payhubEvent?: PayhubIntentView | null;
  title?: string;
  /** Deposits are taken exactly — no change */
  allowChange?: boolean;
  onClose: () => void;
  onShowQr: (qr: DisplayQr | null) => void;
  onConfirm: (payments: PaymentInput[]) => Promise<PaymentResult>;
  onPrint?: (invoiceId: number) => void;
}

const POLL_MS = 2_500;

/** Modal thanh toán: chọn phương thức, nhập tiền khách, tính tiền thừa, QR / thẻ qua Payment Hub */
export function PaymentModal({
  open,
  initialMethod,
  total,
  reference,
  store,
  sessionId,
  auth,
  payhubEvent,
  title = "Thanh toán",
  allowChange = true,
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
  const [done, setDone] = useState<PaymentResult | null>(null);
  /** Card / QR through Payment Hub (auto-confirmed) vs manual (own terminal / shop QR) */
  const [viaHub, setViaHub] = useState(true);
  const [intent, setIntent] = useState<PayhubIntentView | null>(null);
  const [hubBusy, setHubBusy] = useState(false);

  const hubEnabled = !!store?.payhubEnabled && !!auth && !!sessionId;
  const hubMethod = method === "card" || method === "qr";
  const useHub = hubEnabled && hubMethod && viaHub;

  const linesRef = useRef<PaymentInput[]>([]);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const busyRef = useRef(false);
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
    setIntent(null);
    setViaHub(true);
    setAmount(String(total));
  }, [open, initialMethod, total]);

  const bankQr = useMemo<DisplayQr | null>(() => {
    if (useHub) return null;
    if (!store?.bank || (method !== "transfer" && method !== "qr") || due <= 0) return null;
    const amt = entered > 0 ? Math.min(entered, due) : due;
    return {
      amount: amt,
      payload: vietQrPayload(store.bank, amt, reference),
      bankName: store.bank.bankName,
      accountNo: store.bank.accountNo,
      accountName: store.bank.accountName,
      kind: "bank",
    };
  }, [store, method, due, entered, reference, useHub]);

  const hubQr = useMemo<DisplayQr | null>(() => {
    if (!intent || intent.status !== "pending") return null;
    const payload = intent.method === "qr" ? intent.qrData : intent.paymentUrl;
    if (!payload) return null;
    return {
      amount: intent.amount,
      payload,
      bankName: intent.method === "qr" ? "Payment Hub · VietQR" : "Thanh toán thẻ",
      accountNo: intent.txnCode ?? "",
      accountName: "",
      kind: intent.method === "qr" ? "payhub" : "card",
      caption:
        intent.method === "qr"
          ? "Quét bằng app ngân hàng — tự xác nhận khi tiền về"
          : "Quét bằng điện thoại để thanh toán thẻ qua cổng",
    };
  }, [intent]);

  // Mirror the QR to the customer display while it is on screen here
  const shownQr = hubQr ?? bankQr;
  useEffect(() => {
    if (!open || done) return;
    onShowQr(shownQr);
  }, [open, done, shownQr, onShowQr]);

  function pickMethod(m: PaymentMethod) {
    if (intent?.status === "pending") return setError("Huỷ yêu cầu Payment Hub đang chờ trước");
    setMethod(m);
    setError(null);
    setAmount(String(due));
  }

  function addLine() {
    if (useHub) return setError("Thanh toán Payment Hub được thêm tự động khi khách trả xong");
    if (!(entered > 0)) return setError("Nhập số tiền");
    if ((method !== "cash" || !allowChange) && entered > due)
      return setError(`${METHOD_LABEL[method]} không được vượt số còn lại`);
    setLines((prev) => [...prev, { method, amount: entered, referenceCode: refCode || null }]);
    setRefCode("");
    setAmount(String(Math.max(0, due - entered)));
    setError(null);
  }

  // What will be sent: the split lines plus whatever is entered now (Payment Hub lines are
  // added only once paid, so a pending hub request contributes nothing yet)
  const payments: PaymentInput[] = useMemo(
    () =>
      entered > 0 && !useHub
        ? [...lines, { method, amount: entered, referenceCode: refCode || null }]
        : lines,
    [lines, entered, method, refCode, useHub],
  );
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const change = Math.max(0, paidTotal - total);
  const short = Math.max(0, total - paidTotal);

  const confirmWith = useCallback(
    async (list: PaymentInput[]) => {
      if (busyRef.current || done) return;
      const paid = list.reduce((s, p) => s + p.amount, 0);
      if (paid < total) return setError(`Còn thiếu ${fmtMoney(total - paid)}`);
      if (!allowChange && paid > total) return setError("Số tiền vượt số cần thu");
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        setDone(await onConfirm(list));
        onShowQr(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [done, total, allowChange, onConfirm, onShowQr],
  );

  // ── Payment Hub ─────────────────────────────────────────────────────────────

  async function startHub() {
    if (!auth || !sessionId) return;
    const amt = entered > 0 ? Math.min(entered, due) : due;
    if (!(amt > 0)) return setError("Không còn số tiền cần thanh toán");
    setHubBusy(true);
    setError(null);
    try {
      const created = await trpc.pos.payhubCreate.mutate(
        { cashSessionId: sessionId, method: method as "qr" | "card", amount: Math.round(amt) },
        apiContext(auth),
      );
      setIntent(created);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setHubBusy(false);
    }
  }

  async function cancelHub() {
    if (!auth || !intent) return;
    try {
      setIntent(await trpc.pos.payhubCancel.mutate({ id: intent.id }, apiContext(auth)));
    } catch (e) {
      setError(errorMessage(e));
    }
    setIntent(null);
  }

  // Paid → becomes a payment line (and completes the sale when it covers everything)
  const applied = useRef<number | null>(null);
  const onHubUpdate = useCallback(
    (u: PayhubIntentView) => {
      setIntent((cur) => (cur && cur.id === u.id ? u : cur));
      if (u.status !== "success" || u.used || applied.current === u.id) return;
      applied.current = u.id;
      const line: PaymentInput = {
        method: u.method,
        amount: u.amount,
        referenceCode: u.txnCode,
        intentId: u.id,
      };
      setIntent(null);
      const next = [...linesRef.current, line];
      linesRef.current = next;
      setLines(next);
      const paid = next.reduce((s, l) => s + l.amount, 0);
      if (paid >= total) void confirmWith(next);
      else setAmount(String(Math.max(0, total - paid)));
    },
    [total, confirmWith],
  );

  // WS push from the server (external event) — applied like a poll result
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (payhubEvent && intent && payhubEvent.id === intent.id) onHubUpdate(payhubEvent);
  }, [payhubEvent, intent, onHubUpdate]);

  // Poll while waiting: the server asks Payment Hub when no webhook has arrived yet
  useEffect(() => {
    if (!open || !auth || !intent || intent.status !== "pending") return;
    const id = intent.id;
    const t = setInterval(() => {
      trpc.pos.payhubStatus
        .query({ id }, apiContext(auth))
        .then(onHubUpdate)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [open, auth, intent, onHubUpdate]);

  async function close() {
    if (intent?.status === "pending") await cancelHub();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        void close();
      } else if (
        (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) ||
        e.key === "F9"
      ) {
        e.preventDefault();
        if (done) onClose();
        else if (!useHub) void confirmWith(payments);
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
      aria-label={title}
    >
      <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">
            {done ? (done.headline ?? "Thanh toán thành công") : title}
          </h2>
          <button
            onClick={() => void close()}
            aria-label="Đóng"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <CheckCircle2 className="h-16 w-16 text-emerald-500" />
            <p className="text-sm text-gray-500">{done.invoiceCode}</p>
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
            {done.notes?.map((n) => (
              <p key={n} className="text-sm text-gray-600">
                {n}
              </p>
            ))}
            <div className="mt-4 flex gap-3">
              {done.invoiceId > 0 && onPrint && (
                <button
                  onClick={() => onPrint(done.invoiceId)}
                  className="flex h-12 items-center gap-2 rounded-xl border border-gray-300 px-5 font-medium hover:bg-gray-50"
                >
                  <Printer className="h-5 w-5" /> In hóa đơn
                </button>
              )}
              <button
                onClick={onClose}
                className="h-12 rounded-xl bg-blue-600 px-6 font-semibold text-white hover:bg-blue-700"
              >
                Xong (Enter)
              </button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-6 md:grid-cols-[1fr_280px]">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="tablist">
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

              {hubEnabled && hubMethod && (
                <div className="flex rounded-lg bg-gray-100 p-1 text-sm" role="radiogroup">
                  {[
                    [true, "Qua Payment Hub (tự xác nhận)"],
                    [false, method === "card" ? "Máy POS thẻ riêng" : "QR tài khoản cửa hàng"],
                  ].map(([v, label]) => (
                    <button
                      key={String(v)}
                      role="radio"
                      aria-checked={viaHub === v}
                      disabled={intent?.status === "pending"}
                      onClick={() => setViaHub(v as boolean)}
                      className={cn(
                        "h-10 flex-1 rounded-md px-2",
                        viaHub === v ? "bg-white font-semibold shadow" : "text-gray-600",
                      )}
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
              )}

              <label className="text-sm font-medium text-gray-700">
                {method === "cash"
                  ? "Tiền khách đưa"
                  : `Số tiền ${METHOD_LABEL[method].toLowerCase()}`}
                <input
                  value={amount ? Number(amount).toLocaleString("vi-VN") : ""}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  aria-label="Số tiền"
                  disabled={intent?.status === "pending"}
                  className="mt-1 h-14 w-full rounded-xl border border-gray-300 px-4 text-right text-2xl font-bold outline-none focus:border-blue-500 disabled:bg-gray-50"
                />
              </label>

              {method === "cash" ? (
                <NumericKeypad value={amount} onChange={setAmount} due={due} />
              ) : useHub ? (
                <div
                  className="flex flex-col items-center gap-3 rounded-xl bg-gray-50 p-4"
                  data-testid="payhub-panel"
                >
                  {intent?.status === "pending" && hubQr ? (
                    <>
                      <PaymentQr payload={hubQr.payload} size={220} />
                      <p className="text-center text-sm text-gray-600">
                        {hubQr.caption}
                        <br />
                        Mã GD <strong>{intent.txnCode}</strong> —{" "}
                        <strong>{fmtMoney(intent.amount)}</strong>
                      </p>
                      <p className="flex items-center gap-2 text-sm text-blue-700">
                        <Loader2 className="h-4 w-4 animate-spin" /> Đang chờ khách thanh toán…
                      </p>
                      {intent.method === "card" && intent.paymentUrl && (
                        <a
                          href={intent.paymentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-sm text-blue-600 underline"
                        >
                          Mở trang thanh toán thẻ <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => void cancelHub()}
                        className="h-10 rounded-lg border border-gray-300 px-4 text-sm hover:bg-white"
                      >
                        Huỷ yêu cầu
                      </button>
                    </>
                  ) : (
                    <>
                      {intent && intent.status !== "pending" && intent.status !== "success" && (
                        <p className="text-center text-sm text-red-600">
                          Giao dịch {intent.txnCode}{" "}
                          {intent.status === "expired" ? "đã hết hạn" : "không thành công"}
                          {intent.failureReason ? `: ${intent.failureReason}` : ""}
                        </p>
                      )}
                      <button
                        onClick={() => void startHub()}
                        disabled={hubBusy || due <= 0}
                        className="flex h-12 items-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                      >
                        {hubBusy ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Zap className="h-5 w-5" />
                        )}
                        {method === "qr" ? "Tạo QR Payment Hub" : "Tạo thanh toán thẻ qua cổng"}
                      </button>
                      <p className="text-center text-xs text-gray-500">
                        QR / link hiện trên màn hình khách; hoá đơn tự hoàn tất khi Payment Hub báo
                        đã thanh toán.
                      </p>
                    </>
                  )}
                </div>
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

              {!useHub && (
                <button
                  onClick={addLine}
                  className="h-11 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
                >
                  + Thanh toán kết hợp (thêm phương thức khác)
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-4">
              <Line label="Cần thanh toán" value={fmtMoney(total)} strong />
              {lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>
                    {METHOD_LABEL[l.method]}
                    {l.intentId && <span className="ml-1 text-xs text-indigo-600">(Hub ✓)</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {fmtMoney(l.amount)}
                    {!l.intentId && (
                      <button
                        aria-label="Bỏ dòng thanh toán"
                        onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                      </button>
                    )}
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
                onClick={() => void confirmWith(payments)}
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
