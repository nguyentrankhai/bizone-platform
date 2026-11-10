"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  downloadCsv,
  errorMessage,
  fmtMoney,
  type ApiAuth,
} from "@/components/inventory/shared";
import { ErrorBox, btnSecondary, inputAutoCls, useLoad } from "@/components/staff/shared";
import { Pager, fmtDay } from "@/components/suppliers/shared";
import { fmtDT } from "@/components/marketing/shared";
import { cn } from "@/lib/utils";
import { PeriodPicker, flattenCategories, useCategories, usePeriod, type Outputs } from "./shared";

type Ledger = Outputs["accounting"]["ledger"];

/**
 * Sổ quỹ dạng sổ: tồn đầu kỳ → từng biến động (thu / chi / tồn sau biến động) → cộng phát sinh,
 * tồn cuối kỳ. Lọc theo khoảng ngày, chiều thu/chi, danh mục thu chi.
 */
export function LedgerTable({ auth, fundId }: { auth: ApiAuth; fundId: number }) {
  const ctx = apiContext(auth);
  const period = usePeriod("thisMonth");
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [page, setPage] = useState(1);
  const cats = useCategories(auth);

  const filter = {
    fundId,
    from: period.range.from,
    to: period.range.to,
    ...(direction ? { direction } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
  const input = { ...filter, page, pageSize: 100 };
  const ledger = useLoad(JSON.stringify(input), () => trpc.accounting.ledger.query(input, ctx));
  const d = ledger.data;

  async function exportCsv() {
    try {
      const rows: Ledger["rows"] = [];
      let head: Ledger | null = null;
      for (let p = 1; p <= 50; p++) {
        const res = await trpc.accounting.ledger.query({ ...filter, page: p, pageSize: 200 }, ctx);
        head ??= res;
        rows.push(...res.rows);
        if (p >= res.meta.totalPages) break;
      }
      if (!head) return;
      downloadCsv(`so-quy_${head.fund.code}_${filter.from}_${filter.to}.csv`, [
        [`Sổ quỹ ${head.fund.name}`, `${fmtDay(filter.from)} - ${fmtDay(filter.to)}`],
        ["Thời gian", "Chứng từ", "Nội dung", "Danh mục", "Thu", "Chi", "Tồn"],
        ["", "", "Tồn đầu kỳ", "", "", "", head.opening],
        ...rows.map((r) => [
          fmtDT(r.at),
          r.record?.code ?? r.kind,
          r.description ?? "",
          r.record?.categoryName ?? "",
          r.direction === "in" ? r.amount : "",
          r.direction === "out" ? r.amount : "",
          r.balanceAfter,
        ]),
        ["", "", "Cộng phát sinh", "", head.totalIn, head.totalOut, ""],
        ["", "", "Tồn cuối kỳ", "", "", "", head.closing],
      ]);
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker period={period} />
        <select
          className={inputAutoCls}
          value={direction}
          aria-label="Chiều"
          onChange={(e) => {
            setPage(1);
            setDirection(e.target.value as typeof direction);
          }}
        >
          <option value="">Thu &amp; chi</option>
          <option value="in">Chỉ thu</option>
          <option value="out">Chỉ chi</option>
        </select>
        <select
          className={cn(inputAutoCls, "max-w-60")}
          value={categoryId}
          aria-label="Danh mục"
          onChange={(e) => {
            setPage(1);
            setCategoryId(e.target.value ? Number(e.target.value) : "");
          }}
        >
          <option value="">Mọi danh mục</option>
          {flattenCategories(cats.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button type="button" className={cn(btnSecondary, "ml-auto")} onClick={exportCsv}>
          <Download className="h-4 w-4" /> Xuất CSV
        </button>
      </div>
      <ErrorBox message={ledger.error} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Chứng từ</th>
                <th className="px-4 py-3">Nội dung</th>
                <th className="px-4 py-3 text-right">Thu</th>
                <th className="px-4 py-3 text-right">Chi</th>
                <th className="px-4 py-3 text-right">Tồn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50/60 font-medium">
                <td className="px-4 py-2.5" colSpan={5}>
                  Tồn đầu kỳ ({d ? fmtDay(d.range.from) : "…"})
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {d ? fmtMoney(d.opening) : ""}
                </td>
              </tr>
              {d?.rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{fmtDT(r.at)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <p className="font-medium text-slate-800">{r.record?.code ?? r.kind}</p>
                    {r.record && (
                      <p className="text-xs text-slate-500">
                        {r.kind}
                        {r.record.status === "cancelled" && " · đã huỷ"}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-slate-700">{r.description || "—"}</p>
                    <p className="text-xs text-slate-500">
                      {[r.record?.categoryName, r.record?.partnerName, r.createdBy]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-emerald-700 tabular-nums">
                    {r.direction === "in" ? fmtMoney(r.amount) : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-red-600 tabular-nums">
                    {r.direction === "out" ? fmtMoney(r.amount) : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {fmtMoney(r.balanceAfter)}
                  </td>
                </tr>
              ))}
              {d && d.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Không có biến động trong khoảng này
                  </td>
                </tr>
              )}
            </tbody>
            {d && (
              <tfoot className="border-t border-slate-200 bg-slate-50/60 font-medium">
                <tr>
                  <td className="px-4 py-2.5" colSpan={3}>
                    Cộng phát sinh{d.filtered ? " (theo bộ lọc)" : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-700 tabular-nums">
                    {fmtMoney(d.totalIn)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-red-600 tabular-nums">
                    {fmtMoney(d.totalOut)}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td className="px-4 py-2.5" colSpan={5}>
                    Tồn cuối kỳ ({fmtDay(d.range.to)})
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(d.closing)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {d && d.meta.totalPages > 1 && (
          <Pager page={page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={setPage} />
        )}
      </div>
    </div>
  );
}
