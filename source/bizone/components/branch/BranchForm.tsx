"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/Modal";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, inputCls } from "@/components/staff/shared";
import type { BranchConfigKey } from "@/lib/validators/branch";

type Branch = RouterOutputs["branch"]["get"];

const CONFIG_FIELDS: { key: BranchConfigKey; label: string; hint?: string }[] = [
  { key: "store_name", label: "Tên in trên hoá đơn / màn hình khách" },
  { key: "invoice_prefix", label: "Tiền tố mã hoá đơn", hint: "VD: HN → HN2611100001" },
  { key: "bank_bin", label: "BIN ngân hàng (VietQR)", hint: "VD: 970436 (Vietcombank)" },
  { key: "bank_name", label: "Tên ngân hàng" },
  { key: "bank_account_no", label: "Số tài khoản nhận tiền" },
  { key: "bank_account_name", label: "Tên chủ tài khoản" },
  { key: "receipt_footer", label: "Lời chào cuối hoá đơn" },
];

interface FormState {
  code: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  taxCode: string;
  isDefault: boolean;
  createWarehouse: boolean;
}

const EMPTY: FormState = {
  code: "",
  name: "",
  address: "",
  phone: "",
  email: "",
  taxCode: "",
  isDefault: false,
  createWarehouse: true,
};

/**
 * Thêm / sửa chi nhánh (P4.6). Sửa có thêm tab "Cấu hình riêng" — giá trị để trống dùng cấu hình
 * chung của cửa hàng (hiện dạng gợi ý).
 */
export function BranchForm({
  open,
  auth,
  branchId,
  onClose,
  onSaved,
}: {
  open: boolean;
  auth: ApiAuth;
  /** null = new branch */
  branchId: number | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [tab, setTab] = useState<"info" | "config">("info");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setTab("info");
    setError("");
    setBranch(null);
    setConfig({});
    if (branchId === null) setForm(EMPTY);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (branchId === null) return;
    trpc.branch.get
      .query({ id: branchId }, apiContext(auth))
      .then((b) => {
        setBranch(b);
        setForm({
          code: b.code,
          name: b.name,
          address: b.address ?? "",
          phone: b.phone ?? "",
          email: b.email ?? "",
          taxCode: b.taxCode ?? "",
          isDefault: b.isDefault,
          createWarehouse: false,
        });
        setConfig(Object.fromEntries(Object.entries(b.config).map(([k, v]) => [k, v.value ?? ""])));
      })
      .catch((e) => setError(errorMessage(e)));
  }, [open, branchId, auth]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({
      ...f,
      [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const fields = {
        code: form.code,
        name: form.name,
        address: form.address,
        phone: form.phone,
        email: form.email,
        taxCode: form.taxCode,
      };
      if (branchId === null) {
        const b = await trpc.branch.create.mutate(
          { ...fields, isDefault: form.isDefault, createWarehouse: form.createWarehouse },
          apiContext(auth),
        );
        onSaved(`Đã thêm chi nhánh ${b.name}`);
      } else if (tab === "info") {
        await trpc.branch.update.mutate({ id: branchId, data: fields }, apiContext(auth));
        onSaved("Đã lưu thông tin chi nhánh");
      } else {
        await trpc.branch.setConfig.mutate(
          {
            branchId,
            values: Object.fromEntries(Object.entries(config).map(([k, v]) => [k, v || null])),
          },
          apiContext(auth),
        );
        onSaved("Đã lưu cấu hình riêng của chi nhánh");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={branchId === null ? "Thêm chi nhánh" : `Chi nhánh ${branch?.name ?? ""}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={btnSecondary}>
            Đóng
          </button>
          <button onClick={() => void save()} disabled={busy} className={btnPrimary}>
            {busy ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      }
    >
      {branchId !== null && (
        <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm" role="tablist">
          {(
            [
              ["info", "Thông tin"],
              ["config", "Cấu hình riêng"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={
                "h-9 flex-1 rounded-md " +
                (tab === k ? "bg-white font-semibold shadow" : "text-slate-600")
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-4">
        <ErrorBox message={error} />
        {tab === "info" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mã chi nhánh *" htmlFor="br-code">
              <input id="br-code" value={form.code} onChange={set("code")} className={inputCls} />
            </Field>
            <Field label="Tên chi nhánh *" htmlFor="br-name">
              <input id="br-name" value={form.name} onChange={set("name")} className={inputCls} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Địa chỉ" htmlFor="br-address">
                <input
                  id="br-address"
                  value={form.address}
                  onChange={set("address")}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Điện thoại" htmlFor="br-phone">
              <input
                id="br-phone"
                value={form.phone}
                onChange={set("phone")}
                className={inputCls}
              />
            </Field>
            <Field label="Email" htmlFor="br-email">
              <input
                id="br-email"
                value={form.email}
                onChange={set("email")}
                className={inputCls}
              />
            </Field>
            <Field label="Mã số thuế" htmlFor="br-tax">
              <input
                id="br-tax"
                value={form.taxCode}
                onChange={set("taxCode")}
                className={inputCls}
              />
            </Field>
            {branchId === null && (
              <div className="space-y-2 self-end text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.createWarehouse}
                    onChange={set("createWarehouse")}
                    className="h-4 w-4"
                  />
                  Tạo kho bán hàng cho chi nhánh
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={set("isDefault")}
                    className="h-4 w-4"
                  />
                  Đặt làm chi nhánh mặc định
                </label>
              </div>
            )}
            {branch && (
              <div className="text-sm text-slate-600 sm:col-span-2">
                Kho: {branch.warehouses.map((w) => `${w.name} (${w.code})`).join(", ") || "chưa có"}{" "}
                · Nhân viên: {branch.userBranches.length}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {CONFIG_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                htmlFor={`cfg-${f.key}`}
                hint={
                  branch?.config[f.key]?.inherited
                    ? `Trống = dùng chung: ${branch.config[f.key].inherited}`
                    : f.hint
                }
              >
                <input
                  id={`cfg-${f.key}`}
                  value={config[f.key] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                  placeholder={branch?.config[f.key]?.inherited ?? ""}
                  className={inputCls}
                />
              </Field>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
