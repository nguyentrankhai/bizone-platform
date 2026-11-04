"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { WebhookConfigView, WebhookStats } from "@/lib/webhook-events";
import { cn } from "@/lib/utils";
import { WebhookForm, type MerchantOption } from "./WebhookForm";
import { WebhookLogTable } from "./WebhookLogTable";
import { WebhookTable } from "./WebhookTable";
import { webhookApi } from "./webhook-api";

interface WebhooksClientProps {
  initialConfigs: WebhookConfigView[];
  initialStats: WebhookStats;
  merchants: MerchantOption[];
  authToken: string;
  canWrite: boolean;
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "bad" | "warn";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "ok"
            ? "text-emerald-600"
            : tone === "bad"
              ? "text-red-600"
              : tone === "warn"
                ? "text-amber-600"
                : "text-gray-800",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export function WebhooksClient({
  initialConfigs,
  initialStats,
  merchants,
  authToken,
  canWrite,
}: WebhooksClientProps) {
  const [tab, setTab] = useState<"endpoints" | "history">("endpoints");
  const [configs, setConfigs] = useState(initialConfigs);
  const [stats, setStats] = useState(initialStats);
  const [hours, setHours] = useState(24);
  const [editing, setEditing] = useState<WebhookConfigView | null | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([
        webhookApi.list(authToken),
        webhookApi.stats(authToken, hours),
      ]);
      setConfigs(c);
      setStats(s);
    } catch {
      // keep current numbers (token expired etc. surfaces on actions)
    }
    setRefreshKey((k) => k + 1);
  }, [authToken, hours]);

  useEffect(() => {
    if (hours === 24 && refreshKey === 0) return; // initial data is already 24 h
    void webhookApi
      .stats(authToken, hours)
      .then(setStats)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours]);

  const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("vi-VN")}%`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Webhook</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Gửi kết quả thanh toán tới merchant — ký HMAC-SHA256, retry tối đa theo cấu hình
          </p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Khoảng thời gian thống kê"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm"
          >
            <option value={1}>1 giờ qua</option>
            <option value={24}>24 giờ qua</option>
            <option value={168}>7 ngày qua</option>
          </select>
          {canWrite && (
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Thêm endpoint
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Số lần gửi"
          value={stats.attempts.toLocaleString("vi-VN")}
          sub={`${stats.periodHours} giờ`}
        />
        <Stat
          label="Thành công"
          value={stats.success.toLocaleString("vi-VN")}
          sub={`Tỉ lệ ${fmtPct(stats.successRate)}`}
          tone="ok"
        />
        <Stat
          label="Thất bại"
          value={stats.failed.toLocaleString("vi-VN")}
          tone={stats.failed ? "bad" : undefined}
        />
        <Stat
          label="Thời gian phản hồi"
          value={stats.avgDurationMs === null ? "—" : `${stats.avgDurationMs} ms`}
          sub={stats.maxDurationMs === null ? undefined : `Chậm nhất ${stats.maxDurationMs} ms`}
        />
        <Stat
          label="Đang chờ gửi / retry"
          value={(stats.pendingRetries + stats.pendingOutbox).toLocaleString("vi-VN")}
          sub={`${stats.pendingRetries} trong hàng đợi · ${stats.pendingOutbox} chưa đưa vào`}
          tone={stats.pendingRetries + stats.pendingOutbox ? "warn" : undefined}
        />
      </div>

      <div role="tablist" className="flex gap-1 border-b border-gray-200">
        {(
          [
            ["endpoints", `Endpoint (${configs.length})`],
            ["history", "Lịch sử gửi"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px h-10 border-b-2 px-4 text-sm font-medium",
              tab === key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "endpoints" ? (
        <WebhookTable
          configs={configs}
          authToken={authToken}
          canWrite={canWrite}
          onEdit={(c) => setEditing(c)}
          onChange={(c) => setConfigs((list) => list.map((x) => (x.id === c.id ? c : x)))}
          onDeleted={(id) => setConfigs((list) => list.filter((x) => x.id !== id))}
          onActivity={() => void refresh()}
        />
      ) : (
        <WebhookLogTable
          authToken={authToken}
          canWrite={canWrite}
          refreshKey={refreshKey}
          onActivity={() => void refresh()}
        />
      )}

      {editing !== undefined && (
        <WebhookForm
          authToken={authToken}
          merchants={merchants}
          config={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(c) => {
            setConfigs((list) =>
              list.some((x) => x.id === c.id)
                ? list.map((x) => (x.id === c.id ? c : x))
                : [...list, c],
            );
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}
