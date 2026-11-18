"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { trpc } from "@/lib/trpc";
import { apiContext, fmtMoney } from "@/components/inventory/shared";
import { METHOD_LABEL } from "@/components/reports/shared";
import { useOfflineQuery } from "@/hooks/useOfflineQuery";
import { MOBILE_PERIODS, periodRange, type MobilePeriod } from "@/lib/pwa/periods";
import { cn } from "@/lib/utils";
import { Card, Change, DataStatus, Empty, MiniBars, Skeleton, fmtCompact } from "./shared";
import { useApiAuth } from "@/components/auth/AuthProvider";

type Outputs = inferRouterOutputs<AppRouter>["reports"];
interface ReportData {
  revenue: Outputs["revenue"];
  products: Outputs["products"];
}

/**
 * Sales report on the phone (P6.4): net revenue, profit, invoices vs the previous period,
 * revenue by day, payment methods, best sellers. Same numbers as /reports (report.service).
 */
export function MobileReports() {
  const auth = useApiAuth();
  const [period, setPeriod] = useState<MobilePeriod>("7d");
  // the range is computed when fetching (not while rendering: "today" moves, and the page shell
  // is prerendered)
  const q = useOfflineQuery<ReportData>(auth, `reports:${period}`, async () => {
    const range = periodRange(period);
    const ctx = apiContext(auth);
    const [revenue, products] = await Promise.all([
      trpc.reports.revenue.query({ ...range, compare: "previous_period" }, ctx),
      trpc.reports.products.query({ ...range, compare: "none" }, ctx),
    ]);
    return { revenue, products };
  });
  const r = q.data?.revenue;
  const s = r?.summary;

  return (
    <div>
      <h1 className="mb-3 text-xl font-bold text-slate-900">Báo cáo bán hàng</h1>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-lg bg-slate-200/60 p-1" role="tablist">
        {MOBILE_PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="tab"
            aria-selected={period === p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              "h-9 rounded-md text-sm font-medium",
              period === p.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <DataStatus {...q} onRefresh={() => void q.refresh()} />

      {!r || !s ? (
        q.loading ? (
          <Skeleton rows={4} />
        ) : null
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Metric
              label="Doanh thu thuần"
              value={`${fmtCompact(s.current.net)}₫`}
              change={s.change?.net}
            />
            <Metric
              label="Lợi nhuận gộp"
              value={`${fmtCompact(s.current.profit)}₫`}
              change={s.change?.profit}
              hint={s.current.margin !== null ? `Biên ${s.current.margin}%` : undefined}
            />
            <Metric
              label="Số hoá đơn"
              value={String(s.current.invoices)}
              change={s.change?.invoices}
            />
            <Metric label="TB / hoá đơn" value={`${fmtCompact(s.current.avgPerInvoice)}₫`} />
          </div>

          {r.series.points.length > 1 && (
            <Card title={r.series.unit === "day" ? "Doanh thu theo ngày" : "Doanh thu theo tháng"}>
              <MiniBars
                highlight={r.series.points.at(-1)?.key}
                points={r.series.points.map((p) => ({
                  key: p.key,
                  label: r.series.unit === "day" ? p.key.slice(8, 10) : p.key.slice(5, 7),
                  value: p.net,
                }))}
              />
            </Card>
          )}

          <Card title="Sản phẩm bán chạy">
            {q.data!.products.bestSelling.length === 0 ? (
              <Empty>Chưa có sản phẩm bán ra</Empty>
            ) : (
              <ol className="space-y-2 text-sm">
                {q.data!.products.bestSelling.slice(0, 5).map((p, i) => (
                  <li key={p.productId} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-600">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-slate-800">{p.name}</span>
                      <span className="block text-xs text-slate-400">{p.qty} đã bán</span>
                    </span>
                    <span className="font-medium text-slate-700">{fmtCompact(p.net)}₫</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {r.paymentMethods && r.paymentMethods.length > 0 && (
            <Card title="Phương thức thanh toán">
              <ul className="space-y-2 text-sm">
                {r.paymentMethods.map((m) => (
                  <li key={m.method}>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-600">{METHOD_LABEL[m.method] ?? m.method}</span>
                      <span className="font-medium text-slate-800">{fmtMoney(m.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${m.percent}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Link
            href="/reports"
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700"
          >
            Báo cáo đầy đủ (lợi nhuận, nhân viên, tồn kho…) <ExternalLink className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  change?: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
      <Change value={change ?? null} />
    </div>
  );
}
