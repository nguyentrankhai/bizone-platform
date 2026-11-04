"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Pencil, Power, PowerOff } from "lucide-react";
import { PARTNER_TYPES, type PartnerView } from "@/lib/partner-types";
import { EnvBadge, PartnerStatusBadge } from "./PartnerStatusBadge";
import { TestConnectionButton, TestResultLine } from "./TestConnectionButton";
import { fmtDateTime, partnerApi } from "./partner-api";

interface PartnerCardProps {
  partner: PartnerView;
  authToken: string;
  canWrite: boolean;
  onChange: (partner: PartnerView) => void;
}

export function PartnerCard({ partner, authToken, canWrite, onChange }: PartnerCardProps) {
  const spec = PARTNER_TYPES[partner.connectorType];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canActivate = partner.status !== "Active" && !!partner.testResult?.success;

  async function toggle() {
    const next = partner.status === "Inactive" ? "Active" : "Inactive";
    if (
      next === "Inactive" &&
      !window.confirm(`Vô hiệu hóa "${partner.name}"? Giao dịch mới sẽ không đi qua đối tác này.`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await partnerApi.setStatus(authToken, partner.id, next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/partners/${partner.id}`}
            className="block truncate text-base font-bold text-gray-800 hover:text-blue-600"
          >
            {partner.name}
          </Link>
          <p className="mt-0.5 text-xs text-gray-500">
            {spec?.label ?? partner.connectorType}
            {partner.merchantCode
              ? ` · ${spec?.merchantCode.label ?? "Mã"} ${partner.merchantCode}`
              : ""}
          </p>
        </div>
        <PartnerStatusBadge status={partner.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
          {partner.connectorType}
        </span>
        <EnvBadge env={partner.environment} />
        {spec && !spec.implemented && (
          <span className="text-xs text-gray-400">Connector chưa hỗ trợ</span>
        )}
      </div>

      <div className="mt-4 min-h-10 border-t border-gray-100 pt-3">
        <TestResultLine result={partner.testResult} testedAt={partner.lastTestedAt} />
        <p className="mt-1 text-xs text-gray-400">Cập nhật {fmtDateTime(partner.updatedAt)}</p>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/partners/${partner.id}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          <Pencil className="h-4 w-4" /> {canWrite ? "Sửa" : "Xem"}
        </Link>
        {canWrite && (
          <>
            <TestConnectionButton
              compact
              partnerId={partner.id}
              authToken={authToken}
              lastResult={partner.testResult}
              lastTestedAt={partner.lastTestedAt}
              disabled={!spec?.implemented}
              onTested={onChange}
            />
            {partner.status === "Inactive" ? (
              <button
                type="button"
                onClick={toggle}
                disabled={busy || !canActivate}
                title={canActivate ? undefined : "Cần test kết nối thành công trước khi kích hoạt"}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                Kích hoạt
              </button>
            ) : (
              <button
                type="button"
                onClick={toggle}
                disabled={busy}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PowerOff className="h-4 w-4" />
                )}
                Vô hiệu
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
