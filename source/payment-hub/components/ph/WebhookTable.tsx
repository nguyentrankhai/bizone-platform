"use client";

import { useState } from "react";
import { Loader2, Pencil, Power, PowerOff, Radio, Trash2 } from "lucide-react";
import type { WebhookConfigView } from "@/lib/webhook-events";
import { cn } from "@/lib/utils";
import { webhookApi, type ManualSendResult } from "./webhook-api";

interface WebhookTableProps {
  configs: WebhookConfigView[];
  authToken: string;
  canWrite: boolean;
  onEdit: (c: WebhookConfigView) => void;
  onChange: (c: WebhookConfigView) => void;
  onDeleted: (id: number) => void;
  onActivity: () => void;
}

function ActiveBadge({ status }: { status: WebhookConfigView["status"] }) {
  const on = status === "Active";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        on
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-gray-200 bg-gray-100 text-gray-600",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-emerald-500" : "bg-gray-400")} />
      {on ? "Hoạt động" : "Ngưng"}
    </span>
  );
}

export function WebhookTable({
  configs,
  authToken,
  canWrite,
  onEdit,
  onChange,
  onDeleted,
  onActivity,
}: WebhookTableProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pings, setPings] = useState<Record<number, ManualSendResult | string>>({});

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Thao tác thất bại");
    } finally {
      setBusy(null);
    }
  }

  if (configs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        Chưa có webhook endpoint nào. Thêm endpoint để merchant nhận kết quả thanh toán.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-3">Endpoint</th>
            <th className="px-4 py-3">Sự kiện</th>
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3 text-right">Lần gửi</th>
            <th className="px-4 py-3 text-right">Thành công</th>
            <th className="px-4 py-3 text-right">Thất bại</th>
            <th className="px-4 py-3 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {configs.map((c) => {
            const ping = pings[c.id];
            return (
              <tr key={c.id} className="border-b border-gray-100 align-top last:border-0">
                <td className="max-w-xs px-4 py-3">
                  <div className="font-mono text-xs break-all text-gray-800">{c.url}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {c.merchantCode} · retry {c.retryCount} · timeout {c.timeoutMs / 1000}s
                  </div>
                  {ping && (
                    <div
                      className={cn(
                        "mt-1 text-xs",
                        typeof ping !== "string" && ping.ok ? "text-emerald-700" : "text-red-600",
                      )}
                      aria-live="polite"
                    >
                      {typeof ping === "string"
                        ? ping
                        : ping.ok
                          ? `Ping OK — HTTP ${ping.status}, ${ping.durationMs} ms`
                          : `Ping lỗi — ${ping.error ?? `HTTP ${ping.status}`}`}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.events.map((e) => (
                      <span
                        key={e}
                        className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-xs text-indigo-700"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ActiveBadge status={c.status} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.stats.total.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-3 text-right text-emerald-700 tabular-nums">
                  {c.stats.success.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-3 text-right text-red-600 tabular-nums">
                  {c.stats.failed.toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-3">
                  {canWrite ? (
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Gửi ping test"
                        aria-label="Gửi ping test"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`ping${c.id}`, async () => {
                            try {
                              const r = await webhookApi.ping(authToken, c.id);
                              setPings((p) => ({ ...p, [c.id]: r }));
                            } catch (e) {
                              setPings((p) => ({
                                ...p,
                                [c.id]: e instanceof Error ? e.message : "Lỗi",
                              }));
                            }
                            onActivity();
                          })
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                      >
                        {busy === `ping${c.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Radio className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Sửa"
                        aria-label="Sửa"
                        onClick={() => onEdit(c)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title={c.status === "Active" ? "Vô hiệu" : "Kích hoạt"}
                        aria-label={c.status === "Active" ? "Vô hiệu" : "Kích hoạt"}
                        disabled={busy !== null}
                        onClick={() =>
                          run(`st${c.id}`, async () =>
                            onChange(
                              await webhookApi.setStatus(
                                authToken,
                                c.id,
                                c.status === "Active" ? "Inactive" : "Active",
                              ),
                            ),
                          )
                        }
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-40",
                          c.status === "Active" ? "text-amber-600" : "text-emerald-600",
                        )}
                      >
                        {c.status === "Active" ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Xoá"
                        aria-label="Xoá"
                        disabled={busy !== null}
                        onClick={() => {
                          if (!window.confirm(`Xoá endpoint ${c.url}? Lịch sử gửi vẫn được giữ.`))
                            return;
                          void run(`del${c.id}`, async () => {
                            await webhookApi.remove(authToken, c.id);
                            onDeleted(c.id);
                          });
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="block text-right text-xs text-gray-400">Chỉ xem</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
