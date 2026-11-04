"use client";

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import type { ApiAuth } from "@/components/inventory/shared";
import { apiContext, fmtDate, errorMessage } from "@/components/inventory/shared";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

type AuditListOutput = inferRouterOutputs<AppRouter>["auditLog"]["list"];
type AuditRow = AuditListOutput["items"][number];

const MODULES = [
  { value: "", label: "Tất cả module" },
  { value: "pos", label: "POS" },
  { value: "product", label: "Sản phẩm" },
  { value: "inventory", label: "Kho" },
  { value: "order", label: "Đơn hàng" },
  { value: "crm", label: "CRM" },
];

const ACTIONS = [
  { value: "", label: "Tất cả hành động" },
  { value: "create", label: "Tạo mới" },
  { value: "update", label: "Cập nhật" },
  { value: "delete", label: "Xoá" },
  { value: "void", label: "Huỷ hóa đơn" },
  { value: "confirm_transaction", label: "Xác nhận phiếu" },
  { value: "cancel_transaction", label: "Huỷ phiếu" },
  { value: "complete_stock_take", label: "Hoàn thành kiểm kê" },
  { value: "confirm_transfer", label: "Xác nhận chuyển kho" },
  { value: "update_status", label: "Đổi trạng thái" },
  { value: "refund", label: "Hoàn tiền" },
];

function actionBadge(action: string) {
  const map: Record<string, string> = {
    create: "bg-emerald-50 text-emerald-700",
    update: "bg-blue-50 text-blue-700",
    delete: "bg-red-50 text-red-600",
    void: "bg-orange-50 text-orange-700",
    cancel: "bg-orange-50 text-orange-700",
    cancel_transaction: "bg-orange-50 text-orange-700",
    refund: "bg-purple-50 text-purple-700",
  };
  const cls = map[action] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{action}</span>
  );
}

interface DetailModalProps {
  log: AuditRow;
  onClose: () => void;
}

function DetailModal({ log, onClose }: DetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="font-semibold text-slate-800">Chi tiết Audit Log #{log.id}</h3>
          <button onClick={onClose} className="text-lg text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="space-y-4 p-6 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Thời gian" value={fmtDate(log.createdAt, true)} />
            <Field
              label="Người dùng"
              value={log.user ? (log.user.fullName ?? log.user.username) : "—"}
            />
            <Field label="Module" value={log.module} />
            <Field label="Hành động" value={actionBadge(log.action)} />
            <Field label="Đối tượng" value={log.entityType} />
            <Field label="ID đối tượng" value={log.entityId?.toString() ?? "—"} />
            <Field label="IP" value={log.ipAddress ?? "—"} />
            <Field label="Ghi chú" value={log.notes ?? "—"} />
          </div>
          {log.userAgent && (
            <div>
              <p className="mb-1 font-medium text-slate-600">User Agent</p>
              <p className="rounded bg-slate-50 p-2 text-xs break-all text-slate-500">
                {log.userAgent}
              </p>
            </div>
          )}
          {log.oldValue !== null && (
            <div>
              <p className="mb-1 font-medium text-slate-600">Dữ liệu cũ</p>
              <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
                {JSON.stringify(log.oldValue, null, 2)}
              </pre>
            </div>
          )}
          {log.newValue !== null && (
            <div>
              <p className="mb-1 font-medium text-slate-600">Dữ liệu mới</p>
              <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
                {JSON.stringify(log.newValue, null, 2)}
              </pre>
            </div>
          )}
        </div>
        <div className="border-t px-6 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-800">{value}</p>
    </div>
  );
}

interface AuditTableProps {
  auth: ApiAuth;
}

export function AuditTable({ auth }: AuditTableProps) {
  const [page, setPage] = useState(1);
  const [filterModule, setFilterModule] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [data, setData] = useState<AuditListOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const ctx = apiContext(auth);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    try {
      const result = await trpc.auditLog.list.query(
        {
          page,
          limit: 20,
          module: filterModule || undefined,
          action: filterAction || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
        ctx,
      );
      setData(result);
    } catch (e) {
      setFetchError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, filterModule, filterAction, dateFrom, dateTo, auth.authToken, auth.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError("");
    try {
      const res = await trpc.auditLog.export.mutate(
        {
          module: filterModule || undefined,
          action: filterAction || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
        ctx,
      );
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }, [filterModule, filterAction, dateFrom, dateTo, auth.authToken, auth.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetFilters = () => {
    setFilterModule("");
    setFilterAction("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Module</label>
          <select
            value={filterModule}
            onChange={(e) => {
              setFilterModule(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded border px-3 text-sm text-slate-700"
          >
            {MODULES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Hành động</label>
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded border px-3 text-sm text-slate-700"
          >
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Từ ngày</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded border px-3 text-sm text-slate-700"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Đến ngày</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded border px-3 text-sm text-slate-700"
          />
        </div>
        <button
          onClick={resetFilters}
          className="h-9 rounded border px-4 text-sm text-slate-600 hover:bg-slate-50"
        >
          Xoá lọc
        </button>
        <div className="ml-auto">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="h-9 rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {exporting ? "Đang xuất..." : "Xuất Excel"}
          </button>
        </div>
      </div>

      {exportError && (
        <p className="rounded bg-red-50 px-4 py-2 text-sm text-red-600">{exportError}</p>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Thời gian</th>
                <th className="px-4 py-3 text-left">Người dùng</th>
                <th className="px-4 py-3 text-left">Module</th>
                <th className="px-4 py-3 text-left">Hành động</th>
                <th className="px-4 py-3 text-left">Đối tượng</th>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">IP</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Đang tải...
                  </td>
                </tr>
              )}
              {fetchError && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-red-500">
                    {fetchError}
                  </td>
                </tr>
              )}
              {!loading && !fetchError && data?.items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Không có dữ liệu
                  </td>
                </tr>
              )}
              {data?.items.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {fmtDate(log.createdAt, true)}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    {log.user ? (
                      (log.user.fullName ?? log.user.username)
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {log.module}
                    </span>
                  </td>
                  <td className="px-4 py-3">{actionBadge(log.action)}</td>
                  <td className="px-4 py-3 text-slate-600">{log.entityType}</td>
                  <td className="px-4 py-3 text-slate-500">{log.entityId ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{log.ipAddress ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(log)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-slate-600">
            <span>
              Tổng: <strong>{data.meta.total}</strong> bản ghi
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
              >
                ‹ Trước
              </button>
              <span className="px-2 py-1">
                {page} / {data.meta.totalPages}
              </span>
              <button
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
              >
                Sau ›
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && <DetailModal log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
