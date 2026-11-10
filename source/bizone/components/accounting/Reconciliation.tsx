"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, useLoad } from "@/components/staff/shared";
import { KpiTile, Panel, tdNum, thCls, thNum } from "@/components/reports/shared";
import { fmtDT } from "@/components/marketing/shared";
import { cn } from "@/lib/utils";
import { AccountingHeader, PeriodPicker, signed, usePeriod } from "./shared";

const SEVERITY = {
  error: { label: "Cần xử lý", cls: "bg-red-50 text-red-700 ring-red-200" },
  warning: { label: "Cần kiểm tra", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  info: { label: "Lưu ý", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
} as const;

const ISSUE_LABEL: Record<string, string> = {
  underpaid: "Thu thiếu",
  overpaid: "Thu thừa",
  unverified_electronic: "Thẻ/QR chưa xác nhận",
  intent_mismatch: "Lệch Payment Hub",
  unattached_payment: "Tiền về chưa gắn HĐ",
  cash_difference: "Chênh lệch tiền ca",
  not_deposited: "Chưa nộp quỹ",
};

/** Đối soát thanh toán (SRS-ACC-05): hoá đơn ↔ tiền thu theo từng kênh */
export function Reconciliation({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const period = usePeriod("7days");
  const [onlyIssues, setOnlyIssues] = useState(true);
  const input = { from: period.range.from, to: period.range.to, onlyIssues };
  const data = useLoad(JSON.stringify(input), () =>
    trpc.accounting.reconciliation.query(input, ctx),
  );
  const d = data.data;

  return (
    <div className="space-y-5">
      <AccountingHeader
        title="Kế toán & Tài chính"
        subtitle="Đối soát hoá đơn với tiền thu: tiền mặt (kiểm ca), thẻ / QR (Payment Hub), chuyển khoản (sao kê)"
      />
      <div className="flex flex-wrap items-center gap-3">
        <PeriodPicker period={period} />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyIssues}
            onChange={(e) => setOnlyIssues(e.target.checked)}
          />
          Chỉ hoá đơn lệch
        </label>
      </div>
      <ErrorBox message={data.error} />
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile label="Hoá đơn trong kỳ" value={String(d.summary.invoices)} />
            <KpiTile label="Khớp" value={String(d.summary.matched)} />
            <KpiTile label="Hoá đơn cần kiểm tra" value={String(d.summary.withIssues)} />
            <KpiTile label="Vấn đề cần xử lý" value={`${d.summary.errors} / ${d.summary.issues}`} />
          </div>

          <Panel title="Theo phương thức thanh toán">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr>
                    <th className={thCls}>Phương thức</th>
                    <th className={thNum}>Ghi trên hoá đơn</th>
                    <th className={thNum}>Đã xác nhận</th>
                    <th className={thNum}>Chưa xác nhận</th>
                    <th className={thCls}>Nguồn đối chiếu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.methods.map((m) => (
                    <tr key={m.method}>
                      <td className="px-3 py-2">{m.label}</td>
                      <td className={tdNum}>{fmtMoney(m.recorded)}</td>
                      <td className={cn(tdNum, "text-emerald-700")}>{fmtMoney(m.confirmed)}</td>
                      <td className={cn(tdNum, m.unverified ? "text-amber-700" : "text-slate-400")}>
                        {fmtMoney(m.unverified)}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{m.source}</td>
                    </tr>
                  ))}
                  {d.methods.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                        Không có thanh toán trong kỳ
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={`Cần kiểm tra (${d.issueTotal})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr>
                    <th className={thCls}>Mức</th>
                    <th className={thCls}>Loại</th>
                    <th className={thCls}>Chứng từ</th>
                    <th className={thCls}>Thời gian</th>
                    <th className={thCls}>Chi tiết</th>
                    <th className={thNum}>Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.issues.map((i, idx) => (
                    <tr key={`${i.kind}${i.refId}${idx}`}>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
                            SEVERITY[i.severity].cls,
                          )}
                        >
                          {SEVERITY[i.severity].label}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {ISSUE_LABEL[i.kind] ?? i.kind}
                      </td>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {i.ref}
                        {i.branchName && (
                          <span className="block text-xs font-normal text-slate-500">
                            {i.branchName}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDT(i.at)}</td>
                      <td className="px-3 py-2 text-slate-600">{i.detail}</td>
                      <td className={tdNum}>{fmtMoney(i.amount)}</td>
                    </tr>
                  ))}
                  {d.issues.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-emerald-700">
                        ✓ Mọi hoá đơn và ca POS trong kỳ đều khớp
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {!onlyIssues && (
            <Panel title="Hoá đơn trong kỳ">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="text-xs text-slate-500 uppercase">
                    <tr>
                      <th className={thCls}>Hoá đơn</th>
                      <th className={thCls}>Thời gian</th>
                      <th className={thNum}>Tổng HĐ</th>
                      <th className={thNum}>Đã thu</th>
                      <th className={thNum}>Ghi nợ</th>
                      <th className={thNum}>Lệch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.invoices.map((i) => (
                      <tr key={i.id} className={cn(!i.ok && "bg-amber-50/40")}>
                        <td className="px-3 py-2 font-medium">{i.code}</td>
                        <td className="px-3 py-2 text-slate-500">{fmtDT(i.at)}</td>
                        <td className={tdNum}>{fmtMoney(i.total)}</td>
                        <td className={tdNum}>{fmtMoney(i.received)}</td>
                        <td className={tdNum}>{i.debt ? fmtMoney(i.debt) : "—"}</td>
                        <td className={cn(tdNum, i.difference ? "text-red-600" : "text-slate-400")}>
                          {i.difference ? signed(i.difference) : "0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
