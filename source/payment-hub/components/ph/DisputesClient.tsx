"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Paperclip, Search } from "lucide-react";
import { DISPUTE_CHANNEL_LABELS, type DisputeStatus, type DisputeView } from "@/lib/dispute";
import { cn } from "@/lib/utils";
import { DisputeStatusBadge, fmtDateTime } from "./DisputeHistory";
import { disputeApi, type DisputeListMeta } from "./dispute-api";

/**
 * Dispute list (P5.6, SRS-PH-RECON-02-05 "theo dõi trạng thái"): status tabs with counts, search by
 * dispute / transaction / partner code, creation date range, partner; each row opens the dispute.
 */

const TABS: { value: "" | "open" | DisputeStatus; label: string }[] = [
  { value: "open", label: "Đang xử lý" },
  { value: "Pending", label: "Chưa gửi đối tác" },
  { value: "Processing", label: "Chờ đối tác" },
  { value: "Resolved", label: "Đã giải quyết" },
  { value: "Rejected", label: "Từ chối" },
  { value: "", label: "Tất cả" },
];

const PARTNERS = ["VNPay", "MoMo", "ZaloPay", "VietQR"];
const LIMIT = 20;
const inputCls =
  "h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none";

function count(counts: Record<string, number>, tab: string): number {
  if (tab === "open") return (counts.Pending ?? 0) + (counts.Processing ?? 0);
  if (tab === "") return Object.values(counts).reduce((a, b) => a + b, 0);
  return counts[tab] ?? 0;
}

interface Props {
  authToken: string;
  initialItems: DisputeView[];
  initialMeta: DisputeListMeta;
  initialStatus: string;
}

export function DisputesClient({ authToken, initialItems, initialMeta, initialStatus }: Props) {
  const [items, setItems] = useState(initialItems);
  const [meta, setMeta] = useState(initialMeta);
  const [status, setStatus] = useState(initialStatus);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [partner, setPartner] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (search.trim()) q.set("search", search.trim());
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (partner) q.set("partner", partner);
    q.set("page", String(page));
    q.set("limit", String(LIMIT));
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      disputeApi
        .list(authToken, q.toString())
        .then((r) => {
          if (cancelled) return;
          setItems(r.items);
          setMeta(r.meta);
        })
        .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Lỗi tải"))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [authToken, status, search, from, to, partner, page]);

  const pages = Math.max(1, Math.ceil(meta.total / LIMIT));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Tra soát giao dịch</h1>
        <p className="text-sm text-gray-500">
          Yêu cầu tra soát gửi đối tác — tạo từ nút &quot;Tra soát&quot; trong chi tiết giao dịch
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value || "all"}
            type="button"
            role="tab"
            aria-selected={status === t.value}
            onClick={() => {
              setStatus(t.value);
              setPage(1);
            }}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium",
              status === t.value
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                status === t.value ? "bg-white/20" : "bg-gray-100 text-gray-500",
              )}
            >
              {count(meta.counts, t.value)}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={cn(inputCls, "w-full pl-9")}
            placeholder="Mã tra soát, mã GD, mã GD đối tác, mã phiếu đối tác…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Tìm kiếm"
          />
        </div>
        <input
          type="date"
          className={inputCls}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          aria-label="Từ ngày"
        />
        <input
          type="date"
          className={inputCls}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          aria-label="Đến ngày"
        />
        <select
          className={inputCls}
          value={partner}
          onChange={(e) => {
            setPartner(e.target.value);
            setPage(1);
          }}
          aria-label="Đối tác"
        >
          <option value="">Tất cả đối tác</option>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Mã tra soát</th>
              <th className="px-4 py-3">Giao dịch</th>
              <th className="px-4 py-3">Đối tác / Merchant</th>
              <th className="px-4 py-3">Lý do</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Gửi đối tác</th>
              <th className="px-4 py-3">Tạo lúc</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  Không có yêu cầu tra soát
                </td>
              </tr>
            ) : (
              items.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/disputes/${d.id}`}
                      className="font-mono font-semibold whitespace-nowrap text-blue-600 hover:underline"
                    >
                      {d.disputeCode}
                    </Link>
                    {d.attachmentCount > 0 && (
                      <span className="ml-1 inline-flex items-center text-xs text-gray-400">
                        <Paperclip className="h-3 w-3" />
                        {d.attachmentCount}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/transactions/${d.transactionId}`}
                      className="font-mono whitespace-nowrap text-gray-700 hover:text-blue-600 hover:underline"
                    >
                      {d.txnCode}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {d.amount.toLocaleString("vi-VN")} ₫ · {d.txnStatus}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700">{d.partner?.name ?? "—"}</div>
                    <div className="text-xs text-gray-500">{d.merchant?.code ?? "—"}</div>
                  </td>
                  <td className="max-w-72 px-4 py-3">
                    <p className="line-clamp-2 text-gray-700">{d.reason}</p>
                  </td>
                  <td className="px-4 py-3">
                    <DisputeStatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {d.submitChannel ? DISPUTE_CHANNEL_LABELS[d.submitChannel] : "—"}
                    {d.partnerRef && (
                      <div className="font-mono text-xs text-gray-500">{d.partnerRef}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {fmtDateTime(d.createdAt)}
                    <div className="text-xs text-gray-400">{d.createdBy ?? "—"}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {meta.total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            {meta.total} yêu cầu · trang {page}/{pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="h-9 rounded-lg border border-gray-300 px-3 disabled:opacity-40"
            >
              Trước
            </button>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              className="h-9 rounded-lg border border-gray-300 px-3 disabled:opacity-40"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
