"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { CompareMode, RevenueLine, RevenueReport as Report } from "@/lib/report";
import { fmtInt, fmtVnd, fmtVndShort } from "./dashboard-format";
import { reportApi, type ReportOptions } from "./report-api";
import { ReportBarChart } from "./ReportBarChart";
import {
  Card,
  ErrorBox,
  ExportButtons,
  Growth,
  PeriodPicker,
  StatCard,
  initialPeriod,
  selectCls,
} from "./ReportControls";

/**
 * Báo cáo doanh thu (P5.5, SRS-PH-RPT-02): paid transactions by payment time, per partner and per
 * payment method, compared with the previous period or the same period last year, 12-month trend.
 */

const PARTNER_COLORS: Record<string, string> = {
  VNPay: "#2563EB",
  MoMo: "#D946EF",
  ZaloPay: "#0EA5E9",
  VietQR: "#8B5CF6",
};
const FALLBACK = ["#10B981", "#F59E0B", "#64748B", "#EF4444"];

function rangeLabel(r: { from: string; to: string }) {
  const f = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`;
}

function LinesTable({
  title,
  first,
  lines,
}: {
  title: string;
  first: string;
  lines: RevenueLine[];
}) {
  const total = lines.reduce(
    (a, l) => ({
      count: a.count + l.count,
      gross: a.gross + l.gross,
      refunded: a.refunded + l.refunded,
      fees: a.fees + l.fees,
      net: a.net + l.net,
    }),
    { count: 0, gross: 0, refunded: 0, fees: 0, net: 0 },
  );
  return (
    <Card title={title} bodyClass="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-2">{first}</th>
            <th className="px-4 py-2 text-right">Số GD</th>
            <th className="px-4 py-2 text-right">Doanh thu</th>
            <th className="px-4 py-2 text-right">Đã hoàn</th>
            <th className="px-4 py-2 text-right">Phí GD</th>
            <th className="px-4 py-2 text-right">Doanh thu thuần</th>
            <th className="px-4 py-2 text-right">Tỷ trọng</th>
            <th className="px-4 py-2 text-right">Tăng trưởng</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                Không có giao dịch thành công trong khoảng này
              </td>
            </tr>
          )}
          {lines.map((l) => (
            <tr key={l.key}>
              <td className="px-4 py-2 font-semibold text-gray-800">{l.label}</td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {fmtInt(l.count)}
              </td>
              <td className="px-4 py-2 text-right font-medium whitespace-nowrap tabular-nums">
                {fmtVnd(l.gross)}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {fmtVnd(l.refunded)}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {fmtVnd(l.fees)}
              </td>
              <td className="px-4 py-2 text-right font-medium whitespace-nowrap tabular-nums">
                {fmtVnd(l.net)}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {l.percentage.toLocaleString("vi-VN")} %
              </td>
              <td
                className="px-4 py-2 text-right whitespace-nowrap"
                title={`Kỳ so sánh: ${fmtVnd(l.previous.gross)}`}
              >
                <Growth value={l.growth} />
              </td>
            </tr>
          ))}
        </tbody>
        {lines.length > 0 && (
          <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold">
            <tr>
              <td className="px-4 py-2">Tổng</td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {fmtInt(total.count)}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {fmtVnd(total.gross)}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {fmtVnd(total.refunded)}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {fmtVnd(total.fees)}
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                {fmtVnd(total.net)}
              </td>
              <td className="px-4 py-2 text-right">100 %</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </Card>
  );
}

export function RevenueReport({
  authToken,
  options,
  today,
}: {
  authToken: string;
  options: ReportOptions;
  today: string;
}) {
  const [period, setPeriod] = useState(() => initialPeriod(today, "thisMonth"));
  const [compare, setCompare] = useState<CompareMode>("previous");
  const [partner, setPartner] = useState("");
  const [merchant, setMerchant] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const q = new URLSearchParams({
      from: period.range.from,
      to: period.range.to,
      compare,
    });
    if (partner) q.set("partner", partner);
    if (merchant) q.set("merchant_id", merchant);
    return q;
  }, [period, compare, partner, merchant]);

  useEffect(() => {
    let alive = true;
    reportApi
      .revenue(authToken, query)
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
  const compareLabel = compare === "year" ? "cùng kỳ năm trước" : "kỳ trước";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker
            id="rev"
            today={today}
            value={period}
            onChange={(v) => {
              setLoading(true);
              setPeriod(v);
            }}
          />
          <select
            aria-label="So sánh với"
            className={selectCls}
            value={compare}
            onChange={(e) => {
              setLoading(true);
              setCompare(e.target.value as CompareMode);
            }}
          >
            <option value="previous">So với kỳ trước</option>
            <option value="year">So với cùng kỳ năm trước</option>
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
              await reportApi.download(authToken, "revenue", f, query);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Xuất báo cáo thất bại");
            }
          }}
        />
      </div>

      <ErrorBox message={error} />
      {report && (
        <p className="text-xs text-gray-500">
          Doanh thu = GD thanh toán thành công trong {rangeLabel(report.range)} (theo thời điểm
          thanh toán), so với {rangeLabel(report.previousRange)}. Phí GD ước tính theo biểu phí cấu
          hình ở từng đối tác.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Doanh thu"
          tone="primary"
          value={s ? fmtVndShort(s.gross) : "—"}
          hint={s ? <Growth value={s.growth} suffix={`so với ${compareLabel}`} /> : undefined}
        />
        <StatCard
          label="Số GD thành công"
          value={s ? fmtInt(s.count) : "—"}
          hint={s ? <Growth value={s.countGrowth} /> : undefined}
        />
        <StatCard label="Đã hoàn tiền" tone="error" value={s ? fmtVndShort(s.refunded) : "—"} />
        <StatCard label="Phí GD (ước tính)" tone="warning" value={s ? fmtVndShort(s.fees) : "—"} />
        <StatCard
          label="Doanh thu thuần"
          tone="success"
          value={s ? fmtVndShort(s.net) : "—"}
          hint={s ? <Growth value={s.netGrowth} /> : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Doanh thu theo đối tác">
          {report && report.byPartner.some((l) => l.gross > 0) ? (
            <ul className="space-y-3">
              {report.byPartner
                .filter((l) => l.gross > 0)
                .map((l, i) => (
                  <li key={l.key}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-gray-800">{l.label}</span>
                      <span className="font-medium tabular-nums">{fmtVnd(l.gross)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-gray-100">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${Math.max(l.percentage, 1)}%`,
                          background: PARTNER_COLORS[l.label] ?? FALLBACK[i % FALLBACK.length],
                        }}
                      />
                    </div>
                    <div className="mt-0.5 flex justify-between text-xs text-gray-500">
                      <span>
                        {l.percentage.toLocaleString("vi-VN")} % · {fmtInt(l.count)} GD
                      </span>
                      <Growth value={l.growth} />
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              Không có giao dịch thành công trong khoảng này
            </p>
          )}
        </Card>
        <Card title="Tăng trưởng theo tháng (12 tháng)">
          {report ? (
            <ReportBarChart
              ariaLabel="Doanh thu 12 tháng"
              items={report.trend.map((t) => ({
                key: t.key,
                label: `T${Number(t.key.slice(5, 7))}`,
                values: { net: Math.max(t.net, 0), cost: t.gross - Math.max(t.net, 0) },
              }))}
              series={[
                { key: "net", name: "Doanh thu thuần", color: "#2563EB" },
                { key: "cost", name: "Hoàn tiền + phí", color: "#93C5FD" },
              ]}
              format={fmtVnd}
              axisFormat={(n) => fmtVndShort(n).replace(" ₫", "")}
              emptyText="Chưa có doanh thu trong 12 tháng"
              width={440}
              height={260}
            />
          ) : (
            <div className="h-48" />
          )}
        </Card>
      </div>

      <LinesTable
        title="Doanh thu chi tiết theo đối tác"
        first="Đối tác"
        lines={report?.byPartner ?? []}
      />
      <LinesTable
        title="Doanh thu theo phương thức thanh toán"
        first="Phương thức"
        lines={report?.byMethod ?? []}
      />
    </div>
  );
}
