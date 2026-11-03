"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ClipboardCheck,
  Clock,
  Package,
  Search,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { useLowStockAlerts } from "@/hooks/useLowStockAlerts";
import { StockChart } from "./StockChart";
import { TransactionHistory } from "./TransactionHistory";
import { WarehouseTable, type WarehouseRow } from "./WarehouseTable";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtNumber,
  type ApiAuth,
  type RouterOutputs,
} from "./shared";

type InventoryRow = RouterOutputs["inventory"]["list"]["items"][number];
type BatchRow = RouterOutputs["inventory"]["batches"]["items"][number];
type StockRow = RouterOutputs["inventory"]["stockByWarehouse"][number];
type TxType = RouterOutputs["inventory"]["transactionTypes"][number];

const TABS = [
  { key: "stock", label: "Tồn kho" },
  { key: "transactions", label: "Phiếu nhập / xuất" },
  { key: "batches", label: "Lô & HSD" },
  { key: "warehouses", label: "Danh sách kho" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const PAGE_SIZE = 20;

export function WarehouseClient({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "stock") as TabKey;

  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [txTypes, setTxTypes] = useState<TxType[]>([]);
  const [summary, setSummary] = useState({ totalProducts: 0, lowStock: 0 });
  const [batchCounts, setBatchCounts] = useState({ expiringSoon: 0, expired: 0 });
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const ctx = apiContext(auth);
      const [w, s, sum, soon, expired, types] = await Promise.all([
        trpc.warehouse.list.query(undefined, ctx),
        trpc.inventory.stockByWarehouse.query(undefined, ctx),
        trpc.inventory.summary.query({}, ctx),
        trpc.inventory.batches.query({ expiringSoon: true, page: 1, pageSize: 1 }, ctx),
        trpc.inventory.batches.query({ expired: true, page: 1, pageSize: 1 }, ctx),
        trpc.inventory.transactionTypes.query(undefined, ctx),
      ]);
      setWarehouses(w);
      setStock(s);
      setSummary(sum);
      setBatchCounts({ expiringSoon: soon.meta.total, expired: expired.meta.total });
      setTxTypes(types);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview();
  }, [loadOverview]);

  const refreshAll = useCallback(() => {
    loadOverview();
    setReloadKey((k) => k + 1);
  }, [loadOverview]);

  useLowStockAlerts(auth, (alert) => {
    const wh =
      warehouses.find((w) => w.id === alert.warehouseId)?.name ?? `Kho #${alert.warehouseId}`;
    const names = alert.alerts
      .map((a) => `${a.product.name} (${fmtNumber(a.quantity)})`)
      .join(", ");
    toast.warning(`Tồn thấp tại ${wh}: ${names}`);
    refreshAll();
  });

  function setTab(key: TabKey, extra?: Record<string, string>) {
    const sp = new URLSearchParams({ tab: key, ...extra });
    router.replace(`/warehouse?${sp}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <QuickLink
          href="/warehouse/transactions/new?direction=in"
          icon={ArrowDownToLine}
          label="Nhập kho"
          primary
        />
        <QuickLink
          href="/warehouse/transactions/new?direction=out"
          icon={ArrowUpFromLine}
          label="Xuất kho"
        />
        <QuickLink href="/warehouse/stock-take" icon={ClipboardCheck} label="Kiểm kê" />
        <QuickLink href="/warehouse/transfer" icon={ArrowLeftRight} label="Chuyển kho" />
      </div>

      {/* Alert cards (mockup §10) + chart */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.4fr]">
        <AlertCard
          icon={Package}
          title="Mặt hàng đang tồn"
          value={summary.totalProducts}
          hint={`${warehouses.length} kho`}
          tone="blue"
          onClick={() => setTab("stock")}
        />
        <AlertCard
          icon={AlertTriangle}
          title="Dưới ngưỡng tối thiểu"
          value={summary.lowStock}
          hint="Cần nhập thêm"
          tone="red"
          badge
          onClick={() => setTab("stock", { low: "1" })}
        />
        <AlertCard
          icon={batchCounts.expired > 0 ? XCircle : Clock}
          title="Sắp hết hạn (30 ngày)"
          value={batchCounts.expiringSoon}
          hint={
            batchCounts.expired > 0 ? `${batchCounts.expired} lô đã hết hạn` : "Không có lô hết hạn"
          }
          tone="amber"
          onClick={() => setTab("batches", { exp: "soon" })}
        />
        <StockChart data={stock} />
      </div>

      {/* Tabs */}
      <div>
        <div className="mb-4 flex gap-1 border-b border-gray-200" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium",
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              {t.label}
              {t.key === "stock" && summary.lowStock > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {summary.lowStock}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "stock" && (
          <InventoryTable
            key={reloadKey}
            auth={auth}
            warehouses={warehouses}
            initialLow={params.get("low") === "1"}
          />
        )}
        {tab === "transactions" && (
          <TransactionHistory
            key={reloadKey}
            auth={auth}
            warehouses={warehouses}
            txTypes={txTypes}
            onChanged={loadOverview}
          />
        )}
        {tab === "batches" && (
          <BatchTable
            key={reloadKey}
            auth={auth}
            warehouses={warehouses}
            initial={params.get("exp") ?? ""}
          />
        )}
        {tab === "warehouses" && (
          <WarehouseTable
            auth={auth}
            warehouses={warehouses}
            stock={stock}
            loading={loading}
            onChanged={loadOverview}
          />
        )}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  primary,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium",
        primary
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}

const TONE = {
  blue: "bg-blue-50 text-blue-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
};

function AlertCard({
  icon: Icon,
  title,
  value,
  hint,
  tone,
  badge,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  value: number;
  hint: string;
  tone: keyof typeof TONE;
  badge?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300"
    >
      <span className="flex items-start justify-between">
        <span className="text-sm text-gray-500">{title}</span>
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", TONE[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </span>
      <span className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900">
        {fmtNumber(value)}
        {badge && value > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
            Cảnh báo
          </span>
        )}
      </span>
      <span className="mt-1 text-xs text-gray-500">{hint}</span>
    </button>
  );
}

// ─── Tồn kho ──────────────────────────────────────────────────────────────────

function InventoryTable({
  auth,
  warehouses,
  initialLow,
}: {
  auth: ApiAuth;
  warehouses: WarehouseRow[];
  initialLow: boolean;
}) {
  const toast = useToast();
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(initialLow);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    trpc.inventory.list
      .query(
        {
          page,
          pageSize: PAGE_SIZE,
          warehouseId: warehouseId ? Number(warehouseId) : undefined,
          search: q || undefined,
          lowStock: lowOnly || undefined,
        },
        apiContext(auth),
      )
      .then((res) => {
        if (cancelled) return;
        setRows(res.items);
        setTotal(res.meta.total);
      })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, warehouseId, q, lowOnly, auth.authToken]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => {
              const v = e.target.value;
              setSearch(v);
              clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                setQ(v.trim());
                setPage(1);
              }, 300);
            }}
            placeholder="Tìm theo tên, SKU, mã vạch..."
            className="w-full rounded-lg border border-gray-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          aria-label="Lọc theo kho"
          value={warehouseId}
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 py-2 pr-8 pl-3 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Tất cả kho</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => {
              setLowOnly(e.target.checked);
              setPage(1);
            }}
          />
          Chỉ hàng dưới ngưỡng
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Sản phẩm</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Kho</th>
              <th className="px-4 py-3 text-right">Tồn</th>
              <th className="px-4 py-3 text-right">Tối thiểu</th>
              <th className="px-4 py-3">Cảnh báo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  {loading ? "Đang tải..." : "Không có dữ liệu tồn kho"}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const qty = Number(r.quantity);
                const min = r.product.minStock;
                const out = qty <= 0;
                const low = !out && min > 0 && qty <= min;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.product.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {r.variant?.sku ?? r.product.sku}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.warehouse.name}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-semibold",
                        out || low ? "text-red-600" : "text-gray-900",
                      )}
                    >
                      {fmtNumber(qty)}{" "}
                      <span className="text-xs font-normal text-gray-400">{r.product.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{min || "—"}</td>
                    <td className="px-4 py-3">
                      {out ? (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                          Hết hàng
                        </span>
                      ) : low ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          Dưới ngưỡng
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} totalPages={totalPages} total={total} unit="dòng" onPage={setPage} />
    </div>
  );
}

// ─── Lô & HSD ─────────────────────────────────────────────────────────────────

function BatchTable({
  auth,
  warehouses,
  initial,
}: {
  auth: ApiAuth;
  warehouses: WarehouseRow[];
  initial: string;
}) {
  const toast = useToast();
  const [warehouseId, setWarehouseId] = useState("");
  const [exp, setExp] = useState(initial);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<BatchRow[]>([]);
  // Reference time for HSD colouring, taken when data loads (render must stay pure)
  const [now, setNow] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    trpc.inventory.batches
      .query(
        {
          page,
          pageSize: PAGE_SIZE,
          warehouseId: warehouseId ? Number(warehouseId) : undefined,
          expiringSoon: exp === "soon" || undefined,
          expired: exp === "expired" || undefined,
        },
        apiContext(auth),
      )
      .then((res) => {
        setRows(res.items);
        setTotal(res.meta.total);
        setNow(Date.now());
      })
      .catch((e) => toast.error(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, warehouseId, exp, auth.authToken]);

  const soon = (now ?? 0) + 30 * 24 * 60 * 60 * 1000;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          aria-label="Lọc theo kho"
          value={warehouseId}
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 py-2 pr-8 pl-3 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Tất cả kho</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc theo hạn sử dụng"
          value={exp}
          onChange={(e) => {
            setExp(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 py-2 pr-8 pl-3 text-sm outline-none focus:border-blue-400"
        >
          <option value="">Tất cả lô còn hàng</option>
          <option value="soon">Sắp hết hạn (30 ngày)</option>
          <option value="expired">Đã hết hạn</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Lô</th>
              <th className="px-4 py-3">Sản phẩm</th>
              <th className="px-4 py-3">Kho</th>
              <th className="px-4 py-3 text-right">Số lượng</th>
              <th className="px-4 py-3">NSX</th>
              <th className="px-4 py-3">HSD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Không có lô hàng
                </td>
              </tr>
            ) : (
              rows.map((b) => {
                const t = b.expiryDate ? new Date(b.expiryDate).getTime() : null;
                return (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-mono text-xs">{b.batchCode}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{b.product.name}</td>
                    <td className="px-4 py-3 text-gray-600">{b.warehouse.name}</td>
                    <td className="px-4 py-3 text-right">{fmtNumber(b.quantity)}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(b.manufactureDate)}</td>
                    <td
                      className={cn(
                        "px-4 py-3",
                        t !== null && now !== null && t < now
                          ? "font-semibold text-red-600"
                          : t !== null && now !== null && t <= soon
                            ? "font-semibold text-amber-600"
                            : "text-gray-600",
                      )}
                    >
                      {fmtDate(b.expiryDate)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pager
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        unit="lô"
        onPage={setPage}
      />
    </div>
  );
}

function Pager({
  page,
  totalPages,
  total,
  unit,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  unit: string;
  onPage: (p: number) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
      <span>
        {fmtNumber(total)} {unit}
      </span>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40"
        >
          Trước
        </button>
        <span>
          {page}/{totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40"
        >
          Sau
        </button>
      </div>
    </div>
  );
}
