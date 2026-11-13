"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type DetailView, type PageMeta, type RunView, reconApi } from "./recon-api";
import { RunStatusBadge, fmtDay, fmtTime, vnd } from "./ReconciliationTable";

/** One reconciliation run (P5.4, mockup "Đối soát"): summary cards, discrepancy list, resolve, export. */

const MATCH: Record<string, { label: string; cls: string }> = {
  Matched: { label: "Khớp", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Unmatched_PaymentHub: { label: "Đối tác thiếu", cls: "bg-red-100 text-red-700 border-red-200" },
  Unmatched_Partner: { label: "PH thiếu", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  Amount_Mismatch: {
    label: "Lệch số tiền",
    cls: "bg-purple-100 text-purple-700 border-purple-200",
  },
  Unverified: { label: "Chưa tra cứu", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

const FILTERS: { value: string; label: string }[] = [
  { value: "discrepancy", label: "Tất cả GD lệch" },
  { value: "Unmatched_PaymentHub", label: "Đối tác thiếu (chỉ có ở PH)" },
  { value: "Unmatched_Partner", label: "PH thiếu (chỉ có ở đối tác)" },
  { value: "Amount_Mismatch", label: "Lệch số tiền" },
  { value: "Unverified", label: "Chưa tra cứu được" },
  { value: "Matched", label: "Khớp" },
  { value: "all", label: "Tất cả" },
];

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

interface Props {
  run: RunView;
  authToken: string;
  canWrite: boolean;
  onChanged: () => void;
}

export function ReconciliationDetail({ run, authToken, canWrite, onChanged }: Props) {
  const [match, setMatch] = useState("discrepancy");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<DetailView | null>(null);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const key = `${run.id}|${match}|${status}|${search.trim()}|${page}|${tick}`;
  const [result, setResult] = useState<{
    key: string;
    rows: DetailView[];
    meta: PageMeta | null;
  } | null>(null);
  const loading = run.status === "Completed" && result?.key !== key;
  const rows = result?.rows ?? [];
  const meta = result?.meta ?? null;

  useEffect(() => {
    if (run.status !== "Completed") return;
    let alive = true;
    const q = new URLSearchParams({ match, page: String(page), limit: "20" });
    if (status) q.set("status", status);
    if (search.trim()) q.set("search", search.trim());
    reconApi
      .details(authToken, run.id, q)
      .then((res) => {
        if (!alive) return;
        setResult({ key, rows: res.data, meta: res.meta ?? null });
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setResult({ key, rows: [], meta: null });
        setError(e instanceof Error ? e.message : "Không tải được chi tiết");
      });
    return () => {
      alive = false;
    };
  }, [authToken, run.id, run.status, match, status, search, page, key]);

  async function exportAs(format: "xlsx" | "pdf") {
    setExporting(format);
    setError(null);
    try {
      await reconApi.download(authToken, run.id, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xuất được báo cáo");
    } finally {
      setExporting(null);
    }
  }

  const lech = run.unmatched_paymenthub + run.unmatched_partner + run.amount_mismatch_count;

  return (
    <section className="space-y-4" aria-label={`Đối soát ${run.partner_name} ${run.run_date}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            {run.partner_name} — {fmtDay(run.run_date)}{" "}
            <span className="text-sm font-normal text-gray-400">#{run.id}</span>
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <RunStatusBadge status={run.status} />
            {run.source === "File"
              ? `File sao kê ${run.source_file ?? ""}`
              : "Tra cứu API từng giao dịch"}
            {" · "}bởi {run.triggered_by ?? "—"} · hoàn tất {fmtTime(run.completed_at)}
          </p>
        </div>
        {run.status === "Completed" && (
          <div className="flex gap-2">
            {(["xlsx", "pdf"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => void exportAs(f)}
                disabled={!!exporting}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {exporting === f ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {f === "xlsx" ? "Excel" : "PDF"}
              </button>
            ))}
          </div>
        )}
      </div>

      {run.status === "Failed" && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Đối soát lỗi: {run.error_message}
        </p>
      )}
      {run.status === "Running" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Đang tra cứu đối tác… trang tự cập nhật khi xong.
        </p>
      )}

      {run.status === "Completed" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card
              label="Tổng GD khớp"
              value={run.matched_count.toLocaleString("vi-VN")}
              sub={`PH ${run.total_paymenthub} GD · ĐT ${run.total_partner} GD`}
              tone="text-emerald-600"
            />
            <Card
              label="Đối tác thiếu (chỉ có ở PH)"
              value={String(run.unmatched_paymenthub)}
              sub={
                run.amount_mismatch_count
                  ? `+ ${run.amount_mismatch_count} lệch số tiền`
                  : "Cần xử lý"
              }
              tone={run.unmatched_paymenthub ? "text-red-600" : "text-gray-800"}
            />
            <Card
              label="PH thiếu (chỉ có ở đối tác)"
              value={String(run.unmatched_partner)}
              sub={
                run.unverified_count ? `${run.unverified_count} GD chưa tra cứu được` : "Cần xử lý"
              }
              tone={run.unmatched_partner ? "text-orange-600" : "text-gray-800"}
            />
            <Card
              label="Tổng chênh lệch"
              value={vnd(run.total_discrepancy)}
              sub={lech ? `${run.open_discrepancies}/${lech} chưa xử lý` : "Không có chênh lệch"}
              tone={run.total_discrepancy ? "text-red-600" : "text-gray-800"}
            />
          </div>
          <p className="text-xs text-gray-500">
            Tổng tiền: Payment Hub {vnd(run.total_amount_paymenthub)} · Đối tác{" "}
            {vnd(run.total_amount_partner)}
            {run.notes ? ` · ${run.notes}` : ""}
          </p>

          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-end gap-2 border-b border-gray-100 p-3">
              <label className="text-xs text-gray-500">
                Kiểu
                <select
                  className="mt-1 block h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-800"
                  value={match}
                  onChange={(e) => {
                    setMatch(e.target.value);
                    setPage(1);
                  }}
                >
                  {FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Xử lý
                <select
                  className="mt-1 block h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-800"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Tất cả</option>
                  <option value="Open">Chưa xử lý</option>
                  <option value="Resolved">Đã xử lý</option>
                </select>
              </label>
              <label className="min-w-0 flex-1 text-xs text-gray-500">
                Tìm mã GD
                <input
                  className="mt-1 block h-10 w-full min-w-40 rounded-lg border border-gray-300 px-3 text-sm text-gray-800"
                  placeholder="TXN-… / mã đối tác"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </div>

            {error && (
              <p className="m-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                    <th className="px-3 py-2 font-medium">Mã GD Payment Hub</th>
                    <th className="px-3 py-2 font-medium">Mã GD đối tác</th>
                    <th className="px-3 py-2 font-medium">Kiểu lệch</th>
                    <th className="px-3 py-2 text-right font-medium">Số tiền (PH)</th>
                    <th className="px-3 py-2 text-right font-medium">Số tiền (ĐT)</th>
                    <th className="px-3 py-2 text-right font-medium">Chênh lệch</th>
                    <th className="px-3 py-2 font-medium">Ghi chú</th>
                    <th className="px-3 py-2 font-medium">Xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-gray-400">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">
                        {match === "discrepancy"
                          ? "Không có giao dịch lệch 🎉"
                          : "Không có dòng nào"}
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    rows.map((d) => (
                      <tr key={d.id} className="border-b border-gray-100 align-top last:border-0">
                        <td className="px-3 py-2.5 font-mono text-xs">
                          {d.txn_code && d.transaction_id ? (
                            <Link
                              href={`/transactions/${encodeURIComponent(d.txn_code)}`}
                              className="text-blue-600 hover:underline"
                            >
                              {d.txn_code}
                            </Link>
                          ) : (
                            (d.txn_code ?? "—")
                          )}
                          {d.paymenthub_status && (
                            <div className="font-sans text-gray-400">{d.paymenthub_status}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-gray-700">
                          {d.partner_txn_id ?? "—"}
                          {d.partner_ref && d.partner_ref !== d.txn_code && (
                            <div
                              className="max-w-[180px] truncate font-sans text-gray-400"
                              title={d.partner_ref}
                            >
                              {d.partner_ref}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                              MATCH[d.match_status]?.cls,
                            )}
                          >
                            {MATCH[d.match_status]?.label ?? d.match_status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {vnd(d.paymenthub_amount)}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {vnd(d.partner_amount)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                          {d.match_status === "Matched" || d.match_status === "Unverified"
                            ? "—"
                            : vnd(d.discrepancy_amount)}
                        </td>
                        <td className="max-w-[260px] px-3 py-2.5 text-xs text-gray-600">
                          {d.note ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {d.match_status === "Matched" || d.match_status === "Unverified" ? (
                            "—"
                          ) : d.status === "Resolved" ? (
                            <div>
                              <span className="font-medium text-emerald-700">Đã xử lý</span>
                              <div className="max-w-[200px] text-gray-500">{d.resolution}</div>
                              <div className="text-gray-400">{d.resolved_by}</div>
                              {canWrite && (
                                <button
                                  type="button"
                                  className="mt-1 text-blue-600 hover:underline"
                                  onClick={() => setResolving(d)}
                                >
                                  Sửa
                                </button>
                              )}
                            </div>
                          ) : canWrite ? (
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => setResolving(d)}
                                className="min-h-9 rounded-md border border-amber-300 bg-amber-50 px-2.5 text-amber-800 hover:bg-amber-100"
                              >
                                Xử lý
                              </button>
                              {d.transaction_id && (
                                // P5.6: open the dispute form on the transaction, reason prefilled
                                <Link
                                  href={`/transactions/${d.transaction_id}?dispute=${encodeURIComponent(
                                    `Lệch đối soát ${run.partner_name} ngày ${fmtDay(run.run_date)}: ${MATCH[d.match_status]?.label ?? d.match_status}`,
                                  )}`}
                                  className="text-orange-700 hover:underline"
                                >
                                  Tra soát
                                </Link>
                              )}
                            </div>
                          ) : (
                            <span className="text-amber-700">Chưa xử lý</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                <span>
                  {meta.total.toLocaleString("vi-VN")} dòng · trang {meta.page}/{meta.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="h-9 rounded-md border border-gray-300 px-3 disabled:opacity-40"
                  >
                    Trước
                  </button>
                  <button
                    type="button"
                    disabled={page >= meta.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-9 rounded-md border border-gray-300 px-3 disabled:opacity-40"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {resolving && (
        <ResolveDialog
          detail={resolving}
          runId={run.id}
          authToken={authToken}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null);
            setTick((t) => t + 1);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function ResolveDialog({
  detail,
  runId,
  authToken,
  onClose,
  onDone,
}: {
  detail: DetailView;
  runId: number;
  authToken: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [resolution, setResolution] = useState(detail.resolution ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(status: "Open" | "Resolved") {
    if (status === "Resolved" && resolution.trim().length < 3) {
      setError("Ghi cách xử lý (tối thiểu 3 ký tự)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reconApi.resolve(authToken, runId, detail.id, {
        status,
        resolution: resolution.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recon-resolve-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="recon-resolve-title" className="text-base font-semibold text-gray-800">
            Xử lý giao dịch lệch
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs">
            <dt className="text-gray-500">Mã GD PH</dt>
            <dd className="font-mono">{detail.txn_code ?? "—"}</dd>
            <dt className="text-gray-500">Mã GD đối tác</dt>
            <dd className="font-mono">{detail.partner_txn_id ?? detail.partner_ref ?? "—"}</dd>
            <dt className="text-gray-500">Kiểu lệch</dt>
            <dd>{MATCH[detail.match_status]?.label}</dd>
            <dt className="text-gray-500">Chênh lệch</dt>
            <dd className="font-semibold">{vnd(detail.discrepancy_amount)}</dd>
            <dt className="text-gray-500">Ghi chú</dt>
            <dd>{detail.note ?? "—"}</dd>
          </dl>
          <div>
            <label htmlFor="recon-resolution" className="mb-1 block font-medium text-gray-700">
              Cách xử lý <span className="text-red-500">*</span>
            </label>
            <textarea
              id="recon-resolution"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="VD: Đối tác ghi nhận trễ, đã khớp sao kê ngày 13/06 / đã hoàn tiền REF-…"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          {detail.status === "Resolved" && (
            <button
              type="button"
              onClick={() => void save("Open")}
              disabled={busy}
              className="h-11 rounded-lg border border-gray-300 px-4 text-sm hover:bg-gray-50"
            >
              Mở lại
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-lg border border-gray-300 px-4 text-sm hover:bg-gray-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void save("Resolved")}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Đánh dấu đã xử lý
          </button>
        </div>
      </div>
    </div>
  );
}
