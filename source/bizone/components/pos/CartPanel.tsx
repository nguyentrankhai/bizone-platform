"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Minus, Plus, ShoppingCart, Tag, User, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { CartSnapshot } from "@/lib/pos/protocol";
import type { PaymentMethod } from "@/lib/validators/pos";
import {
  apiContext,
  errorMessage,
  fmtMoney,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";

type CustomerHit = RouterOutputs["pos"]["customers"][number];

export interface CartPanelHandle {
  focusCustomer: () => void;
  focusCoupon: () => void;
}

interface CartPanelProps {
  auth: ApiAuth;
  cart: CartSnapshot | null;
  busy?: boolean;
  onQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onCustomer: (customerId: number | null) => Promise<void>;
  onCoupon: (code: string | null) => Promise<void>;
  onPay: (method: PaymentMethod) => void;
}

const RANKING: Record<string, string> = {
  silver: "Silver",
  gold: "Gold",
  vip: "VIP",
  diamond: "Diamond",
};

const QUICK_METHODS: { method: PaymentMethod; label: string }[] = [
  { method: "transfer", label: "CK" },
  { method: "card", label: "Thẻ" },
  { method: "wallet", label: "Ví ĐT" },
  { method: "qr", label: "QR" },
];

/** Giỏ hàng (mockup 02-pos §03, phải) */
export const CartPanel = forwardRef<CartPanelHandle, CartPanelProps>(function CartPanel(
  { auth, cart, busy, onQuantity, onRemove, onCustomer, onCoupon, onPay },
  ref,
) {
  const customerRef = useRef<HTMLInputElement>(null);
  const couponRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<"customer" | "coupon" | null>(null);
  const [customerQ, setCustomerQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [coupon, setCoupon] = useState("");
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    focusCustomer: () => {
      setPanel("customer");
      setTimeout(() => customerRef.current?.focus(), 0);
    },
    focusCoupon: () => {
      setPanel("coupon");
      setTimeout(() => couponRef.current?.focus(), 0);
    },
  }));

  async function searchCustomers(v: string) {
    setCustomerQ(v);
    if (v.trim().length < 2) return setHits([]);
    try {
      setHits(await trpc.pos.customers.query({ q: v }, apiContext(auth)));
    } catch {
      setHits([]);
    }
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      setPanel(null);
      setCustomerQ("");
      setHits([]);
      setCoupon("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const lines = cart?.lines ?? [];
  const total = cart?.total ?? 0;
  const empty = lines.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold text-gray-900">
          <ShoppingCart className="h-5 w-5 text-blue-600" /> Giỏ hàng
        </h2>
        <span className="text-sm text-gray-500" data-testid="cart-count">
          {cart?.itemCount ?? 0} sản phẩm
        </span>
      </div>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {empty ? (
          <p className="py-12 text-center text-sm text-gray-400">
            Quét mã vạch hoặc chọn sản phẩm để bắt đầu
          </p>
        ) : (
          lines.map((l) => (
            <div key={l.id} className="border-b border-gray-50 px-2 py-2.5" data-testid="cart-line">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-[15px] font-medium text-gray-900">{l.name}</p>
                <button
                  aria-label={`Xóa ${l.name}`}
                  onClick={() => onRemove(l.id)}
                  className="-mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <button
                    aria-label={`Giảm ${l.name}`}
                    onClick={() => onQuantity(l.id, l.quantity - 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-base font-semibold">{l.quantity}</span>
                  <button
                    aria-label={`Tăng ${l.name}`}
                    onClick={() => onQuantity(l.id, l.quantity + 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-xs text-gray-500">
                  × {fmtMoney(l.unitPrice)}
                  {l.discountPercent ? ` −${l.discountPercent}%` : ""}
                </span>
                <span className="ml-auto text-[15px] font-semibold">{fmtMoney(l.totalAmount)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Customer / coupon */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {cart?.customer ? (
            <span className="flex h-11 items-center gap-2 rounded-lg bg-blue-50 px-3 text-sm text-blue-800">
              <User className="h-4 w-4" />
              {cart.customer.name} · {RANKING[cart.customer.ranking] ?? cart.customer.ranking} ·{" "}
              {cart.customer.points} điểm
              <button aria-label="Bỏ khách hàng" onClick={() => run(() => onCustomer(null))}>
                <X className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <button
              onClick={() => setPanel(panel === "customer" ? null : "customer")}
              className="flex h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm hover:bg-gray-50"
            >
              <User className="h-4 w-4" /> Chọn KH <kbd className="text-xs text-gray-400">F3</kbd>
            </button>
          )}
          {cart?.couponCode ? (
            <span className="flex h-11 items-center gap-2 rounded-lg bg-emerald-50 px-3 text-sm text-emerald-800">
              <Tag className="h-4 w-4" /> {cart.couponCode}
              <button aria-label="Bỏ mã giảm giá" onClick={() => run(() => onCoupon(null))}>
                <X className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <button
              onClick={() => setPanel(panel === "coupon" ? null : "coupon")}
              className="flex h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm hover:bg-gray-50"
            >
              <Tag className="h-4 w-4" /> Mã giảm giá{" "}
              <kbd className="text-xs text-gray-400">F4</kbd>
            </button>
          )}
        </div>

        {panel === "customer" && (
          <div className="mt-2">
            <input
              ref={customerRef}
              value={customerQ}
              onChange={(e) => searchCustomers(e.target.value)}
              placeholder="SĐT hoặc tên khách hàng..."
              aria-label="Tìm khách hàng"
              className="h-11 w-full rounded-lg border border-gray-300 px-3 text-base outline-none focus:border-blue-500"
            />
            {hits.length > 0 && (
              <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => run(() => onCustomer(h.id))}
                      className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                    >
                      <span className="font-medium">{h.fullName}</span>
                      <span className="text-gray-500">
                        {h.phone} · {RANKING[h.ranking] ?? h.ranking}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {panel === "coupon" && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (coupon.trim()) void run(() => onCoupon(coupon.trim()));
            }}
          >
            <input
              ref={couponRef}
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Nhập mã giảm giá"
              aria-label="Mã giảm giá"
              className="h-11 flex-1 rounded-lg border border-gray-300 px-3 text-base uppercase outline-none focus:border-blue-500"
            />
            <button className="h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">
              Áp dụng
            </button>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Totals */}
      <div className="space-y-1 border-t border-gray-100 px-4 py-3 text-[15px]">
        <Row label="Tạm tính" value={fmtMoney(cart?.subtotal)} />
        {!!cart?.lineDiscount && (
          <Row label="Giảm giá sản phẩm" value={`−${fmtMoney(cart.lineDiscount)}`} />
        )}
        {!!cart?.memberDiscount && (
          <Row
            label={`Ưu đãi hạng (${cart.memberDiscountPercent}%)`}
            value={`−${fmtMoney(cart.memberDiscount)}`}
          />
        )}
        {cart?.coupon && (
          <Row label={`Mã ${cart.coupon.code}`} value={`−${fmtMoney(cart.coupon.discount)}`} />
        )}
        {cart?.couponError && <p className="text-xs text-amber-700">{cart.couponError}</p>}
        <Row label="Đã gồm VAT" value={fmtMoney(cart?.taxAmount)} muted />
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-base font-semibold">Thành tiền</span>
          <span className="text-2xl font-bold text-blue-600" data-testid="cart-total">
            {fmtMoney(total)}
          </span>
        </div>
      </div>

      {/* Pay */}
      <div className="grid grid-cols-4 gap-2 border-t border-gray-100 p-3">
        <button
          disabled={empty || busy}
          onClick={() => onPay("cash")}
          className="col-span-4 h-14 rounded-xl bg-blue-600 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Thanh toán {fmtMoney(total)} <kbd className="ml-1 text-xs font-normal opacity-70">F9</kbd>
        </button>
        {QUICK_METHODS.map((m) => (
          <button
            key={m.method}
            disabled={empty || busy}
            onClick={() => onPay(m.method)}
            className={cn(
              "h-11 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 disabled:opacity-40",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
});

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted ? "text-xs text-gray-400" : "text-gray-600")}>
      <span>{label}</span>
      <span className={muted ? "" : "font-medium text-gray-900"}>{value}</span>
    </div>
  );
}
