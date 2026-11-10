"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { apiContext, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, btnSecondary, inputAutoCls, useLoad } from "@/components/staff/shared";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL, NotificationHeader, STATUS_BADGE, eventLabel } from "./shared";

/** Email / SMS / push sent in the last 30 days (events, tests, report emails, campaigns) */
export function DeliveryLog({ auth, campaignId }: { auth: ApiAuth; campaignId?: number }) {
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const input = {
    page,
    limit: 30,
    ...(channel ? { channel: channel as "email" | "sms" | "push" } : {}),
    ...(status ? { status: status as "sent" | "failed" | "pending" | "skipped" } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(campaignId ? { campaignId } : {}),
  };
  const list = useLoad(JSON.stringify(input), () =>
    trpc.notification.deliveries.query(input, apiContext(auth)),
  );
  const data = list.data;

  return (
    <div className="space-y-5">
      {!campaignId && (
        <NotificationHeader subtitle="Email, SMS và thông báo đẩy đã gửi trong 30 ngày — nội dung thực tế, trạng thái, lỗi" />
      )}
      <div className="flex flex-wrap gap-2">
        <select
          className={inputAutoCls}
          value={channel}
          aria-label="Kênh"
          onChange={(e) => {
            setChannel(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi kênh</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="push">Web Push</option>
        </select>
        <select
          className={inputAutoCls}
          value={status}
          aria-label="Trạng thái"
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Mọi trạng thái</option>
          <option value="sent">Đã gửi</option>
          <option value="failed">Lỗi</option>
          <option value="pending">Đang gửi</option>
        </select>
        <input
          className={inputAutoCls}
          placeholder="Tìm người nhận / tiêu đề"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <ErrorBox message={list.error} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Kênh</th>
              <th className="px-4 py-3">Người nhận</th>
              <th className="px-4 py-3">Tiêu đề / nội dung</th>
              <th className="px-4 py-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Chưa có tin nào
                </td>
              </tr>
            )}
            {data?.items.map((d) => {
              const badge = STATUS_BADGE[d.status] ?? STATUS_BADGE.pending;
              return (
                <tr
                  key={d.id}
                  className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50"
                  onClick={() => setOpen(open === d.id ? null : d.id)}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                    {new Date(d.createdAt).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{eventLabel(d.eventType)}</td>
                  <td className="px-4 py-2.5">{CHANNEL_LABEL[d.channel] ?? d.channel}</td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-slate-700">
                    {d.recipient}
                  </td>
                  <td className="max-w-[320px] px-4 py-2.5 text-slate-600">
                    {d.subject && (
                      <p className="truncate font-medium text-slate-700">{d.subject}</p>
                    )}
                    <p className={cn("whitespace-pre-line", open === d.id ? "" : "line-clamp-1")}>
                      {d.content}
                    </p>
                    {d.error && <p className="mt-1 text-xs text-red-600">{d.error}</p>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("rounded px-2 py-0.5 text-xs", badge.className)}>
                      {badge.label}
                    </span>
                    {d.provider && <p className="mt-1 text-xs text-slate-400">{d.provider}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-slate-500">
            Trang {data.meta.page}/{data.meta.totalPages} · {data.meta.total} tin
          </span>
          <button className={btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <button
            className={btnSecondary}
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
}
