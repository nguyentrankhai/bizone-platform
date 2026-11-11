"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { RECON_DAY_STATUS_LABELS, formatDay, reconDayStatus, unmatchedOf } from "@/lib/report";
import { fmtInt, fmtVnd, fmtVndShort } from "./dashboard-format";
import {
  reportApi,
  type PageMeta,
  type ReconDiscrepancyRow,
  type ReconciliationReport as Report,
  type ReportOptions,
} from "./report-api";
import { ReportBarChart } from "./ReportBarChart";
import {
  Card,
  ErrorBox,
  ExportButtons,
  PeriodPicker,
  StatCard,
  initialPeriod,
  selectCls,
} from "./ReportControls";

/**
 * Báo cáo đối soát (P5.5, SRS-PH-RPT-03): result per day and partner (latest completed run),
 * totals matched / unmatched / difference, every discrepancy with its resolution.
 */

const KIND_LABELS: Record<string, string> = {
  Unmatched_PaymentHub: "Chỉ có ở Payment Hub",
  Unmatched_Partner: "Chỉ có ở đối tác",
  Amount_Mismatch: "Lệch số tiền",
};

const STATUS_BADGE = {
  matched: "bg-emerald-50 text-emerald-700",
  resolved: "bg-blue-50 text-blue-700",
  open: "bg-amber-50 text-amber-700",
  unverified: "bg-gray-100 text-gray-600",
} as const;

export function ReconciliationReport({
  authToken,
  options,
  today,
}: {
  authToken: string;
  options: ReportOptions;
  today: string;
}) {
  const [period, setPeriod] = useState(() => initialPeriod(today));
  const [partner, setPartner] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailStatus, setDetailStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<ReconDiscrepancyRow[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams({ from: period.range.from, to: period.range.to });
    if (partner) q.set("partner", partner);
    return q;
  }, [period, partner]);

  useEffect(() => {
    let alive = true;
    reportApi
      .reconciliation(authToken, query)
      .then((res) => {
        if (!alive) return;
        setReport(res.data);
        setError(null);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Không tải được báo cáo");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authToken, query]);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams(query);
    q.set("page", String(page));
    q.set("limit", "20");
    if (detailStatus) q.set("status", detailStatus);
    if (search.trim()) q.set("search", search.trim());
    const t = setTimeout(() => {
      reportApi
        .discrepancies(authToken, q)
        .then((res) => {
          if (!alive) return;
          setDetails(res.data);
          setMeta(res.meta ?? null);
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : "Không tải được dòng lệch");
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [authToken, query, page, detailStatus, search]);

  const s = report?.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker
            id="recon"
            today={today}
            value={period}
            onChange={(v) => {
              setLoading(true);
              setPage(1);
              setPeriod(v);
            }}
          />
          <select
            aria-label="Đối tác"
            className={selectCls}
            value={partner}
            onChange={(e) => {
              setLoading(true);
              setPage(1);
              setPartner(e.target.value);
            }}
          >
            <option value="">Tất cả đối tác</option>
            {options.partnerTypes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        <ExportButtons
          disabled={!report}
          onExport={async (f) => {
            try {
              await reportApi.download(authToken, "reconciliation", f, query);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Xuất báo cáo thất bại");
            }
          }}
        />
      </div>

      <ErrorBox message={error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Đợt đối soát"
          value={s ? fmtInt(s.runs) : "—"}
          hint={s ? `${fmtInt(s.days)} ngày có dữ liệu` : undefined}
        />
        <StatCard
          label="GD khớp"
          tone="success"
          value={s ? fmtInt(s.matched) : "—"}
          hint={
            s?.matchRate !== null && s?.matchRate !== undefined
              ? `Tỷ lệ khớp ${s.matchRate.toLocaleString("vi-VN")} %`
              : undefined
          }
        />
        <StatCard
          label="GD lệch"
          tone="error"
          value={s ? fmtInt(s.unmatched) : "—"}
          hint={
            s
              ? `PH ${fmtInt(s.unmatchedPaymenthub)} · ĐT ${fmtInt(s.unmatchedPartner)} · tiền ${fmtInt(s.amountMismatch)}`
              : undefined
          }
        />
        <StatCard
          label="Tổng chênh lệch"
          tone={s && s.discrepancy > 0 ? "error" : "default"}
          value={s ? fmtVndShort(s.discrepancy) : "—"}
          hint={s?.unverified ? `${fmtInt(s.unverified)} GD chưa tra cứu được` : undefined}
        />
        <StatCard
          label="Lệch chưa xử lý"
          tone={s && s.open > 0 ? "warning" : "success"}
          value={s ? fmtInt(s.open) : "—"}
        />
      </div>

      {report && report.daily.length > 1 && (
        <Card title="Kết quả đối soát theo ngày">
          <ReportBarChart
            ariaLabel="Giao dịch khớp / lệch theo ngày"
            items={report.daily.map((d) => ({
              key: d.date,
              label: formatDay(d.date).slice(0, 5),
              values: { matched: d.matched, unmatched: d.unmatched },
            }))}
            series={[
              { key: "matched", name: "Khớp", color: "#10B981" },
              { key: "unmatched", name: "Lệch", color: "#EF4444" },
            ]}
            format={fmtInt}
            axisFormat={(n) => fmtInt(Math.round(n))}
          />
        </Card>
      )}

      <Card title="Đối soát theo ngày & đối tác" bodyClass="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2">Đối tác</th>
              <th className="px-3 py-2 text-right">GD Payment Hub</th>
              <th className="px-3 py-2 text-right">GD đối tác</th>
              <th className="px-3 py-2 text-right">Khớp</th>
              <th className="px-3 py-2 text-right">Chỉ ở PH</th>
              <th className="px-3 py-2 text-right">Chỉ ở ĐT</th>
              <th className="px-3 py-2 text-right">Sai tiền</th>
              <th className="px-3 py-2 text-right">Chênh lệch</th>
              <th className="px-3 py-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report?.days.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-gray-400">
                  Chưa có đợt đối soát hoàn tất trong khoảng này —{" "}
                  <Link href="/reconciliation" className="text-blue-600 hover:underline">
                    chạy đối soát
                  </Link>
                </td>
              </tr>
            )}
            {report?.days.map((d) => {
              const st = reconDayStatus(d);
              return (
                <tr key={d.runId}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link
                      href={`/reconciliation?run=${d.runId}`}
                      className="text-blue-600 hover:underline"
                    >
                      {formatDay(d.date)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-gray-800">{d.partnerName}</span>
                    <span className="ml-1 text-xs text-gray-400">
                      {d.source === "File" ? "file" : "API"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {fmtInt(d.totalPaymenthub)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {fmtInt(d.totalPartner)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap text-emerald-600 tabular-nums">
                    {fmtInt(d.matched)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {fmtInt(d.unmatchedPaymenthub)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {fmtInt(d.unmatchedPartner)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    {fmtInt(d.amountMismatch)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums ${unmatchedOf(d) ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {fmtVnd(d.discrepancy)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[st]}`}
                    >
                      {RECON_DAY_STATUS_LABELS[st]}
                      {st === "open" ? ` (${d.open})` : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card
        title={`Chi tiết giao dịch lệch${meta ? ` (${fmtInt(meta.total)})` : ""}`}
        bodyClass="overflow-x-auto"
        action={
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Trạng thái xử lý"
              className={selectCls}
              value={detailStatus}
              onChange={(e) => {
                setPage(1);
                setDetailStatus(e.target.value);
              }}
            >
              <option value="">Tất cả</option>
              <option value="Open">Chưa xử lý</option>
              <option value="Resolved">Đã xử lý</option>
            </select>
            <input
              aria-label="Tìm mã giao dịch"
              placeholder="Tìm mã GD…"
              className={`${selectCls} w-44`}
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>
        }
      >
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
            <tr>
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2">Đối tác</th>
              <th className="px-3 py-2">Kiểu</th>
              <th className="px-3 py-2">Mã GD</th>
              <th className="px-3 py-2 text-right">Số tiền PH</th>
              <th className="px-3 py-2 text-right">Số tiền ĐT</th>
              <th className="px-3 py-2 text-right">Chênh lệch</th>
              <th className="px-3 py-2">Xử lý</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {details.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  Không có giao dịch lệch
                </td>
              </tr>
            )}
            {details.map((d) => (
              <tr key={d.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link
                    href={`/reconciliation?run=${d.run_id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {formatDay(d.run_date)}
                  </Link>
                </td>
                <td className="px-3 py-2">{d.partner_name}</td>
                <td className="px-3 py-2 whitespace-nowrap">{KIND_LABELS[d.match_status]}</td>
                <td className="px-3 py-2">
                  {d.txn_code ? (
                    <Link
                      href={`/transactions/${encodeURIComponent(d.txn_code)}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {d.txn_code}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-gray-600">
                      {d.partner_txn_id ?? d.partner_ref ?? "—"}
                    </span>
                  )}
                  {d.note && <p className="mt-0.5 max-w-xs text-xs text-gray-500">{d.note}</p>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {d.paymenthub_amount === null ? "—" : fmtVnd(d.paymenthub_amount)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {d.partner_amount === null ? "—" : fmtVnd(d.partner_amount)}
                </td>
                <td className="px-3 py-2 text-right font-medium whitespace-nowrap text-red-600 tabular-nums">
                  {fmtVnd(d.discrepancy_amount)}
                </td>
                <td className="px-3 py-2">
                  {d.status === "Resolved" ? (
                    <>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Đã xử lý
                      </span>
                      {d.resolution && (
                        <p className="mt-0.5 max-w-xs text-xs text-gray-500">
                          {d.resolution}
                          {d.resolved_by ? ` — ${d.resolved_by}` : ""}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Chưa xử lý
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-sm text-gray-600">
            <span>
              Trang {meta.page} / {meta.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="min-h-9 rounded-lg border border-gray-200 px-3 disabled:opacity-40"
              >
                ‹ Trước
              </button>
              <button
                type="button"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="min-h-9 rounded-lg border border-gray-200 px-3 disabled:opacity-40"
              >
                Sau ›
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
