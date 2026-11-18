"use client";

import { useActionState } from "react";
import { placeOrderAction, type FormState } from "@/app/actions";
import { Alert, btn, input } from "./ui";

interface Props {
  idempotencyKey: string;
  couponCode: string;
  paymentMethods: { code: "cod" | "payhub"; label: string }[];
  paymentMinutes: number;
  profile: { name: string; phone: string; email: string; address: string } | null;
  disabled: boolean;
}

export function CheckoutForm({
  idempotencyKey,
  couponCode,
  paymentMethods,
  paymentMinutes,
  profile,
  disabled,
}: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(placeOrderAction, {});
  const v = state.values;
  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="couponCode" value={couponCode} />
      <h2 className="font-semibold">Thông tin nhận hàng</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Họ tên người nhận</span>
          <input
            name="name"
            required
            minLength={2}
            defaultValue={v?.name ?? profile?.name}
            className={input}
            autoComplete="name"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Số điện thoại</span>
          <input
            name="phone"
            required
            inputMode="tel"
            defaultValue={v?.phone ?? profile?.phone}
            className={input}
            autoComplete="tel"
          />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="font-medium">Địa chỉ giao hàng</span>
          <input
            name="address"
            required
            minLength={10}
            defaultValue={v?.address ?? profile?.address}
            className={input}
            autoComplete="street-address"
            placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Email (không bắt buộc)</span>
          <input
            name="email"
            type="email"
            defaultValue={v?.email ?? profile?.email}
            className={input}
            autoComplete="email"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Ghi chú</span>
          <input
            name="note"
            defaultValue={v?.note}
            maxLength={1000}
            className={input}
            placeholder="Giờ nhận hàng, chỉ dẫn…"
          />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">Thanh toán</legend>
        {paymentMethods.map((m, i) => (
          <label
            key={m.code}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              name="paymentMethod"
              value={m.code}
              defaultChecked={v?.paymentMethod ? v.paymentMethod === m.code : i === 0}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{m.label}</span>
              {m.code === "payhub" && (
                <span className="block text-xs text-slate-500">
                  Chuyển sang cổng thanh toán; đơn tự huỷ nếu chưa thanh toán sau {paymentMinutes}{" "}
                  phút
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      {state.error && <Alert>{state.error}</Alert>}
      <button className={`${btn} w-full`} disabled={pending || disabled}>
        {pending ? "Đang đặt hàng…" : "Đặt hàng"}
      </button>
    </form>
  );
}
