"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { BarcodeScanInput, type ScannedProduct } from "./BarcodeScanInput";
import { StatusBadge } from "./StatusBadge";
import {
  apiContext,
  downloadCsv,
  errorMessage,
  fmtDate,
  fmtNumber,
  type ApiAuth,
  type RouterOutputs,
} from "./shared";

type StockTake = RouterOutputs["stockTake"]["get"];

interface Row {
  key: string;
  productId: number;
  variantId: number | null;
  name: string;
  sku: string;
  system: number;
  actual: string;
  notes: string;
  counted: boolean;
}

function toRows(note: StockTake): Row[] {
  return note.stockTakeItems.map((it) => ({
    key: `${it.productId}-${it.variantId ?? 0}`,
    productId: it.productId,
    variantId: it.variantId,
    name: it.product.name,
    sku: it.variant?.sku ?? it.product.sku,
    system: Number(it.systemQuantity),
    actual: String(Number(it.actualQuantity)),
    notes: it.notes ?? "",
    // Saved rows that differ or carry a note were counted in an earlier session
    counted: Number(it.difference) !== 0 || !!it.notes,
  }));
}

const diffOf = (r: Row) => (Number(r.actual) || 0) - r.system;

interface StockTakeFormProps {
  auth: ApiAuth;
  stockTakeId: number;
  onBack: () => void;
}

/** Kiểm kê: nhập/quét số lượng thực tế, chênh lệch tự tính (mockup 04-warehouse §09) */
export function StockTakeForm({ auth, stockTakeId, onBack }: StockTakeFormProps) {
  const toast = useToast();
  const [note, setNote] = useState<StockTake | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | "diff" | "uncounted">("all");
  const [busy, setBusy] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    trpc.stockTake.get
      .query({ id: stockTakeId }, apiContext(auth))
      .then((n) => {
        setNote(n);
        setRows(toRows(n));
      })
      .catch((e) => toast.error(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockTakeId, auth.authToken]);

  const editable = note?.status === "draft" || note?.status === "in_progress";
  const stats = useMemo(
    () => ({
      counted: rows.filter((r) => r.counted).length,
      matched: rows.filter((r) => diffOf(r) === 0).length,
      diff: rows.filter((r) => diffOf(r) !== 0).length,
    }),
    [rows],
  );

  const visible = rows.filter((r) =>
    filter === "diff" ? diffOf(r) !== 0 : filter === "uncounted" ? !r.counted : true,
  );

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, counted: true } : r)));
  }

  function onScan(p: ScannedProduct) {
    const key = `${p.productId}-${p.variantId ?? 0}`;
    const row = rows.find((r) => r.key === key);
    if (!row) {
      toast.warning(`"${p.name}" không có trong phiếu kiểm kê của kho này`);
      return;
    }
    // First scan of a row that still shows the system quantity starts counting from 1
    const base = row.counted ? Number(row.actual) || 0 : 0;
    update(key, { actual: String(base + 1) });
    setFlashKey(key);
    setFilter("all");
    requestAnimationFrame(() =>
      rowRefs.current.get(key)?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
  }

  function resetToZero() {
    if (!confirm("Đặt toàn bộ tồn thực tế về 0 để đếm lại từ đầu?")) return;
    setRows((prev) => prev.map((r) => ({ ...r, actual: "0", counted: false })));
  }

  async function save(complete: boolean) {
    if (!note) return;
    if (rows.length === 0) return toast.error("Phiếu không có sản phẩm nào");
    if (complete) {
      const msg =
        stats.diff > 0
          ? `Có ${stats.diff} sản phẩm chênh lệch. Xác nhận sẽ điều chỉnh tồn kho theo số thực tế. Tiếp tục?`
          : "Xác nhận hoàn thành kiểm kê?";
      if (!confirm(msg)) return;
    }
    setBusy(true);
    try {
      let updated = await trpc.stockTake.updateItems.mutate(
        {
          stockTakeId: note.id,
          items: rows.map((r) => ({
            productId: r.productId,
            variantId: r.variantId,
            actualQuantity: Number(r.actual) || 0,
            notes: r.notes.trim() || null,
          })),
        },
        apiContext(auth),
      );
      if (complete) {
        updated = await trpc.stockTake.complete.mutate({ stockTakeId: note.id }, apiContext(auth));
        toast.success("Đã hoàn thành kiểm kê — tồn kho đã điều chỉnh");
      } else {
        toast.success("Đã lưu nháp kiểm kê");
      }
      setNote(updated);
      setRows((prev) => {
        const fresh = toRows(updated);
        // keep the local "counted" marks of this session
        return fresh.map((f) => ({
          ...f,
          counted: f.counted || !!prev.find((p) => p.key === f.key)?.counted,
        }));
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelNote() {
    if (!note || !confirm("Huỷ phiếu kiểm kê này?")) return;
    try {
      await trpc.stockTake.cancel.mutate({ id: note.id }, apiContext(auth));
      toast.info("Đã huỷ phiếu kiểm kê");
      onBack();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  function exportCsv() {
    if (!note) return;
    downloadCsv(`kiem-ke-${note.code}.csv`, [
      ["STT", "Sản phẩm", "SKU", "Tồn hệ thống", "Tồn thực tế", "Chênh lệch", "Ghi chú"],
      ...rows.map((r, i) => [
        i + 1,
        r.name,
        r.sku,
        r.system,
        Number(r.actual) || 0,
        diffOf(r),
        r.notes,
      ]),
    ]);
  }

  if (!note)
    return <p className="py-10 text-center text-sm text-gray-400">Đang tải phiếu kiểm kê...</p>;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          aria-label="Quay lại danh sách"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="font-semibold text-gray-900">
            Kiểm kê kho — {note.warehouse.name}{" "}
            <span className="ml-1 font-mono text-xs font-normal text-gray-500">{note.code}</span>
          </h2>
          <p className="text-xs text-gray-500">Tạo lúc {fmtDate(note.createdAt, true)}</p>
        </div>
        <StatusBadge status={note.status} />
        <div className="ml-auto flex gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" /> Xuất danh sách
          </button>
          {editable && (
            <button
              onClick={resetToZero}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" /> Đếm lại từ 0
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4 px-5 py-4">
        <div className="flex gap-3">
          <Stat
            label="Đã kiểm"
            value={stats.counted}
            total={rows.length}
            className="text-blue-600"
          />
          <Stat label="Khớp" value={stats.matched} className="text-emerald-600" />
          <Stat label="Chênh lệch" value={stats.diff} className="text-red-500" />
        </div>
        {editable && (
          <BarcodeScanInput
            auth={auth}
            onPick={onScan}
            placeholder="Quét mã vạch sản phẩm để đếm (+1 mỗi lần quét)..."
            className="min-w-72 flex-1"
          />
        )}
      </div>

      <div className="flex gap-1 px-5 pb-3 text-sm">
        {(
          [
            ["all", `Tất cả (${rows.length})`],
            ["diff", `Chênh lệch (${stats.diff})`],
            ["uncounted", `Chưa kiểm (${rows.length - stats.counted})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full px-3 py-1",
              filter === k
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">STT</th>
              <th className="px-4 py-3">Sản phẩm</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Tồn hệ thống</th>
              <th className="w-32 px-4 py-3 text-right">Tồn thực tế</th>
              <th className="px-4 py-3 text-right">Chênh lệch</th>
              <th className="px-4 py-3">Ghi chú</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {rows.length === 0 ? "Kho chưa có sản phẩm tồn để kiểm kê" : "Không có dòng nào"}
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const diff = diffOf(r);
                return (
                  <tr
                    key={r.key}
                    ref={(el) => {
                      if (el) rowRefs.current.set(r.key, el);
                      else rowRefs.current.delete(r.key);
                    }}
                    className={cn(r.key === flashKey && "bg-blue-50", diff !== 0 && "bg-red-50/40")}
                  >
                    <td className="px-4 py-2 text-gray-500">{rows.indexOf(r) + 1}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.sku}</td>
                    <td className="px-4 py-2 text-right">{fmtNumber(r.system)}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        disabled={!editable}
                        aria-label={`Tồn thực tế ${r.name}`}
                        value={r.actual}
                        onChange={(e) => update(r.key, { actual: e.target.value })}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-right outline-none focus:border-blue-400 disabled:bg-gray-50"
                      />
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-right font-semibold",
                        diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-400",
                      )}
                      data-testid={`diff-${r.key}`}
                    >
                      {diff > 0 ? `+${fmtNumber(diff)}` : fmtNumber(diff)}
                    </td>
                    <td className="px-4 py-2">
                      {diff !== 0 || r.notes ? (
                        <input
                          disabled={!editable}
                          aria-label={`Lý do chênh lệch ${r.name}`}
                          placeholder="Lý do..."
                          value={r.notes}
                          onChange={(e) => update(r.key, { notes: e.target.value })}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 outline-none focus:border-blue-400 disabled:bg-gray-50"
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <button
            onClick={cancelNote}
            disabled={busy}
            className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Huỷ phiếu
          </button>
          <button
            onClick={() => save(false)}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Lưu nháp
          </button>
          <button
            onClick={() => save(true)}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Đang xử lý..." : "Xác nhận kiểm kê"}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  total,
  className,
}: {
  label: string;
  value: number;
  total?: number;
  className?: string;
}) {
  return (
    <div className="min-w-24 rounded-lg border border-gray-200 px-4 py-2 text-center">
      <div className={cn("text-2xl font-bold", className)}>
        {value}
        {total !== undefined && <span className="text-sm font-normal text-gray-400">/{total}</span>}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
