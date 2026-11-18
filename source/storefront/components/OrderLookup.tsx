"use client";

import { useActionState } from "react";
import { lookupOrderAction, type FormState } from "@/app/actions";
import { Alert, btn, input } from "./ui";

export function OrderLookup() {
  const [state, action, pending] = useActionState<FormState, FormData>(lookupOrderAction, {});
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <input
        name="code"
        defaultValue={state.values?.code}
        required
        placeholder="Mã đơn (VD: WEB-20261118-123456)"
        aria-label="Mã đơn hàng"
        className={input}
      />
      <input
        name="phone"
        defaultValue={state.values?.phone}
        required
        inputMode="tel"
        placeholder="Số điện thoại đặt hàng"
        aria-label="Số điện thoại"
        className={input}
      />
      {state.error && <Alert>{state.error}</Alert>}
      <button className={btn} disabled={pending}>
        Tra cứu
      </button>
    </form>
  );
}
