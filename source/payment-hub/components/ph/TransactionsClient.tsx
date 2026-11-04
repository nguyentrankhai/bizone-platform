"use client";

import { useRef, useState } from "react";
import { TransactionTable, type TxnRow } from "@/components/ph/TransactionTable";

const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "Created", label: "Mới tạo" },
  { value: "Pending", label: "Đang xử lý" },
  { value: "Success", label: "Thành công" },
  { value: "Failed", label: "Thất bại" },
  { value: "Expired", label: "Hết hạn" },
  { value: "Refunded", label: "Hoàn tiền" },
];

const METHODS: { value: string; label: string }[] = [
  { value: "", label: "Tất cả phương thức" },
  { value: "vnpay_qr", label: "VNPay QR" },
  { value: "vnpay_atm", label: "VNPay ATM" },
  { value: "momo_qr", label: "MoMo" },
  { value: "zalopay_qr", label: "ZaloPay" },
  { value: "vietqr", label: "VietQR" },
];

const PAGE_SIZE = 20;

interface ApiResult {
  items: TxnRow[];
  total: number;
  page: number;
  totalPages: number;
}

interface TransactionsClientProps {
  initialData: ApiResult;
}

export function TransactionsClient({ initialData }: TransactionsClientProps) {
  const [rows, setRows] = useState<TxnRow[]>(initialData.items);
  const [total, setTotal] = useState(initialData.total);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);
  const [page, setPage] = useState(initialData.page);
  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const statusRef = useRef("");
  const methodRef = useRef("");
  const dateFromRef = useRef("");
  const dateToRef = useRef("");
  const searchRef = useRef("");

  async function fetchData(
    p: number,
    overrides?: {
      status?: string;
      method?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
    },
  ) {
    setLoading(true);
    const s = overrides?.status ?? statusRef.current;
    const m = overrides?.method ?? methodRef.current;
    const df = overrides?.dateFrom ?? dateFromRef.current;
    const dt = overrides?.dateTo ?? dateToRef.current;
    const q = overrides?.search ?? searchRef.current;
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
      if (s) params.set("status", s);
      if (m) params.set("payment_method", m);
      if (df) params.set("date_from", df);
      if (dt) params.set("date_to", dt);
      if (q) params.set("search", q);

      const res = await fetch(`/api/internal/transactions?${params}`);
      const json = (await res.json()) as { success: boolean; data: ApiResult };
      if (json.success) {
        setRows(json.data.items);
        setTotal(json.data.total);
        setTotalPages(json.data.totalPages);
        setPage(p);
      }
    } finally {
      setLoading(false);
    }
  }

  function applySearch() {
    searchRef.current = searchInput;
    setSearch(searchInput);
    void fetchData(1, { search: searchInput });
  }

  function handleFilterChange(
    setter: (v: string) => void,
    ref: React.MutableRefObject<string>,
    value: string,
    key: "status" | "method" | "dateFrom" | "dateTo",
  ) {
    ref.current = value;
    setter(value);
    void fetchData(1, { [key]: value });
  }

  function goToPage(p: number) {
    void fetchData(p);
  }

  async function exportCsv() {
    const params = new URLSearchParams({ page: "1", limit: "1000" });
    if (statusRef.current) params.set("status", statusRef.current);
    if (methodRef.current) params.set("payment_method", methodRef.current);
    if (dateFromRef.current) params.set("date_from", dateFromRef.current);
    if (dateToRef.current) params.set("date_to", dateToRef.current);
    if (searchRef.current) params.set("search", searchRef.current);

    const res = await fetch(`/api/internal/transactions?${params}`);
    const json = (await res.json()) as { success: boolean; data: ApiResult };
    if (!json.success) return;

    const headers = [
      "Mã GD",
      "Thời gian",
      "Số tiền",
      "Tiền tệ",
      "Trạng thái",
      "Phương thức",
      "Merchant",
      "Khách hàng",
    ];
    const csvRows = [
      headers.join(","),
      ...json.data.items.map((t) =>
        [
          t.txnCode,
          new Date(t.createdAt).toLocaleString("vi-VN"),
          t.amount,
          t.currency,
          t.status,
          t.paymentMethod ?? "",
          t.merchant?.name ?? "",
          t.customerName ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    const csv = "﻿" + csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Giao dịch</h1>
          <p className="text-sm text-gray-500">
            Tổng:{" "}
            <span className="font-semibold text-gray-700">{total.toLocaleString("vi-VN")}</span>{" "}
            giao dịch
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Xuất CSV
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Mã GD, merchant_txn_id, khách hàng..."
              className="flex-1 bg-transparent text-sm outline-none"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  searchRef.current = "";
                  setSearch("");
                  void fetchData(1, { search: "" });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Status */}
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            value={status}
            onChange={(e) => handleFilterChange(setStatus, statusRef, e.target.value, "status")}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Method */}
          <select
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            value={method}
            onChange={(e) => handleFilterChange(setMethod, methodRef, e.target.value, "method")}
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          {/* Date from */}
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            value={dateFrom}
            onChange={(e) =>
              handleFilterChange(setDateFrom, dateFromRef, e.target.value, "dateFrom")
            }
          />
          <span className="flex items-center text-sm text-gray-400">đến</span>
          {/* Date to */}
          <input
            type="date"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
            value={dateTo}
            onChange={(e) => handleFilterChange(setDateTo, dateToRef, e.target.value, "dateTo")}
          />

          {/* Search button */}
          <button
            type="button"
            onClick={applySearch}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Tìm kiếm
          </button>

          {/* Reset */}
          {(status || method || dateFrom || dateTo || search) && (
            <button
              type="button"
              onClick={() => {
                statusRef.current = "";
                methodRef.current = "";
                dateFromRef.current = "";
                dateToRef.current = "";
                searchRef.current = "";
                setStatus("");
                setMethod("");
                setDateFrom("");
                setDateTo("");
                setSearch("");
                setSearchInput("");
                void fetchData(1, {
                  status: "",
                  method: "",
                  dateFrom: "",
                  dateTo: "",
                  search: "",
                });
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              Xoá bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <TransactionTable rows={rows} loading={loading} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Trang {page} / {totalPages} · {total.toLocaleString("vi-VN")} kết quả
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => goToPage(1)}
              disabled={page === 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-40"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-40"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => goToPage(p)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    p === page
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-40"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => goToPage(totalPages)}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 disabled:opacity-40"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
