"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  GROUP_BYS,
  defaultGroupBy,
  paymentMethodLabel,
  type GroupBy,
  type TxnReport,
} from "@/lib/report";
import { fmtInt, fmtVnd, fmtVndShort } from "./dashboard-format";
import { reportApi, type ReportOptions } from "./report-api";
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

/** Báo cáo giao dịch (P5.5, SRS-PH-RPT-01): filters, totals + fees, chart and table per period. */

const GROUP_LABELS: Record<GroupBy, string> = {
  day: "Theo ngày",
  week: "Theo tuần",
  month: "Theo tháng",
};
const STATUS_OPTIONS = [
  ["", "Tất cả trạng thái"],
  ["paid", "Thành công (gồm đã hoàn)"],
  ["failed", "Thất bại / hết hạn"],
  ["pending", "Đang chờ"],
  ["Success", "Success"],
  ["Refunded,PartiallyRefunded", "Đã hoàn tiền"],
] as const;

export function TransactionReport({
  authToken,
  options,
  today,
}: {
  authToken: string;
  options: ReportOptions;
  today: string;
}) {
  const [period, setPeriod] = useState(() => initialPeriod(today));
  const [groupBy, setGroupBy] = useState<GroupBy | "">("");
  const [status, setStatus] = useState("");
  const [partner, setPartner] = useState("");
  const [method, setMethod] = useState("");
  const [merchant, setMerchant] = useState("");
  const [report, setReport] = useState<TxnReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams({ from: period.range.from, to: period.range.to });
    q.set("group_by", groupBy || defaultGroupBy(period.range));
    if (status) q.set("status", status);
    if (partner) q.set("partner", partner);
    if (method) q.set("payment_method", method);
    if (merchant) q.set("merchant_id", merchant);
    return q;
  }, [period, groupBy, status, partner, method, merchant]);

  useEffect(() => {
    let alive = true;
    reportApi
      .transactions(authToken, query)
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

  const s = report?.summary;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker
            id="txn"
            today={today}
            value={period}
            onChange={(v) => {
              setLoading(true);
              setPeriod(v);
            }}
          />
          <select
            aria-label="Nhóm theo"
            className={selectCls}
            value={groupBy || defaultGroupBy(period.range)}
            onChange={(e) => {
              setLoading(true);
              setGroupBy(e.target.value as GroupBy);
            }}
          >
            {GROUP_BYS.map((g) => (
              <option key={g} value={g}>
                {GROUP_LABELS[g]}
              </option>
            ))}
          </select>
          <select
            aria-label="Trạng thái"
            className={selectCls}
            value={status}
            onChange={(e) => {
              setLoading(true);
              setStatus(e.target.value);
            }}
          >
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Đối tác"
            className={selectCls}
            value={partner}
            onChange={(e) => {
              setLoading(true);
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
          <select
            aria-label="Phương thức thanh toán"
            className={selectCls}
            value={method}
            onChange={(e) => {
              setLoading(true);
              setMethod(e.target.value);
            }}
          >
            <option value="">Tất cả phương thức</option>
            {options.paymentMethods.map((m) => (
              <option key={m} value={m}>
                {paymentMethodLabel(m)}
              </option>
            ))}
          </select>
          {options.merchants.length > 1 && (
            <select
              aria-label="Merchant"
              className={selectCls}
              value={merchant}
              onChange={(e) => {
                setLoading(true);
                setMerchant(e.target.value);
              }}
            >
              <option value="">Tất cả merchant</option>
              {options.merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>
          )}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        <ExportButtons
          disabled={!report}
          onExport={async (f) => {
            try {
              await reportApi.download(authToken, "transactions", f, query);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Xuất báo cáo thất bại");
            }
          }}
        />
      </div>

      <ErrorBox message={error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Tổng GD"
          value={s ? fmtInt(s.total) : "—"}
          hint={s ? `${fmtInt(s.pending)} đang chờ` : undefined}
        />
        <StatCard
          label="Thành công"
          tone="success"
          value={s ? fmtInt(s.paid) : "—"}
          hint={
            s
              ? `Tỷ lệ ${s.successRate === null ? "—" : `${s.successRate.toLocaleString("vi-VN")} %`}${s.refunded ? ` · ${fmtInt(s.refunded)} đã hoàn` : ""}`
              : undefined
          }
        />
        <StatCard label="Thất bại / hết hạn" tone="error" value={s ? fmtInt(s.failed) : "—"} />
        <StatCard
          label="Tổng tiền thành công"
          value={s ? fmtVndShort(s.paidAmount) : "—"}
          hint={s ? `Mọi GD: ${fmtVndShort(s.totalAmount)}` : undefined}
        />
        <StatCard
          label="Phí GD (ước tính)"
          tone="warning"
          value={s ? fmtVndShort(s.fees) : "—"}
          hint="Theo biểu phí cấu hình đối tác"
        />
      </div>

      <Card title={`Biểu đồ giao dịch ${GROUP_LABELS[report?.groupBy ?? "day"].toLowerCase()}`}>
        {report ? (
          <ReportBarChart
            ariaLabel={`Số giao dịch ${report.buckets.length} kỳ`}
            items={report.buckets.map((b) => ({
              key: b.key,
              label: report.groupBy === "day" ? b.label.slice(0, 5) : b.label,
              values: { paid: b.paid, failed: b.failed, pending: b.pending },
            }))}
            series={[
              { key: "paid", name: "Thành công", color: "#10B981" },
              { key: "failed", name: "Thất bại / hết hạn", color: "#EF4444" },
              { key: "pending", name: "Đang chờ", color: "#CBD5E1" },
            ]}
            format={fmtInt}
            axisFormat={(n) => fmtInt(Math.round(n))}
          />
        ) : (
          <div className="h-48" />
        )}
      </Card>

      <Card title="Chi tiết giao dịch" bodyClass="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2">{report?.groupBy === "day" ? "Ngày" : "Kỳ"}</th>
              <th className="px-4 py-2 text-right">Số GD</th>
              <th className="px-4 py-2 text-right">Thành công</th>
              <th className="px-4 py-2 text-right">Thất bại</th>
              <th className="px-4 py-2 text-right">Tổng tiền thành công</th>
              <th className="px-4 py-2 text-right">Phí</th>
              <th className="px-4 py-2 text-right">Tỷ lệ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report &&
              [...report.buckets].reverse().map((b) => (
                <tr key={b.key} className={b.total ? "" : "text-gray-400"}>
                  <td className="px-4 py-2 whitespace-nowrap">{b.label}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                    {fmtInt(b.total)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold whitespace-nowrap text-emerald-600 tabular-nums">
                    {fmtInt(b.paid)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-red-600 tabular-nums">
                    {fmtInt(b.failed)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                    {fmtVnd(b.paidAmount)}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                    {fmtVnd(b.fees)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {b.successRate === null ? (
                      "—"
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.successRate >= 90 ? "bg-emerald-50 text-emerald-700" : b.successRate >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}
                      >
                        {b.successRate.toLocaleString("vi-VN")} %
                      </span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
          {s && (
            <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-2">Tổng</td>
                <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                  {fmtInt(s.total)}
                </td>
                <td className="px-4 py-2 text-right text-emerald-600 tabular-nums">
                  {fmtInt(s.paid)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap text-red-600 tabular-nums">
                  {fmtInt(s.failed)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                  {fmtVnd(s.paidAmount)}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                  {fmtVnd(s.fees)}
                </td>
                <td className="px-4 py-2 text-right">
                  {s.successRate === null ? "—" : `${s.successRate.toLocaleString("vi-VN")} %`}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}
