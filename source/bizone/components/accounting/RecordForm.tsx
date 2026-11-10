"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  btnPrimary,
  btnSecondary,
  inputCls,
  vnToday,
} from "@/components/staff/shared";
import { cn } from "@/lib/utils";
import {
  FundSelect,
  MoneyInput,
  flattenCategories,
  type CategoryNode,
  type FundOption,
  type Outputs,
} from "./shared";

export type RecordRow = Outputs["accounting"]["records"]["items"][number];

/**
 * Lập / sửa phiếu thu chi. Phiếu thu → quỹ tăng, phiếu chi → quỹ giảm (khi chọn quỹ).
 * Sửa số tiền / quỹ: máy chủ đảo biến động cũ và ghi biến động mới.
 */
export function RecordForm({
  auth,
  open,
  onClose,
  onSaved,
  initialType,
  editing,
  funds,
  categories,
}: {
  auth: ApiAuth;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialType: "revenue" | "expense";
  editing: RecordRow | null;
  funds: FundOption[];
  categories: CategoryNode[];
}) {
  const toast = useToast();
  const [type, setType] = useState<"revenue" | "expense">(editing?.type ?? initialType);
  const [categoryId, setCategoryId] = useState<number | null>(editing?.category.id ?? null);
  const [amount, setAmount] = useState<number | null>(editing?.amount ?? null);
  const [date, setDate] = useState(editing?.date ?? vnToday());
  const [fundId, setFundId] = useState<number | null>(
    editing ? (editing.fund?.id ?? null) : (funds.find((f) => f.type === "cash")?.id ?? null),
  );
  const [partnerName, setPartnerName] = useState(editing?.partnerName ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const options = flattenCategories(categories).filter(
    (c) => (c.isActive || c.id === categoryId) && (c.type === "both" || c.type === type),
  );
  const fund = funds.find((f) => f.id === fundId);
  const short = type === "expense" && fund && amount !== null && amount > fund.balance;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!categoryId) return setError("Chọn danh mục");
    if (!amount) return setError("Nhập số tiền");
    setBusy(true);
    try {
      const ctx = apiContext(auth);
      if (editing) {
        await trpc.accounting.updateRecord.mutate(
          { id: editing.id, categoryId, amount, date, fundId, partnerName, description },
          ctx,
        );
        toast.success(`Đã cập nhật phiếu ${editing.code}`);
      } else {
        const rec = await trpc.accounting.createRecord.mutate(
          { type, categoryId, amount, date, fundId, partnerName, description },
          ctx,
        );
        toast.success(`Đã lập ${type === "revenue" ? "phiếu thu" : "phiếu chi"} ${rec.code}`);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = editing
    ? `Sửa ${editing.type === "revenue" ? "phiếu thu" : "phiếu chi"} ${editing.code}`
    : type === "revenue"
      ? "Lập phiếu thu"
      : "Lập phiếu chi";

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <form className="space-y-4" onSubmit={submit}>
        {!editing && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Loại phiếu">
            {(["revenue", "expense"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => {
                  setType(t);
                  setCategoryId(null);
                }}
                className={cn(
                  "h-11 rounded-md border text-sm font-medium",
                  type === t
                    ? t === "revenue"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-red-400 bg-red-50 text-red-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50",
                )}
              >
                {t === "revenue" ? "Phiếu thu (tiền vào)" : "Phiếu chi (tiền ra)"}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Danh mục *" htmlFor="rec-cat">
            <select
              id="rec-cat"
              className={inputCls}
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Chọn danh mục —</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Số tiền *" htmlFor="rec-amount">
            <MoneyInput id="rec-amount" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Ngày chứng từ" htmlFor="rec-date">
            <input
              id="rec-date"
              type="date"
              className={inputCls}
              value={date}
              max={vnToday()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field
            label={type === "revenue" ? "Quỹ nhận tiền" : "Quỹ chi tiền"}
            htmlFor="rec-fund"
            hint={
              short
                ? `Quỹ chỉ còn ${fmtMoney(fund.balance)}`
                : fund
                  ? `Số dư sau: ${fmtMoney(
                      fund.balance +
                        (type === "revenue" ? 1 : -1) * (amount ?? 0) +
                        (editing && editing.fund?.id === fund.id
                          ? (editing.type === "revenue" ? -1 : 1) * editing.amount
                          : 0),
                    )}`
                  : undefined
            }
          >
            <FundSelect id="rec-fund" funds={funds} value={fundId} onChange={setFundId} />
          </Field>
        </div>
        <Field
          label={type === "revenue" ? "Người nộp tiền" : "Người nhận tiền"}
          htmlFor="rec-partner"
        >
          <input
            id="rec-partner"
            className={inputCls}
            value={partnerName}
            maxLength={255}
            onChange={(e) => setPartnerName(e.target.value)}
            placeholder={type === "revenue" ? "VD: Công ty ABC" : "VD: Điện lực Hà Nội"}
          />
        </Field>
        <Field label="Diễn giải" htmlFor="rec-desc">
          <textarea
            id="rec-desc"
            className={`${inputCls} h-20 py-2`}
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="VD: Tiền điện tháng 10"
          />
        </Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Lập phiếu"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
