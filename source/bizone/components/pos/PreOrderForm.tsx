"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, PackageCheck, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import type { CartSnapshot, DisplayQr, PayhubIntentView } from "@/lib/pos/protocol";
import type { PaymentInput, PaymentMethod } from "@/lib/validators/pos";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtMoney,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { METHOD_LABEL, PaymentModal, type PaymentResult } from "./PaymentModal";

type Preorder = RouterOutputs["pos"]["preorders"]["items"][number];
type PreorderQuote = RouterOutputs["pos"]["preorderQuote"];
type StoreInfo = RouterOutputs["pos"]["storeInfo"];
type Tab = "create" | "list";

const STATUS: Record<Preorder["status"], [string, string]> = {
  pending: ["Chờ giao", "bg-amber-100 text-amber-800"],
  completed: ["Đã giao", "bg-emerald-100 text-emerald-800"],
  cancelled: ["Đã huỷ", "bg-gray-100 text-gray-600"],
};

interface Props {
  open: boolean;
  initialTab?: Tab;
  auth: ApiAuth;
  sessionId: number;
  cart: CartSnapshot | null;
  store: StoreInfo | null;
  payhubEvent: PayhubIntentView | null;
  onShowQr: (qr: DisplayQr | null) => void;
  onClose: () => void;
  onDone: (message: string, invoiceId?: number) => void;
  onPrint: (invoiceId: number) => void;
}

/** Ngày mai theo giờ máy (gợi ý ngày hẹn giao) */
function tomorrow() {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Đơn đặt trước + đặt cọc (SRS-POS-09, P4.5). Tạo từ giỏ hàng hiện tại (cần chọn khách), thu cọc
 * (không trừ tồn, chưa tính doanh thu); khi giao: tính lại giá, cấn cọc, thu phần còn lại → hoá
 * đơn. Huỷ: hoàn cọc toàn bộ / một phần / giữ cọc.
 */
export function PreOrderForm({
  open,
  initialTab = "create",
  auth,
  sessionId,
  cart,
  store,
  payhubEvent,
  onShowQr,
  onClose,
  onDone,
  onPrint,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [dueDate, setDueDate] = useState(tomorrow());
  const [notes, setNotes] = useState("");
  const [deposit, setDeposit] = useState("");
  const [list, setList] = useState<Preorder[]>([]);
  const [status, setStatus] = useState<Preorder["status"] | "">("pending");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<Preorder | null>(null);
  const [cancelAmount, setCancelAmount] = useState("");
  const [cancelMethod, setCancelMethod] = useState<PaymentMethod>("cash");
  const [cancelReason, setCancelReason] = useState("");
  /** Payment step: deposit of a new pre-order, or the rest when handing one over */
  const [paying, setPaying] = useState<
    { kind: "deposit"; amount: number } | { kind: "complete"; quote: PreorderQuote } | null
  >(null);
  const idemKey = useRef("");
  const finished = useRef(false);

  const total = cart?.total ?? 0;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(initialTab);
    setError(null);
    setNotes("");
    setDueDate(tomorrow());
    setCancelFor(null);
    finished.current = false;
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    // Default deposit: half of the order, rounded to 1.000₫
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeposit(String(Math.round(total / 2 / 1000) * 1000));
  }, [open, total]);

  const load = useCallback(async () => {
    try {
      const r = await trpc.pos.preorders.query(
        { status: status || undefined, search: search.trim() || undefined, pageSize: 50 },
        apiContext(auth),
      );
      setList(r.items);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [auth, status, search]);

  useEffect(() => {
    if (!open || tab !== "list") return;
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [open, tab, load]);

  function startDeposit() {
    setError(null);
    if (!cart?.lines.length) return setError("Giỏ hàng trống — thêm sản phẩm khách đặt");
    if (!cart.customer) return setError("Chọn khách hàng (F3) trước khi tạo đơn đặt trước");
    const amt = Number(deposit || 0);
    if (!(amt > 0)) return setError("Nhập tiền cọc");
    if (amt > total) return setError("Tiền cọc không được vượt giá trị đơn");
    idemKey.current = crypto.randomUUID();
    setPaying({ kind: "deposit", amount: amt });
  }

  async function startComplete(p: Preorder) {
    setError(null);
    try {
      const quote = await trpc.pos.preorderQuote.query({ id: p.id }, apiContext(auth));
      idemKey.current = crypto.randomUUID();
      setPaying({ kind: "complete", quote });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function confirmCancel() {
    if (!cancelFor) return;
    try {
      const amt = cancelAmount === "" ? undefined : Number(cancelAmount);
      await trpc.pos.cancelPreorder.mutate(
        {
          id: cancelFor.id,
          refundAmount: amt,
          refundMethod: cancelMethod,
          reason: cancelReason || null,
        },
        apiContext(auth),
      );
      onDone(
        `Đã huỷ ${cancelFor.preorderCode} — hoàn cọc ${fmtMoney(amt ?? Number(cancelFor.depositAmount))}`,
      );
      setCancelFor(null);
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function confirmPayment(payments: PaymentInput[]): Promise<PaymentResult> {
    if (paying?.kind === "deposit") {
      if (payments.length !== 1) throw new Error("Tiền cọc chỉ nhận một phương thức thanh toán");
      const r = await trpc.pos.createPreorder.mutate(
        {
          cashSessionId: sessionId,
          customerId: cart!.customer!.id,
          items: cart!.lines
            .filter((l) => !l.isGift)
            .map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              quantity: l.quantity,
              discountPercent: l.discountPercent,
            })),
          couponCode: cart!.couponCode,
          dueDate: dueDate || null,
          notes: notes || null,
          deposit: payments[0],
          fromCart: true,
          idempotencyKey: idemKey.current,
        },
        apiContext(auth),
      );
      finished.current = true;
      onDone(`Đã tạo đơn đặt trước ${r.preorderCode} — cọc ${fmtMoney(r.depositAmount)}`);
      return {
        invoiceId: 0,
        invoiceCode: r.preorderCode,
        amount: r.depositAmount,
        paid: r.depositAmount,
        change: 0,
        pointsEarned: 0,
        headline: "Đã nhận cọc",
        notes: [
          `Giá trị đơn tạm tính ${fmtMoney(r.estimatedTotal)}`,
          `Còn lại khi giao: ${fmtMoney(r.remaining)}`,
        ],
      };
    }
    const q = (paying as { quote: PreorderQuote }).quote;
    const r = await trpc.pos.completePreorder.mutate(
      { id: q.preorder.id, cashSessionId: sessionId, payments, idempotencyKey: idemKey.current },
      apiContext(auth),
    );
    finished.current = true;
    onDone(`Đã giao ${r.preorderCode} — hoá đơn ${r.invoiceCode}`, r.invoiceId);
    return {
      ...r,
      headline: "Đã giao đơn đặt trước",
      notes: [
        `Cấn cọc ${fmtMoney(r.depositApplied)}`,
        ...(r.excessRefunded > 0 ? [`Hoàn cọc dư ${fmtMoney(r.excessRefunded)}`] : []),
      ],
    };
  }

  const payTotal = paying?.kind === "deposit" ? paying.amount : paying ? paying.quote.remaining : 0;

  return (
    <>
      <Modal open={open && !paying} onClose={onClose} title="Đơn đặt trước (đặt cọc)" size="xl">
        <div className="mb-4 flex rounded-lg bg-gray-100 p-1 text-sm" role="tablist">
          {(
            [
              ["create", "Tạo từ giỏ hàng"],
              ["list", "Danh sách đơn đặt"],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "h-10 flex-1 rounded-md",
                tab === k ? "bg-white font-semibold shadow" : "text-gray-600",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {tab === "create" ? (
          <div className="grid gap-4 md:grid-cols-[1fr_280px]">
            <div className="rounded-lg border border-gray-200">
              {!cart?.lines.length ? (
                <p className="p-6 text-center text-gray-400">
                  Giỏ hàng trống — thêm sản phẩm khách đặt vào giỏ rồi mở lại
                </p>
              ) : (
                cart.lines.map((l) => (
                  <div
                    key={l.id}
                    className="flex justify-between border-b border-gray-100 px-3 py-2 text-sm last:border-0"
                  >
                    <span>
                      {l.isGift && "🎁 "}
                      {l.name} × {l.quantity}
                    </span>
                    <span className="font-medium">{fmtMoney(l.totalAmount)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Khách:{" "}
                {cart?.customer ? (
                  <strong>
                    {cart.customer.name} · {cart.customer.phone}
                  </strong>
                ) : (
                  <span className="text-amber-700">chưa chọn (F3)</span>
                )}
              </p>
              <p className="flex justify-between">
                <span className="text-gray-600">Giá trị đơn (tạm tính)</span>
                <strong>{fmtMoney(total)}</strong>
              </p>
              <label className="text-sm text-gray-700">
                Ngày hẹn giao
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-gray-300 px-2"
                />
              </label>
              <label className="text-sm text-gray-700">
                Tiền cọc
                <input
                  value={deposit ? Number(deposit).toLocaleString("vi-VN") : ""}
                  onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  aria-label="Tiền cọc"
                  className="mt-1 h-12 w-full rounded-lg border border-gray-300 px-3 text-right text-xl font-bold"
                />
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú (size, màu, giao tận nơi…)"
                aria-label="Ghi chú đơn đặt"
                className="min-h-16 rounded-lg border border-gray-300 p-2 text-sm"
              />
              <button
                onClick={startDeposit}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 font-semibold text-white"
              >
                <CalendarClock className="h-5 w-5" /> Thu cọc & tạo đơn
              </button>
              <p className="text-xs text-gray-500">
                Giá được tính lại lúc giao; tồn kho trừ khi giao hàng.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Mã đơn / SĐT / tên khách"
                aria-label="Tìm đơn đặt"
                className="h-11 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Preorder["status"] | "")}
                aria-label="Trạng thái"
                className="h-11 rounded-lg border border-gray-300 bg-white px-2 text-sm"
              >
                <option value="pending">Chờ giao</option>
                <option value="completed">Đã giao</option>
                <option value="cancelled">Đã huỷ</option>
                <option value="">Tất cả</option>
              </select>
            </div>
            <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-gray-200">
              {list.length === 0 ? (
                <p className="p-6 text-center text-gray-400">Không có đơn đặt trước</p>
              ) : (
                list.map((p) => (
                  <div key={p.id} className="border-b border-gray-100 px-3 py-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">{p.preorderCode}</span>
                      <span className={cn("rounded px-2 py-0.5 text-xs", STATUS[p.status][1])}>
                        {STATUS[p.status][0]}
                      </span>
                      <span className="text-sm">
                        {p.customer.fullName} · {p.customer.phone}
                      </span>
                      <span className="ml-auto text-sm text-gray-500">
                        Hẹn {p.dueDate ? fmtDate(p.dueDate) : "—"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {p.items.map((i) => `${i.product.name} × ${Number(i.quantity)}`).join(", ")}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <span>Tạm tính {fmtMoney(p.estimatedTotal)}</span>
                      <span>
                        Cọc <strong>{fmtMoney(p.depositAmount)}</strong> (
                        {METHOD_LABEL[p.depositMethod as PaymentMethod] ?? p.depositMethod})
                      </span>
                      {p.status === "pending" && (
                        <span className="ml-auto flex gap-2">
                          <button
                            onClick={() => {
                              setCancelFor(p);
                              setCancelAmount(String(Number(p.depositAmount)));
                              setCancelReason("");
                            }}
                            className="flex h-11 items-center gap-1 rounded-lg border border-gray-300 px-3"
                          >
                            <XCircle className="h-4 w-4" /> Huỷ
                          </button>
                          <button
                            onClick={() => void startComplete(p)}
                            className="flex h-11 items-center gap-1 rounded-lg bg-emerald-600 px-3 font-semibold text-white"
                          >
                            <PackageCheck className="h-4 w-4" /> Giao hàng
                          </button>
                        </span>
                      )}
                    </div>
                    {cancelFor?.id === p.id && (
                      <div className="mt-3 grid gap-2 rounded-lg bg-red-50 p-3 sm:grid-cols-4">
                        <label className="text-xs text-gray-700">
                          Hoàn cọc
                          <input
                            value={cancelAmount}
                            onChange={(e) => setCancelAmount(e.target.value.replace(/\D/g, ""))}
                            inputMode="numeric"
                            aria-label="Tiền hoàn cọc"
                            className="mt-1 h-10 w-full rounded border border-gray-300 px-2 text-right"
                          />
                        </label>
                        <label className="text-xs text-gray-700">
                          Hình thức
                          <select
                            value={cancelMethod}
                            onChange={(e) => setCancelMethod(e.target.value as PaymentMethod)}
                            className="mt-1 h-10 w-full rounded border border-gray-300 bg-white"
                          >
                            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                              <option key={m} value={m}>
                                {METHOD_LABEL[m]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <input
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Lý do"
                          aria-label="Lý do huỷ"
                          className="h-10 self-end rounded border border-gray-300 px-2 text-sm"
                        />
                        <div className="flex gap-2 self-end">
                          <button
                            onClick={() => setCancelFor(null)}
                            className="h-10 flex-1 rounded border border-gray-300 bg-white text-sm"
                          >
                            Thôi
                          </button>
                          <button
                            onClick={() => void confirmCancel()}
                            className="h-10 flex-1 rounded bg-red-600 text-sm font-semibold text-white"
                          >
                            Huỷ đơn
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>

      <PaymentModal
        open={!!paying}
        title={
          paying?.kind === "deposit"
            ? "Thu tiền cọc"
            : `Giao ${paying?.quote.preorder.preorderCode ?? ""} — thu phần còn lại`
        }
        initialMethod="cash"
        total={payTotal}
        allowChange={paying?.kind !== "deposit"}
        reference={`BizOne coc ca ${sessionId}`}
        store={store}
        sessionId={sessionId}
        auth={auth}
        payhubEvent={payhubEvent}
        onShowQr={onShowQr}
        onClose={() => {
          setPaying(null);
          void onShowQr(null);
          if (finished.current) onClose();
        }}
        onConfirm={confirmPayment}
        onPrint={onPrint}
      />
    </>
  );
}
