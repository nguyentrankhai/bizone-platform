"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { usePosWebSocket } from "@/hooks/usePosWebSocket";
import { apiContext, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { PaymentQr } from "./PaymentQr";

const THANKS_MS = 8_000;

/**
 * Màn hình khách hàng (presentation mode, mockup 02-pos §04): danh sách SP, tổng tiền
 * lớn, QR thanh toán khi thu ngân chọn chuyển khoản/QR, lời cảm ơn sau khi thanh toán.
 * Chỉ nhận dữ liệu — đồng bộ qua WebSocket (hoặc BroadcastChannel khi mất kết nối).
 */
export function CustomerDisplay({ auth, sessionId }: { auth: ApiAuth; sessionId: number }) {
  const { cart, qr, completed, mode, sessionClosed, dismissCompleted } = usePosWebSocket({
    sessionId,
    auth,
    role: "display",
  });
  const [storeName, setStoreName] = useState("BizOne");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    trpc.pos.storeInfo
      .query(undefined, apiContext(auth))
      .then((s) => setStoreName(s.name))
      .catch(() => {});
  }, [auth]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!completed) return;
    const t = setTimeout(dismissCompleted, THANKS_MS);
    return () => clearTimeout(t);
  }, [completed, dismissCompleted]);

  const lines = cart?.lines ?? [];
  const showThanks = completed && lines.length === 0;

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      <header className="flex items-center justify-between px-10 py-6">
        <p className="text-3xl font-black tracking-tight">{storeName}</p>
        <p className="text-lg text-slate-300">
          {now?.toLocaleDateString("vi-VN", {
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
          {" · "}
          {now?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
          {mode !== "ws" && (
            <span className="ml-3 rounded bg-amber-500/20 px-2 py-0.5 text-sm text-amber-300">
              Cục bộ
            </span>
          )}
        </p>
      </header>

      {sessionClosed ? (
        <div className="flex flex-1 items-center justify-center text-3xl text-slate-300">
          Quầy đã đóng ca
        </div>
      ) : showThanks ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4"
          data-testid="display-thanks"
        >
          <CheckCircle2 className="h-24 w-24 text-emerald-400" />
          <p className="text-5xl font-bold">Cảm ơn quý khách!</p>
          <p className="text-2xl text-slate-300">Đã thanh toán {fmtMoney(completed.amount)}</p>
          {completed.change > 0 && (
            <p className="text-3xl">Tiền thừa: {fmtMoney(completed.change)}</p>
          )}
          {completed.pointsEarned > 0 && (
            <p className="text-xl text-emerald-300">+{completed.pointsEarned} điểm tích lũy</p>
          )}
        </div>
      ) : (
        <main className="grid min-h-0 flex-1 gap-8 px-10 pb-10 lg:grid-cols-[1fr_420px]">
          <section className="flex min-h-0 flex-col rounded-3xl bg-slate-800 p-6">
            <p className="mb-4 text-lg text-slate-400">Sản phẩm đã chọn</p>
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="display-lines">
              {lines.length === 0 ? (
                <p className="py-20 text-center text-3xl text-slate-500">Xin chào quý khách!</p>
              ) : (
                lines.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-4 border-b border-slate-700 py-4 text-2xl"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{l.name}</p>
                      <p className="text-base text-slate-400">SKU: {l.sku}</p>
                    </div>
                    <span className="text-slate-300">x{l.quantity}</span>
                    <span className="w-48 text-right font-bold">{fmtMoney(l.totalAmount)}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <aside className="flex flex-col gap-6">
            <div className="rounded-3xl bg-slate-800 p-6 text-xl">
              <div className="flex justify-between text-slate-300">
                <span>Tạm tính</span>
                <span>{fmtMoney(cart?.subtotal)}</span>
              </div>
              {!!cart?.discountAmount && (
                <div className="mt-2 flex justify-between text-emerald-300">
                  <span>Giảm giá</span>
                  <span>−{fmtMoney(cart.discountAmount)}</span>
                </div>
              )}
              <div className="mt-4 border-t border-slate-700 pt-4">
                <p className="text-lg text-slate-400">THÀNH TIỀN</p>
                <p className="text-6xl font-black text-amber-300" data-testid="display-total">
                  {fmtMoney(cart?.total)}
                </p>
              </div>
            </div>
            {qr && (
              <div
                className="flex flex-col items-center gap-3 rounded-3xl bg-white p-6 text-slate-900"
                data-testid="display-qr"
              >
                <p className="text-xl font-bold">Quét QR để thanh toán</p>
                <PaymentQr payload={qr.payload} size={260} />
                <p className="text-center text-base">
                  {qr.bankName} · {qr.accountNo}
                  <br />
                  {qr.accountName}
                </p>
                <p className="text-3xl font-black">{fmtMoney(qr.amount)}</p>
              </div>
            )}
          </aside>
        </main>
      )}
    </div>
  );
}
