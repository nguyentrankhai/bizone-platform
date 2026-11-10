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
  useLoad,
} from "@/components/staff/shared";
import { FundSelect, MoneyInput, type Fund, type FundOption } from "./shared";

/** Tạo / sửa quỹ (tiền mặt hoặc tài khoản ngân hàng) */
export function CashFundForm({
  auth,
  editing,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  editing: Fund | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const ctx = apiContext(auth);
  const branches = useLoad("branch-mine", () => trpc.branch.mine.query(undefined, ctx));
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState("");
  const [type, setType] = useState<"cash" | "bank">(editing?.type ?? "cash");
  const [accountNo, setAccountNo] = useState(editing?.accountNo ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [branchId, setBranchId] = useState<number | null>(editing ? editing.branchId : null);
  const [opening, setOpening] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const mine = branches.data;
  const branchList = mine?.branches ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (editing) {
        await trpc.accounting.updateFund.mutate(
          { id: editing.id, name, accountNo, description, branchId },
          ctx,
        );
        toast.success("Đã cập nhật quỹ");
      } else {
        const f = await trpc.accounting.createFund.mutate(
          {
            name,
            type,
            accountNo,
            description,
            branchId,
            openingBalance: opening ?? 0,
            ...(code.trim() ? { code: code.trim() } : {}),
          },
          ctx,
        );
        toast.success(`Đã tạo quỹ ${f.code}`);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Sửa quỹ ${editing.code}` : "Thêm quỹ"}
      size="md"
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên quỹ *" htmlFor="fund-name">
            <input
              id="fund-name"
              className={inputCls}
              value={name}
              required
              maxLength={255}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Két tiền mặt cửa hàng"
            />
          </Field>
          {!editing && (
            <Field label="Mã quỹ" htmlFor="fund-code" hint="Bỏ trống để tự sinh (QUY001…)">
              <input
                id="fund-code"
                className={inputCls}
                value={code}
                maxLength={50}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
          )}
          <Field label="Loại quỹ" htmlFor="fund-type">
            <select
              id="fund-type"
              className={inputCls}
              value={type}
              disabled={Boolean(editing)}
              onChange={(e) => setType(e.target.value as "cash" | "bank")}
            >
              <option value="cash">Tiền mặt</option>
              <option value="bank">Tài khoản ngân hàng</option>
            </select>
          </Field>
          {type === "bank" && (
            <Field label="Số tài khoản *" htmlFor="fund-acc">
              <input
                id="fund-acc"
                className={inputCls}
                value={accountNo}
                maxLength={50}
                onChange={(e) => setAccountNo(e.target.value)}
              />
            </Field>
          )}
          <Field label="Chi nhánh" htmlFor="fund-branch">
            <select
              id="fund-branch"
              className={inputCls}
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : null)}
            >
              {mine?.canAll && <option value="">Quỹ chung toàn cửa hàng</option>}
              {!mine?.canAll && branchId === null && <option value="">— Chọn chi nhánh —</option>}
              {branchList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          {!editing && (
            <Field label="Số dư đầu kỳ" htmlFor="fund-opening">
              <MoneyInput id="fund-opening" value={opening} onChange={setOpening} />
            </Field>
          )}
        </div>
        <Field label="Ghi chú" htmlFor="fund-desc">
          <textarea
            id="fund-desc"
            className={`${inputCls} h-16 py-2`}
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? "Đang lưu…" : editing ? "Lưu" : "Tạo quỹ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Chuyển tiền giữa hai quỹ */
export function TransferModal({
  auth,
  funds,
  fromId,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  funds: FundOption[];
  fromId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [from, setFrom] = useState<number | null>(fromId);
  const [to, setTo] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const src = funds.find((f) => f.id === from);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!from || !to) return setError("Chọn quỹ chuyển và quỹ nhận");
    if (!amount) return setError("Nhập số tiền");
    try {
      await trpc.accounting.transfer.mutate(
        { fromFundId: from, toFundId: to, amount, description },
        apiContext(auth),
      );
      toast.success("Đã chuyển quỹ");
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal open onClose={onClose} title="Chuyển tiền giữa các quỹ" size="md">
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Từ quỹ" htmlFor="tf-from">
          <FundSelect
            id="tf-from"
            funds={funds}
            value={from}
            onChange={setFrom}
            allowNone={false}
          />
        </Field>
        <Field label="Sang quỹ" htmlFor="tf-to">
          <FundSelect
            id="tf-to"
            funds={funds}
            value={to}
            onChange={setTo}
            allowNone={false}
            exclude={from ?? undefined}
          />
        </Field>
        <Field
          label="Số tiền"
          htmlFor="tf-amount"
          hint={src ? `Quỹ chuyển đang có ${fmtMoney(src.balance)}` : undefined}
        >
          <MoneyInput id="tf-amount" value={amount} onChange={setAmount} />
        </Field>
        <Field label="Diễn giải" htmlFor="tf-desc">
          <input
            id="tf-desc"
            className={inputCls}
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="VD: Nộp tiền mặt vào tài khoản"
          />
        </Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary}>
            Chuyển
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Kiểm quỹ: nhập số đếm thực tế, chênh lệch ghi thành biến động điều chỉnh */
export function AdjustModal({
  auth,
  fund,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  fund: Fund;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [actual, setActual] = useState<number | null>(fund.balance);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const diff = (actual ?? 0) - fund.balance;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await trpc.accounting.adjustFund.mutate(
        { fundId: fund.id, actualBalance: actual ?? 0, reason },
        apiContext(auth),
      );
      toast.success(
        `Đã điều chỉnh ${res.difference > 0 ? "+" : "−"}${fmtMoney(Math.abs(res.difference))}`,
      );
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal open onClose={onClose} title={`Kiểm quỹ — ${fund.name}`} size="sm">
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-slate-600">
          Số dư sổ sách: <b className="tabular-nums">{fmtMoney(fund.balance)}</b>
        </p>
        <Field
          label={fund.type === "bank" ? "Số dư theo sao kê" : "Số tiền đếm thực tế"}
          htmlFor="adj-actual"
          hint={
            diff
              ? `Chênh lệch ${diff > 0 ? "thừa +" : "thiếu −"}${fmtMoney(Math.abs(diff))}`
              : "Khớp sổ sách"
          }
        >
          <MoneyInput id="adj-actual" value={actual} onChange={setActual} />
        </Field>
        <Field label="Lý do *" htmlFor="adj-reason">
          <input
            id="adj-reason"
            className={inputCls}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Kiểm quỹ cuối tháng"
          />
        </Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={!diff}>
            Ghi điều chỉnh
          </button>
        </div>
      </form>
    </Modal>
  );
}
