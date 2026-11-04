"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import {
  PING_EVENT,
  WEBHOOK_EVENTS,
  type WebhookLogDetail,
  type WebhookLogView,
} from "@/lib/webhook-events";
import { cn } from "@/lib/utils";
import { fmtTime, webhookApi } from "./webhook-api";

interface WebhookLogTableProps {
  authToken: string;
  canWrite: boolean;
  /** Bump to reload (after a ping/replay elsewhere) */
  refreshKey: number;
  onActivity: () => void;
}

const selectCls =
  "h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none";

/** A failed attempt is only "waiting for retry" while its scheduled retry is still ahead. */
function retryPending(log: WebhookLogView, now: number): boolean {
  return !!log.nextRetryAt && new Date(log.nextRetryAt).getTime() > now;
}

function StatusPill({ log, now }: { log: WebhookLogView; now: number }) {
  const ok = log.status === "Success";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-500")} />
      {ok ? "Thành công" : retryPending(log, now) ? "Lỗi — chờ retry" : "Thất bại"}
    </span>
  );
}

function Pre({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100">
      {text || "—"}
    </pre>
  );
}

function LogDrawer({
  id,
  authToken,
  canWrite,
  onClose,
  onReplayed,
}: {
  id: string;
  authToken: string;
  canWrite: boolean;
  onClose: () => void;
  onReplayed: () => void;
}) {
  const [log, setLog] = useState<WebhookLogDetail | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayMsg, setReplayMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    webhookApi
      .log(authToken, id)
      .then((l) => {
        if (!alive) return;
        setLog(l);
        setLoadedAt(Date.now());
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Lỗi"));
    return () => {
      alive = false;
    };
  }, [authToken, id]);

  async function replay() {
    setReplaying(true);
    setReplayMsg(null);
    try {
      const r = await webhookApi.replay(authToken, id);
      setReplayMsg({
        ok: r.ok,
        text: r.ok
          ? `Gửi lại thành công — HTTP ${r.status}, ${r.durationMs} ms (log #${r.logId})`
          : `Gửi lại thất bại — ${r.error ?? `HTTP ${r.status}`} (log #${r.logId})`,
      });
      onReplayed();
    } catch (e) {
      setReplayMsg({ ok: false, text: e instanceof Error ? e.message : "Lỗi" });
    } finally {
      setReplaying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-gray-900/30"
      role="dialog"
      aria-modal="true"
      aria-label="Chi tiết webhook"
    >
      <button type="button" className="flex-1 cursor-default" aria-label="Đóng" onClick={onClose} />
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <h2 className="font-semibold text-gray-800">Webhook log #{id}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!log && !error && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
          {log && (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Sự kiện</dt>
                <dd className="font-mono">{log.event}</dd>
                <dt className="text-gray-500">Trạng thái</dt>
                <dd>
                  <StatusPill log={log} now={loadedAt} />
                </dd>
                <dt className="text-gray-500">Lần thử</dt>
                <dd>
                  {log.attempt}/{log.maxRetries + 1}
                  {retryPending(log, loadedAt) && (
                    <span className="text-gray-500"> · retry lúc {fmtTime(log.nextRetryAt)}</span>
                  )}
                </dd>
                <dt className="text-gray-500">HTTP · thời gian</dt>
                <dd>
                  {log.responseStatus ?? "—"} · {log.durationMs ?? "—"} ms
                </dd>
                <dt className="text-gray-500">Giao dịch</dt>
                <dd>
                  {log.txnCode ? (
                    <Link
                      href={`/transactions/${log.txnCode}`}
                      className="font-mono text-blue-600 hover:underline"
                    >
                      {log.txnCode}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-gray-500">X-Webhook-Id</dt>
                <dd className="font-mono text-xs break-all">{log.deliveryId ?? "—"}</dd>
                {log.errorMessage && (
                  <>
                    <dt className="text-gray-500">Lỗi</dt>
                    <dd className="text-red-600">{log.errorMessage}</dd>
                  </>
                )}
              </dl>
              {canWrite && log.event !== PING_EVENT && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={replay}
                    disabled={replaying || !log.webhookConfigId}
                    title={log.webhookConfigId ? undefined : "Endpoint đã bị xoá"}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    {replaying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    Gửi lại (replay)
                  </button>
                  {replayMsg && (
                    <span
                      className={cn("text-sm", replayMsg.ok ? "text-emerald-700" : "text-red-600")}
                      aria-live="polite"
                    >
                      {replayMsg.text}
                    </span>
                  )}
                </div>
              )}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  Request — POST {log.requestUrl}
                </h3>
                <Pre value={log.requestHeaders} />
                <Pre value={log.requestBody} />
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">Response</h3>
                {log.responseHeaders && <Pre value={log.responseHeaders} />}
                <Pre value={log.responseBody ?? ""} />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function WebhookLogTable({
  authToken,
  canWrite,
  refreshKey,
  onActivity,
}: WebhookLogTableProps) {
  const [items, setItems] = useState<WebhookLogView[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [event, setEvent] = useState("");
  const [txn, setTxn] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ page: String(page), limit: "20" });
    if (status) q.set("status", status);
    if (event) q.set("event", event);
    if (txn.trim()) q.set("transaction", txn.trim());
    try {
      const res = await webhookApi.logs(authToken, q.toString());
      setItems(res.data);
      setLoadedAt(Date.now());
      if (res.meta) setMeta(res.meta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được lịch sử");
    } finally {
      setLoading(false);
    }
  }, [authToken, page, status, event, txn]);

  useEffect(() => {
    const t = setTimeout(() => void load(), txn ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, refreshKey, txn]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Lọc trạng thái"
          className={selectCls}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="Success">Thành công</option>
          <option value="Failed">Thất bại</option>
        </select>
        <select
          aria-label="Lọc sự kiện"
          className={selectCls}
          value={event}
          onChange={(e) => {
            setEvent(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả sự kiện</option>
          {WEBHOOK_EVENTS.map((e) => (
            <option key={e.code} value={e.code}>
              {e.code}
            </option>
          ))}
          <option value={PING_EVENT}>{PING_EVENT}</option>
        </select>
        <input
          aria-label="Lọc mã giao dịch"
          className={cn(selectCls, "w-56")}
          placeholder="Mã giao dịch (TXN-…)"
          value={txn}
          onChange={(e) => {
            setTxn(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className={cn("w-full min-w-[900px] text-left text-sm", loading && "opacity-60")}>
          <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3">Sự kiện</th>
              <th className="px-4 py-3">Giao dịch</th>
              <th className="px-4 py-3 text-right">HTTP</th>
              <th className="px-4 py-3 text-right">Thời gian gửi</th>
              <th className="px-4 py-3 text-center">Lần thử</th>
              <th className="px-4 py-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  Chưa có lần gửi nào
                </td>
              </tr>
            ) : (
              items.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-blue-50/40"
                  onClick={() => setOpenId(l.id)}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                    {fmtTime(l.createdAt)}
                  </td>
                  <td
                    className="max-w-[220px] truncate px-4 py-2.5 font-mono text-xs text-gray-700"
                    title={l.requestUrl ?? ""}
                  >
                    {l.requestUrl}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.event}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                    {l.txnCode ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{l.responseStatus ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {l.durationMs != null ? `${l.durationMs} ms` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums">
                    {l.attempt}/{l.maxRetries + 1}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      className="text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenId(l.id);
                      }}
                    >
                      <StatusPill log={l} now={loadedAt} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {meta.total.toLocaleString("vi-VN")} lần gửi · trang {meta.page}/{meta.totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="h-9 rounded-lg border border-gray-300 px-3 disabled:opacity-40"
          >
            Trước
          </button>
          <button
            type="button"
            disabled={page >= meta.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="h-9 rounded-lg border border-gray-300 px-3 disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      </div>

      {openId && (
        <LogDrawer
          id={openId}
          authToken={authToken}
          canWrite={canWrite}
          onClose={() => setOpenId(null)}
          onReplayed={() => {
            void load();
            onActivity();
          }}
        />
      )}
    </div>
  );
}
