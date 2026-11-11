"use client";

import { useState } from "react";
import { REPORT_TITLES, type ReportType } from "@/lib/report";
import type { ReportOptions } from "./report-api";
import { TransactionReport } from "./TransactionReport";
import { RevenueReport } from "./RevenueReport";
import { ReconciliationReport } from "./ReconciliationReport";

/** /reports (P5.5): tabs Báo cáo giao dịch / doanh thu / đối soát (mockup "Báo cáo"). */

export function ReportsClient({
  authToken,
  options,
  today,
  initialTab,
  canSeeReconciliation,
}: {
  authToken: string;
  options: ReportOptions;
  today: string;
  initialTab: ReportType;
  /** Merchant-bound tokens cannot see the per-partner reconciliation report. */
  canSeeReconciliation: boolean;
}) {
  const [tab, setTab] = useState<ReportType>(initialTab);
  const tabs = (Object.keys(REPORT_TITLES) as ReportType[]).filter(
    (t) => t !== "reconciliation" || canSeeReconciliation,
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Báo cáo</h1>
        <p className="text-sm text-gray-500">
          Số liệu theo giờ Việt Nam. Xuất Excel / PDF / CSV theo bộ lọc đang chọn.
        </p>
      </div>
      <div role="tablist" aria-label="Loại báo cáo" className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              window.history.replaceState(null, "", `/reports?tab=${t}`);
            }}
            className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-medium whitespace-nowrap ${
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {REPORT_TITLES[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "transactions" && (
          <TransactionReport authToken={authToken} options={options} today={today} />
        )}
        {tab === "revenue" && (
          <RevenueReport authToken={authToken} options={options} today={today} />
        )}
        {tab === "reconciliation" && canSeeReconciliation && (
          <ReconciliationReport authToken={authToken} options={options} today={today} />
        )}
      </div>
    </div>
  );
}
