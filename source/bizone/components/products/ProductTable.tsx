"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ProductStatus = "active" | "inactive" | "discontinued";

export interface ProductRow {
  id: number;
  name: string;
  sku: string;
  image?: string | null;
  categoryName?: string | null;
  sellingPrice: number;
  costPrice: number;
  currentStock: number;
  minStock: number;
  status: ProductStatus;
}

interface ProductTableProps {
  data: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  loading?: boolean;
  selectedIds: number[];
  onSelect: (ids: number[]) => void;
  onPageChange: (page: number) => void;
  onSort: (key: string, dir: "asc" | "desc") => void;
}

function SortIcon({ col, sortBy, sortDir }: { col: string; sortBy?: string; sortDir?: "asc" | "desc" }) {
  if (sortBy !== col) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 text-gray-300" />;
  if (sortDir === "asc") return <ArrowUp className="ml-1 inline h-3.5 w-3.5 text-blue-500" />;
  return <ArrowDown className="ml-1 inline h-3.5 w-3.5 text-blue-500" />;
}

const STATUS_CONFIG: Record<ProductStatus, { label: string; className: string }> = {
  active: { label: "Đang bán", className: "bg-emerald-100 text-emerald-700" },
  inactive: { label: "Ngừng bán", className: "bg-red-100 text-red-600" },
  discontinued: { label: "Hết hàng", className: "bg-amber-100 text-amber-700" },
};

function formatVND(n: number) {
  return n.toLocaleString("vi-VN") + "đ";
}

export function ProductTable({
  data,
  total,
  page,
  pageSize,
  sortBy,
  sortDir,
  loading,
  selectedIds,
  onSelect,
  onPageChange,
  onSort,
}: ProductTableProps) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const allChecked = data.length > 0 && data.every((r) => selectedIds.includes(r.id));
  const someChecked = !allChecked && data.some((r) => selectedIds.includes(r.id));

  function toggleAll() {
    if (allChecked) {
      onSelect(selectedIds.filter((id) => !data.find((r) => r.id === id)));
    } else {
      const newIds = [...new Set([...selectedIds, ...data.map((r) => r.id)])];
      onSelect(newIds);
    }
  }

  function toggleRow(id: number) {
    if (selectedIds.includes(id)) onSelect(selectedIds.filter((x) => x !== id));
    else onSelect([...selectedIds, id]);
  }

  function handleSort(col: string) {
    if (sortBy === col) {
      onSort(col, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSort(col, "asc");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Ảnh
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("name")}
              >
                Tên sản phẩm <SortIcon col="name" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Danh mục
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("sellingPrice")}
              >
                Giá bán <SortIcon col="sellingPrice" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("costPrice")}
              >
                Giá vốn <SortIcon col="costPrice" sortBy={sortBy} sortDir={sortDir} />
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tồn kho
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Trạng thái
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    Đang tải...
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-400">
                  Không có sản phẩm nào
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const status = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.inactive;
                const lowStock = row.currentStock <= row.minStock;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-blue-50/30"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleRow(row.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-10 w-10 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                        {row.image ? (
                          <Image
                            src={row.image}
                            alt={row.name}
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-gray-300">
                            SP
                          </div>
                        )}
                      </div>
                    </td>
                    <td
                      className="cursor-pointer px-4 py-3"
                      onClick={() => router.push(`/products/${row.id}`)}
                    >
                      <div className="font-medium text-gray-900 hover:text-blue-600">
                        {row.name}
                      </div>
                      <div className="text-xs text-gray-400">{row.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{row.categoryName ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatVND(row.sellingPrice)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {formatVND(row.costPrice)}
                    </td>
                    <td className={cn("px-4 py-3 text-right font-medium", lowStock && "text-red-600")}>
                      {row.currentStock}
                      {lowStock && (
                        <span className="ml-1 text-xs text-red-400">(!)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {total === 0
            ? "0 sản phẩm"
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total} sản phẩm`}
          {selectedIds.length > 0 && (
            <span className="ml-2 text-blue-600">(Đã chọn {selectedIds.length})</span>
          )}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return (
                <button
                  key={pg}
                  onClick={() => onPageChange(pg)}
                  className={cn(
                    "h-7 w-7 rounded text-xs font-medium",
                    pg === page ? "bg-blue-600 text-white" : "hover:bg-gray-100",
                  )}
                >
                  {pg}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
