"use client";

import { useActionState } from "react";
import { loginAction, registerAction, type FormState } from "@/app/actions";
import { Alert, btn, input } from "./ui";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Số điện thoại</span>
        <input
          name="phone"
          required
          inputMode="tel"
          defaultValue={state.phone}
          className={input}
          autoComplete="tel"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Mật khẩu</span>
        <input
          name="password"
          type="password"
          required
          className={input}
          autoComplete="current-password"
        />
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <button className={`${btn} w-full`} disabled={pending}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, {});
  const codeStep = state.step === "code";
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Số điện thoại</span>
        <input
          name="phone"
          required
          inputMode="tel"
          defaultValue={state.phone}
          readOnly={codeStep}
          className={`${input} ${codeStep ? "bg-slate-100" : ""}`}
          autoComplete="tel"
        />
      </label>
      {codeStep && (
        <>
          <input type="hidden" name="step" value="code" />
          {state.ok && <Alert kind="ok">{state.ok}</Alert>}
          {state.devCode && (
            <Alert kind="info">Môi trường thử nghiệm (chưa có SMS) — mã: {state.devCode}</Alert>
          )}
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Mã xác nhận (6 số)</span>
            <input
              name="code"
              defaultValue={state.values?.code}
              required
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              className={input}
              autoComplete="one-time-code"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Họ tên</span>
            <input
              name="fullName"
              defaultValue={state.values?.fullName}
              required
              minLength={2}
              className={input}
              autoComplete="name"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Email (không bắt buộc)</span>
            <input
              name="email"
              type="email"
              defaultValue={state.values?.email}
              className={input}
              autoComplete="email"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Mật khẩu (tối thiểu 8 ký tự)</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className={input}
              autoComplete="new-password"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Nhập lại mật khẩu</span>
            <input
              name="password2"
              type="password"
              required
              minLength={8}
              className={input}
              autoComplete="new-password"
            />
          </label>
        </>
      )}
      {state.error && <Alert>{state.error}</Alert>}
      <button className={`${btn} w-full`} disabled={pending}>
        {pending ? "Đang xử lý…" : codeStep ? "Hoàn tất đăng ký" : "Gửi mã xác nhận"}
      </button>
    </form>
  );
}
