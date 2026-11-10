"use client";

import { useState } from "react";
import { ArrowLeftRight, Banknote, Landmark, Pencil, Plus, Scale } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, useLoad } from "@/components/staff/shared";
import { KpiTile } from "@/components/reports/shared";
import { fmtDT } from "@/components/marketing/shared";
import { cn } from "@/lib/utils";
import { AdjustModal, CashFundForm, TransferModal } from "./CashFundForm";
import { LedgerTable } from "./LedgerTable";
import {
  AccountingHeader,
  FUND_TYPE_LABEL,
  FundSelect,
  MoneyInput,
  signed,
  useFundOptions,
  type Fund,
  type Outputs,
} from "./shared";

type Session = Outputs["accounting"]["sessionsToDeposit"][number];

export function CashFundsClient({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const [showInactive, setShowInactive] = useState(false);
  const funds = useLoad(`funds:${showInactive}`, () =>
    trpc.accounting.funds.query({ includeInactive: showInactive }, ctx),
  );
  const options = useFundOptions(auth);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<Fund | "new" | null>(null);
  const [transferFrom, setTransferFrom] = useState<number | null | undefined>(undefined);
  const [adjusting, setAdjusting] = useState<Fund | null>(null);
  const [ledgerKey, setLedgerKey] = useState(0);

  const items = funds.data?.items ?? [];
  const current = items.find((f) => f.id === selected) ?? items.find((f) => f.isActive) ?? null;
  const reload = () => {
    funds.reload();
    options.reload();
    setLedgerKey((k) => k + 1);
  };

  return (
    <div className="space-y-5">
      <AccountingHeader
        title="Kế toán & Tài chính"
        subtitle="Quỹ tiền mặt / tài khoản ngân hàng, sổ quỹ và nộp tiền ca POS"
        actions={
          <>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setTransferFrom(current?.id ?? null)}
            >
              <ArrowLeftRight className="h-4 w-4" /> Chuyển quỹ
            </button>
            <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Thêm quỹ
            </button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Tổng tiền mặt" value={fmtMoney(funds.data?.totals.cash ?? 0)} />
        <KpiTile label="Tổng tiền gửi ngân hàng" value={fmtMoney(funds.data?.totals.bank ?? 0)} />
        <KpiTile label="Tổng số dư các quỹ" value={fmtMoney(funds.data?.totals.all ?? 0)} />
      </div>

      <ErrorBox message={funds.error} />
      <div className="flex items-center gap-2">
        <h2 className="mr-auto font-semibold text-slate-800">Danh sách quỹ</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Hiện quỹ ngừng sử dụng
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((f) => {
          const Icon = f.type === "bank" ? Landmark : Banknote;
          const active = current?.id === f.id;
          return (
            <div
              key={f.id}
              className={cn(
                "rounded-xl border bg-white p-4 transition",
                active ? "border-primary ring-2 ring-primary/20" : "border-slate-200",
                !f.isActive && "opacity-60",
              )}
            >
              <button
                type="button"
                className="flex w-full items-start gap-3 text-left"
                onClick={() => setSelected(f.id)}
                aria-pressed={active}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    f.type === "bank"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{f.name}</span>
                  <span className="block text-xs text-slate-500">
                    {f.code} · {FUND_TYPE_LABEL[f.type]}
                    {f.accountNo ? ` · ${f.accountNo}` : ""} · {f.branchName ?? "Quỹ chung"}
                    {!f.isActive && " · Ngừng sử dụng"}
                  </span>
                  <span className="mt-2 block text-xl font-bold text-slate-800 tabular-nums">
                    {fmtMoney(f.balance)}
                  </span>
                </span>
              </button>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <IconBtn label="Sửa" onClick={() => setEditing(f)}>
                  <Pencil className="h-3.5 w-3.5" />
                </IconBtn>
                {f.isActive && (
                  <>
                    <IconBtn label="Kiểm quỹ" onClick={() => setAdjusting(f)}>
                      <Scale className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Chuyển đi" onClick={() => setTransferFrom(f.id)}>
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                    </IconBtn>
                  </>
                )}
                <ToggleActive auth={auth} fund={f} onDone={reload} />
              </div>
            </div>
          );
        })}
        {!funds.loading && items.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Chưa có quỹ nào — bấm “Thêm quỹ” để tạo quỹ tiền mặt hoặc tài khoản ngân hàng.
          </p>
        )}
      </div>

      {current && (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-800">
            Sổ quỹ — {current.name}{" "}
            <span className="text-sm font-normal text-slate-500">
              (số dư hiện tại {fmtMoney(current.balance)})
            </span>
          </h2>
          <LedgerTable key={`${current.id}:${ledgerKey}`} auth={auth} fundId={current.id} />
        </section>
      )}

      <DepositSessions auth={auth} funds={options.data ?? []} onDone={reload} />

      {editing && (
        <CashFundForm
          auth={auth}
          editing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {transferFrom !== undefined && (
        <TransferModal
          auth={auth}
          funds={options.data ?? []}
          fromId={transferFrom}
          onClose={() => setTransferFrom(undefined)}
          onSaved={() => {
            setTransferFrom(undefined);
            reload();
          }}
        />
      )}
      {adjusting && (
        <AdjustModal
          auth={auth}
          fund={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50"
    >
      {children} {label}
    </button>
  );
}

function ToggleActive({ auth, fund, onDone }: { auth: ApiAuth; fund: Fund; onDone: () => void }) {
  const toast = useToast();
  return (
    <IconBtn
      label={fund.isActive ? "Ngừng dùng" : "Dùng lại"}
      onClick={async () => {
        if (fund.isActive && !confirm(`Ngừng sử dụng quỹ "${fund.name}"?`)) return;
        try {
          await trpc.accounting.updateFund.mutate(
            { id: fund.id, isActive: !fund.isActive },
            apiContext(auth),
          );
          onDone();
        } catch (e) {
          toast.error(errorMessage(e));
        }
      }}
    >
      {null}
    </IconBtn>
  );
}

/** Đối soát cuối ca: ca POS đã khoá, chênh lệch tiền mặt, nộp tiền ca vào quỹ */
function DepositSessions({
  auth,
  funds,
  onDone,
}: {
  auth: ApiAuth;
  funds: Outputs["accounting"]["fundOptions"];
  onDone: () => void;
}) {
  const ctx = apiContext(auth);
  const [nonce, setNonce] = useState(0);
  const sessions = useLoad(`sessions:${nonce}`, () =>
    trpc.accounting.sessionsToDeposit.query({ days: 14 }, ctx),
  );
  const [depositing, setDepositing] = useState<Session | null>(null);
  const rows = sessions.data ?? [];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold text-slate-800">Tiền ca POS (14 ngày gần nhất)</h2>
        <p className="text-sm text-slate-500">
          Đối soát tiền mặt cuối ca và nộp tiền ca vào quỹ — mỗi ca nộp một lần.
        </p>
      </div>
      <ErrorBox message={sessions.error} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Ca</th>
                <th className="px-4 py-3">Khoá lúc</th>
                <th className="px-4 py-3 text-right">Tiền mặt dự kiến</th>
                <th className="px-4 py-3 text-right">Thực đếm</th>
                <th className="px-4 py-3 text-right">Chênh lệch</th>
                <th className="px-4 py-3">Nộp quỹ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.sessionId}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800">Ca #{s.sessionId}</p>
                    <p className="text-xs text-slate-500">
                      {s.branchName} · {s.cashier}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDT(s.closedAt)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {fmtMoney(s.expectedCash)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {s.actualCash === null ? "—" : fmtMoney(s.actualCash)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums",
                      s.difference ? "font-medium text-red-600" : "text-slate-500",
                    )}
                  >
                    {s.difference === null ? "—" : signed(s.difference)}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.deposit ? (
                      <span className="text-emerald-700">
                        ✓ {fmtMoney(s.deposit.amount)} → {s.deposit.fundName}
                      </span>
                    ) : (s.actualCash ?? 0) > 0 ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={() => setDepositing(s)}
                      >
                        Nộp vào quỹ
                      </button>
                    ) : (
                      <span className="text-slate-400">Không có tiền mặt</span>
                    )}
                  </td>
                </tr>
              ))}
              {!sessions.loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Không có ca POS nào đã khoá trong 14 ngày
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {depositing && (
        <DepositModal
          auth={auth}
          session={depositing}
          funds={funds.filter(
            (f) => f.type === "cash" && (f.branchId === null || f.branchId === depositing.branchId),
          )}
          onClose={() => setDepositing(null)}
          onSaved={() => {
            setDepositing(null);
            setNonce((n) => n + 1);
            onDone();
          }}
        />
      )}
    </section>
  );
}

function DepositModal({
  auth,
  session,
  funds,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  session: Session;
  funds: Outputs["accounting"]["fundOptions"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [fundId, setFundId] = useState<number | null>(funds[0]?.id ?? null);
  const [amount, setAmount] = useState<number | null>(session.actualCash);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fundId) return setError("Chọn quỹ nhận tiền");
    try {
      await trpc.accounting.depositSession.mutate(
        { sessionId: session.sessionId, fundId, ...(amount ? { amount } : {}) },
        apiContext(auth),
      );
      toast.success(`Đã nộp tiền ca #${session.sessionId} vào quỹ`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal open onClose={onClose} title={`Nộp tiền ca #${session.sessionId}`} size="sm">
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-slate-600">
          Thực đếm cuối ca: <b className="tabular-nums">{fmtMoney(session.actualCash ?? 0)}</b>
          {session.openingBalance > 0 &&
            ` (gồm tiền đầu ca ${fmtMoney(session.openingBalance)} — giảm số nộp nếu để lại két)`}
        </p>
        <Field label="Quỹ nhận" htmlFor="dep-fund">
          <FundSelect
            id="dep-fund"
            funds={funds}
            value={fundId}
            onChange={setFundId}
            allowNone={false}
          />
        </Field>
        <Field label="Số tiền nộp" htmlFor="dep-amount">
          <MoneyInput id="dep-amount" value={amount} onChange={setAmount} />
        </Field>
        {funds.length === 0 && (
          <p className="text-sm text-amber-700">
            Chi nhánh này chưa có quỹ tiền mặt — tạo quỹ trước.
          </p>
        )}
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary} disabled={!fundId}>
            Nộp vào quỹ
          </button>
        </div>
      </form>
    </Modal>
  );
}
