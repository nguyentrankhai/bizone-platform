"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtMoney,
  fmtNumber,
  type ApiAuth,
} from "@/components/inventory/shared";
import { CommissionRuleForm, RULE_TYPES, type RuleRow } from "./CommissionRuleForm";
import { ErrorBox, btnPrimary, btnSecondary, inputAutoCls, useLoad, vnToday } from "./shared";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Chờ trả", cls: "bg-amber-50 text-amber-800" },
  paid: { label: "Đã trả", cls: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Huỷ", cls: "bg-slate-100 text-slate-500" },
};

export function CommissionClient({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const [month, setMonth] = useState(vnToday().slice(0, 7));
  const [userId, setUserId] = useState<number | undefined>();
  const [editing, setEditing] = useState<RuleRow | null | "new">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const rules = useLoad(JSON.stringify(["rules", auth]), () =>
    trpc.staff.commission.rules.query(undefined, ctx),
  );
  const list = useLoad(JSON.stringify([month, userId, auth]), () =>
    trpc.staff.commission.list.query({ month, userId, page: 1, pageSize: 100 }, ctx),
  );

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await fn());
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const recalc = () =>
    run(async () => {
      const r = await trpc.staff.commission.recalculate.mutate({ month }, ctx);
      return `Đã tính lại tháng ${month}: ${r.users} nhân viên, +${r.created} / sửa ${r.updated} / bỏ ${r.removed} dòng`;
    });
  const pay = (uid: number, name: string) =>
    run(async () => {
      const r = await trpc.staff.commission.pay.mutate({ userId: uid, month }, ctx);
      return `Đã ghi nhận trả ${fmtMoney(r.amount)} (${r.count} dòng) cho ${name}`;
    });

  const summary = list.data?.summary ?? [];
  const totalPending = summary.reduce((s, r) => s + r.pending, 0);
  const totalPaid = summary.reduce((s, r) => s + r.paid, 0);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold text-slate-800">Quy tắc hoa hồng</h2>
          <button className={btnPrimary} onClick={() => setEditing("new")}>
            + Thêm quy tắc
          </button>
        </div>
        <ErrorBox message={rules.error} />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Quy tắc</th>
                <th className="px-3 py-2 text-left font-medium">Cách tính</th>
                <th className="px-3 py-2 text-left font-medium">Áp dụng</th>
                <th className="px-3 py-2 text-right font-medium">Doanh số tối thiểu</th>
                <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(rules.data ?? []).map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-slate-100 ${r.isActive ? "" : "text-slate-400"}`}
                >
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">
                    {fmtNumber(r.value)} {RULE_TYPES[r.type].unit}{" "}
                    <span className="text-xs text-slate-500">{RULE_TYPES[r.type].label}</span>
                  </td>
                  <td className="px-3 py-2">
                    {r.product
                      ? `SP: ${r.product.name}`
                      : r.category
                        ? `DM: ${r.category.name}`
                        : "Mọi sản phẩm"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.minRevenue ? fmtMoney(r.minRevenue) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.isActive ? "Đang áp dụng" : "Tạm dừng"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="h-9 rounded-md px-3 text-primary hover:bg-blue-50"
                      onClick={() => setEditing(r)}
                    >
                      Sửa
                    </button>
                  </td>
                </tr>
              ))}
              {rules.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Chưa có quy tắc — hoa hồng sẽ được tính tự động sau mỗi hoá đơn khi có quy tắc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold text-slate-800">Hoa hồng theo tháng</h2>
          <input
            type="month"
            aria-label="Tháng"
            className={inputAutoCls}
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
          <button className={btnSecondary} disabled={busy} onClick={recalc}>
            Tính lại
          </button>
        </div>
        <ErrorBox message={error || list.error} />
        {notice && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Chờ thanh toán</p>
            <p className="text-2xl font-bold text-amber-700">{fmtMoney(totalPending)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Đã thanh toán</p>
            <p className="text-2xl font-bold text-emerald-700">{fmtMoney(totalPaid)}</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nhân viên</th>
                <th className="px-3 py-2 text-right font-medium">Số dòng</th>
                <th className="px-3 py-2 text-right font-medium">Chờ trả</th>
                <th className="px-3 py-2 text-right font-medium">Đã trả</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr
                  key={s.user.id}
                  className={`border-t border-slate-100 ${userId === s.user.id ? "bg-blue-50/50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <button
                      className="font-medium text-slate-800 hover:text-primary"
                      onClick={() => setUserId(userId === s.user.id ? undefined : s.user.id)}
                    >
                      {s.user.fullName}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">{s.count}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{fmtMoney(s.pending)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{fmtMoney(s.paid)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="h-9 rounded-md px-3 text-sm text-primary hover:bg-blue-50 disabled:text-slate-300"
                      disabled={busy || s.pending <= 0}
                      onClick={() => pay(s.user.id, s.user.fullName)}
                    >
                      Thanh toán
                    </button>
                  </td>
                </tr>
              ))}
              {list.data && summary.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Chưa có hoa hồng trong tháng {month}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(list.data?.items.length ?? 0) > 0 && (
          <details className="rounded-lg border border-slate-200 bg-white" open={Boolean(userId)}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
              Chi tiết theo hoá đơn ({list.data?.meta.total} dòng
              {userId ? " — đang lọc 1 nhân viên" : ""})
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Hoá đơn</th>
                    <th className="px-3 py-2 text-left font-medium">Nhân viên</th>
                    <th className="px-3 py-2 text-left font-medium">Quy tắc</th>
                    <th className="px-3 py-2 text-right font-medium">Giá trị HĐ</th>
                    <th className="px-3 py-2 text-right font-medium">Hoa hồng</th>
                    <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data?.items.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        {c.invoice?.invoiceCode ?? "—"}
                        <p className="text-xs text-slate-400">
                          {fmtDate(c.invoice?.createdAt, true)}
                        </p>
                      </td>
                      <td className="px-3 py-2">{c.user.fullName}</td>
                      <td className="px-3 py-2">{c.commissionRule?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {fmtMoney(c.invoice?.totalAmount ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{fmtMoney(c.amount)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[c.status].cls}`}
                        >
                          {STATUS[c.status].label}
                        </span>
                        {c.paidAt && (
                          <span className="ml-1 text-xs text-slate-400">{fmtDate(c.paidAt)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      {editing && (
        <CommissionRuleForm
          auth={auth}
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            rules.reload();
          }}
        />
      )}
    </div>
  );
}
