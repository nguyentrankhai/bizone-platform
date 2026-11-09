"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, inputCls } from "@/components/staff/shared";

export interface SupplierFormValue {
  id?: number;
  code: string;
  name: string;
  taxCode: string;
  phone: string;
  email: string;
  contactPerson: string;
  address: string;
  paymentTerms: string;
  notes: string;
  isActive: boolean;
}

export const EMPTY_SUPPLIER: SupplierFormValue = {
  code: "",
  name: "",
  taxCode: "",
  phone: "",
  email: "",
  contactPerson: "",
  address: "",
  paymentTerms: "",
  notes: "",
  isActive: true,
};

/** Build form state from an API row (nulls → "") */
export function toFormValue(s: {
  id: number;
  code: string;
  name: string;
  taxCode: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  address: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
}): SupplierFormValue {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    taxCode: s.taxCode ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    contactPerson: s.contactPerson ?? "",
    address: s.address ?? "",
    paymentTerms: s.paymentTerms ?? "",
    notes: s.notes ?? "",
    isActive: s.isActive,
  };
}

export function SupplierForm({
  auth,
  initial,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  initial: SupplierFormValue;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = !!initial.id;
  const set =
    (k: keyof SupplierFormValue) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) {
      setError("Vui lòng nhập tên nhà cung cấp");
      return;
    }
    setSaving(true);
    setError("");
    const data = {
      code: v.code.trim() || undefined,
      name: v.name,
      taxCode: v.taxCode.trim(),
      phone: v.phone.trim(),
      email: v.email.trim(),
      contactPerson: v.contactPerson,
      address: v.address,
      paymentTerms: v.paymentTerms,
      notes: v.notes,
    };
    try {
      const saved = editing
        ? await trpc.supplier.update.mutate(
            { id: initial.id!, data: { ...data, isActive: v.isActive } },
            apiContext(auth),
          )
        : await trpc.supplier.create.mutate(data, apiContext(auth));
      toast.success(editing ? "Đã cập nhật nhà cung cấp" : `Đã thêm nhà cung cấp ${saved.code}`);
      onSaved(saved.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? `Sửa nhà cung cấp ${initial.code}` : "Thêm nhà cung cấp"}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <ErrorBox message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên nhà cung cấp *" htmlFor="sup-name">
            <input
              id="sup-name"
              className={inputCls}
              value={v.name}
              onChange={set("name")}
              required
            />
          </Field>
          <Field
            label="Mã NCC"
            htmlFor="sup-code"
            hint={editing ? undefined : "Để trống để tự sinh (NCC0001…)"}
          >
            <input id="sup-code" className={inputCls} value={v.code} onChange={set("code")} />
          </Field>
          <Field label="Mã số thuế" htmlFor="sup-tax">
            <input
              id="sup-tax"
              className={inputCls}
              value={v.taxCode}
              onChange={set("taxCode")}
              inputMode="numeric"
              placeholder="0312345678"
            />
          </Field>
          <Field label="Người liên hệ" htmlFor="sup-contact">
            <input
              id="sup-contact"
              className={inputCls}
              value={v.contactPerson}
              onChange={set("contactPerson")}
            />
          </Field>
          <Field label="Số điện thoại" htmlFor="sup-phone">
            <input
              id="sup-phone"
              className={inputCls}
              value={v.phone}
              onChange={set("phone")}
              inputMode="tel"
            />
          </Field>
          <Field label="Email" htmlFor="sup-email">
            <input
              id="sup-email"
              type="email"
              className={inputCls}
              value={v.email}
              onChange={set("email")}
            />
          </Field>
          <Field
            label="Điều khoản thanh toán"
            htmlFor="sup-terms"
            hint='Số ngày trong điều khoản (vd. "30 ngày") dùng để tính hạn công nợ'
          >
            <input
              id="sup-terms"
              className={inputCls}
              value={v.paymentTerms}
              onChange={set("paymentTerms")}
              placeholder="Thanh toán trong 30 ngày"
            />
          </Field>
          <Field label="Địa chỉ" htmlFor="sup-address">
            <input
              id="sup-address"
              className={inputCls}
              value={v.address}
              onChange={set("address")}
            />
          </Field>
        </div>
        <Field label="Ghi chú (nhóm hàng cung cấp…)" htmlFor="sup-notes">
          <textarea
            id="sup-notes"
            rows={2}
            className={inputCls.replace("h-10", "min-h-16 py-2")}
            value={v.notes}
            onChange={set("notes")}
          />
        </Field>
        {editing && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={v.isActive}
              onChange={(e) => setV((s) => ({ ...s, isActive: e.target.checked }))}
            />
            Đang hợp tác (bỏ chọn để ngừng — không tạo được đơn nhập mới)
          </label>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Thêm nhà cung cấp"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
