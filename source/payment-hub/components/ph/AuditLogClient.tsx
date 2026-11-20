"use client";

import { useCallback, useState } from "react";
import { Download, Loader2, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuditTable } from "./AuditTable";
import { RawDataModal } from "./RawDataModal";
import {
  ACTION_LABELS,
  auditApi,
  type AuditKind,
  type AuditQuery,
  type Page,
  type SystemLogRow,
  type TransactionLogRow,
} from "./audit-api";

type Row = SystemLogRow | TransactionLogRow;

interface AuditLogClientProps {
  initial: Page<Row>;
  initialQuery: AuditQuery;
  options: { actions: string[]; entityTypes: string[]; events: string[] };
}

const input =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none sm:h-9";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
      {label}
      {children}
    </label>
  );
}

/**
 * /audit-log (P7.2): system audit (administrative actions) and transaction journal (lifecycle
 * events + raw API traffic), filters, raw data, CSV / Excel export. Read-only: the API has no
 * write endpoint and the database refuses changes.
 */
export function AuditLogClient({ initial, initialQuery, options }: AuditLogClientProps) {
  const [query, setQuery] = useState<AuditQuery>(initialQuery);
  const [draft, setDraft] = useState<AuditQuery>(initialQuery);
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState<null | "csv" | "xlsx">(null);
  const close = useCallback(() => setOpen(null), []);

  const load = useCallback(async (q: AuditQuery) => {
    setLoading(true);
    setError(null);
    try {
      setPage(await auditApi.list<Row>(q));
      setQuery(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được nhật ký");
    } finally {
      setLoading(false);
    }
  }, []);

  function set<K extends keyof AuditQuery>(key: K, value: AuditQuery[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function switchKind(kind: AuditKind) {
    if (kind === query.kind) return;
    const next: AuditQuery = { kind, from: draft.from, to: draft.to, page: 1 };
    setDraft(next);
    void load(next);
  }

  async function exportAs(format: "csv" | "xlsx") {
    setExporting(format);
    setError(null);
    try {
      await auditApi.download({ ...query, page: undefined }, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xuất thất bại");
    } finally {
      setExporting(null);
    }
  }

  const actions = query.kind === "system" ? options.actions : options.events;
  const { meta } = page;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-800">
            <ShieldCheck className="h-5 w-5 text-blue-600" /> Audit Log
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Chỉ ghi thêm — không sửa / xoá được; lưu tối thiểu 90 ngày.
          </p>
        </div>
        <div className="flex gap-2">
          {(["csv", "xlsx"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => void exportAs(f)}
              disabled={!!exporting || meta.total === 0}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 sm:h-9"
            >
              {exporting === f ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {f === "csv" ? "CSV" : "Excel"}
            </button>
          ))}
        </div>
      </div>

      <div role="tablist" className="flex gap-1 rounded-lg bg-gray-100 p-1 sm:w-fit">
        {(
          [
            ["system", "Nhật ký hệ thống"],
            ["transaction", "Nhật ký giao dịch"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={query.kind === k}
            onClick={() => switchKind(k)}
            className={cn(
              "h-10 flex-1 rounded-md px-4 text-sm font-medium sm:flex-none",
              query.kind === k
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load({ ...draft, page: 1 });
        }}
        className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field label="Từ ngày">
          <input
            type="date"
            className={input}
            value={draft.from}
            onChange={(e) => set("from", e.target.value)}
          />
        </Field>
        <Field label="Đến ngày">
          <input
            type="date"
            className={input}
            value={draft.to}
            onChange={(e) => set("to", e.target.value)}
          />
        </Field>
        <Field label={query.kind === "system" ? "Hành động" : "Sự kiện"}>
          <select
            className={input}
            value={draft.action ?? ""}
            onChange={(e) => set("action", e.target.value)}
          >
            <option value="">Tất cả</option>
            {query.kind === "system" &&
              [...new Set(actions.map((a) => a.split(".")[0]))].map((p) => (
                <option key={`${p}.`} value={`${p}.`}>
                  {p}.* (mọi hành động)
                </option>
              ))}
            {actions.map((a) => (
              <option key={a} value={a}>
                {query.kind === "system" ? (ACTION_LABELS[a] ?? a) : a}
              </option>
            ))}
          </select>
        </Field>
        <Field label={query.kind === "system" ? "Người thực hiện" : "Thực hiện bởi"}>
          <input
            className={input}
            value={draft.user ?? ""}
            placeholder={query.kind === "system" ? "username" : "VD: partner:momo-ipn"}
            onChange={(e) => set("user", e.target.value)}
          />
        </Field>
        {query.kind === "system" ? (
          <>
            <Field label="Đối tượng">
              <select
                className={input}
                value={draft.entity_type ?? ""}
                onChange={(e) => set("entity_type", e.target.value)}
              >
                <option value="">Tất cả</option>
                {options.entityTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mã đối tượng">
              <input
                className={input}
                value={draft.entity_id ?? ""}
                onChange={(e) => set("entity_id", e.target.value)}
              />
            </Field>
            <Field label="Kết quả">
              <select
                className={input}
                value={draft.result ?? ""}
                onChange={(e) => set("result", e.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="success">Thành công</option>
                <option value="failure">Thất bại</option>
                <option value="denied">Bị từ chối</option>
              </select>
            </Field>
          </>
        ) : (
          <Field label="Mã giao dịch">
            <input
              className={input}
              value={draft.q ?? ""}
              placeholder="TXN-…"
              onChange={(e) => set("q", e.target.value)}
            />
          </Field>
        )}
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:h-9"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Lọc
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className={cn(loading && "opacity-60")}>
        <AuditTable kind={query.kind} rows={page.items} onOpen={setOpen} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
        <span>
          {meta.total.toLocaleString("vi-VN")} bản ghi · trang {meta.page}/{meta.totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading || meta.page <= 1}
            onClick={() => void load({ ...query, page: meta.page - 1 })}
            className="h-11 rounded-lg border border-gray-300 bg-white px-3 disabled:opacity-40 sm:h-9"
          >
            Trước
          </button>
          <button
            type="button"
            disabled={loading || meta.page >= meta.totalPages}
            onClick={() => void load({ ...query, page: meta.page + 1 })}
            className="h-11 rounded-lg border border-gray-300 bg-white px-3 disabled:opacity-40 sm:h-9"
          >
            Sau
          </button>
        </div>
      </div>

      {open && <RawDataModal kind={query.kind} id={open} onClose={close} />}
    </div>
  );
}
