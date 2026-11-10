"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtMoney, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, inputCls, useLoad } from "@/components/staff/shared";
import { Pager, fmtDay } from "@/components/suppliers/shared";
import { KpiTile } from "@/components/reports/shared";
import { cn } from "@/lib/utils";
import { AccountingHeader } from "./shared";

const AGING_LABEL = {
  current: "Chưa đến hạn",
  d1_30: "Quá hạn 1–30 ngày",
  d31_60: "31–60 ngày",
  d61_90: "61–90 ngày",
  d90_plus: "Trên 90 ngày",
} as const;
type AgingKey = keyof typeof AGING_LABEL;
const AGING_KEYS = Object.keys(AGING_LABEL) as AgingKey[];

/** Công nợ phải thu (khách hàng) + phải trả (NCC), tuổi nợ; thanh toán ghi tại CRM / NCC */
export function DebtSummary({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const [kind, setKind] = useState<"receivable" | "payable">("receivable");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const input = { kind, overdueOnly, page, pageSize: 20, ...(query ? { search: query } : {}) };
  const data = useLoad(JSON.stringify(input), () => trpc.accounting.debts.query(input, ctx));
  const d = data.data;
  const href = (id: number) => (kind === "receivable" ? `/crm/${id}` : `/suppliers/${id}`);

  return (
    <div className="space-y-5">
      <AccountingHeader
        title="Kế toán & Tài chính"
        subtitle="Công nợ tổng hợp: khách hàng nợ cửa hàng (phải thu) và cửa hàng nợ nhà cung cấp (phải trả)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist">
          {(
            [
              ["receivable", "Phải thu (khách hàng)"],
              ["payable", "Phải trả (nhà cung cấp)"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => {
                setKind(k);
                setPage(1);
              }}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium",
                kind === k ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => {
              setOverdueOnly(e.target.checked);
              setPage(1);
            }}
          />
          Chỉ đối tượng có nợ quá hạn
        </label>
        <form
          className="relative min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Tên, mã, số điện thoại (Enter)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm đối tượng công nợ"
          />
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile
          label={kind === "receivable" ? "Tổng phải thu" : "Tổng phải trả"}
          value={fmtMoney(d?.totals.remaining ?? 0)}
        />
        <KpiTile label="Trong đó quá hạn" value={fmtMoney(d?.totals.overdue ?? 0)} />
        <KpiTile
          label={kind === "receivable" ? "Khách hàng còn nợ" : "Nhà cung cấp còn nợ"}
          value={`${d?.totals.parties ?? 0} (${d?.totals.overdueParties ?? 0} quá hạn)`}
        />
      </div>

      {d && d.totals.remaining > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-semibold text-slate-800">Tuổi nợ</h3>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            {AGING_KEYS.map((k, i) => (
              <div
                key={k}
                style={{
                  width: `${(d.totals.aging[k] / d.totals.remaining) * 100}%`,
                  background: ["#10B981", "#F59E0B", "#F97316", "#EF4444", "#991B1B"][i],
                }}
              />
            ))}
          </div>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-5">
            {AGING_KEYS.map((k, i) => (
              <li key={k} className="flex items-start gap-2">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: ["#10B981", "#F59E0B", "#F97316", "#EF4444", "#991B1B"][i] }}
                />
                <span>
                  <span className="block text-slate-500">{AGING_LABEL[k]}</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {fmtMoney(d.totals.aging[k])}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ErrorBox message={data.error} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">
                  {kind === "receivable" ? "Khách hàng" : "Nhà cung cấp"}
                </th>
                <th className="px-4 py-3 text-right">Còn nợ</th>
                <th className="px-4 py-3 text-right">Quá hạn</th>
                <th className="px-4 py-3 text-right">Số khoản</th>
                <th className="px-4 py-3">Hạn sớm nhất</th>
                <th className="px-4 py-3">Trễ tối đa</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d?.items.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.code}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {fmtMoney(p.remaining)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums",
                      p.overdue ? "font-medium text-red-600" : "text-slate-400",
                    )}
                  >
                    {p.overdue ? fmtMoney(p.overdue) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.debtCount}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDay(p.oldestDue)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {p.maxDaysOverdue > 0 ? (
                      <span className="text-red-600">{p.maxDaysOverdue} ngày</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={href(p.id)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {kind === "receivable" ? "Thu nợ" : "Thanh toán"} →
                    </Link>
                  </td>
                </tr>
              ))}
              {d && d.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Không có công nợ {kind === "receivable" ? "phải thu" : "phải trả"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {d && (
          <Pager page={page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={setPage} />
        )}
      </div>
      <p className="text-xs text-slate-500">
        Ghi nhận thanh toán ở trang chi tiết khách hàng / nhà cung cấp — hệ thống tự lập phiếu thu
        (thu nợ khách) hoặc phiếu chi (tiền nhập hàng) vào sổ thu chi, kèm quỹ được chọn.
      </p>
    </div>
  );
}
