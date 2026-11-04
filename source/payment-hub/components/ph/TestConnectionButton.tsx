"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import type { PartnerView, TestResult } from "@/lib/partner-types";
import { cn } from "@/lib/utils";
import { fmtDateTime, partnerApi } from "./partner-api";

interface TestConnectionButtonProps {
  partnerId: number;
  authToken: string;
  lastResult: TestResult | null;
  lastTestedAt: string | null;
  disabled?: boolean;
  disabledReason?: string;
  compact?: boolean;
  onTested: (partner: PartnerView) => void;
}

export function TestResultLine({
  result,
  testedAt,
}: {
  result: TestResult | null;
  testedAt: string | null;
}) {
  if (!result) return <span className="text-xs text-gray-400">Chưa test kết nối</span>;
  return (
    <span
      className={cn(
        "inline-flex items-start gap-1.5 text-xs",
        result.success ? "text-emerald-700" : "text-red-600",
      )}
    >
      {result.success ? (
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
      ) : (
        <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
      )}
      <span>
        {fmtDateTime(testedAt)} — {result.success ? "OK" : "Lỗi"} ({result.response_time_ms} ms):{" "}
        {result.message}
      </span>
    </span>
  );
}

export function TestConnectionButton({
  partnerId,
  authToken,
  lastResult,
  lastTestedAt,
  disabled,
  disabledReason,
  compact,
  onTested,
}: TestConnectionButtonProps) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await partnerApi.test(authToken, partnerId);
      onTested(res.partner);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test thất bại");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className={cn(
        "flex gap-3",
        compact ? "items-center" : "flex-col sm:flex-row sm:items-center",
      )}
    >
      <button
        type="button"
        onClick={run}
        disabled={running || disabled}
        title={disabled ? disabledReason : undefined}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
        {running ? "Đang test…" : "Test kết nối"}
      </button>
      {!compact && (
        <div className="min-w-0" aria-live="polite">
          {error ? (
            <span className="text-xs text-red-600">{error}</span>
          ) : disabled && disabledReason ? (
            <span className="text-xs text-gray-500">{disabledReason}</span>
          ) : (
            <TestResultLine result={lastResult} testedAt={lastTestedAt} />
          )}
        </div>
      )}
      {compact && error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
