"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import {
  ErrorBox,
  addDays,
  btnSecondary,
  inputAutoCls,
  useLoad,
  vnToday,
  weekStart,
} from "@/components/staff/shared";
import { cn } from "@/lib/utils";
import { RevenueReport } from "./RevenueReport";
import { ProfitReport } from "./ProfitReport";
import { ProductPerformance } from "./ProductPerformance";
import { StaffPerformance } from "./StaffPerformance";
import { InventoryReport, PromotionReport } from "./PromotionInventory";
import { BranchSummary } from "./BranchSummary";
import { EmailReportButton } from "./EmailReportButton";

type Tab = "revenue" | "profit" | "products" | "staff" | "branches" | "promotion" | "inventory";
type Compare = "previous_period" | "previous_year" | "none";

const TABS: { key: Tab; label: string }[] = [
  { key: "revenue", label: "Doanh thu" },
  { key: "profit", label: "Lợi nhuận" },
  { key: "products", label: "Hàng bán chạy/chậm" },
  { key: "staff", label: "Nhân viên" },
  { key: "branches", label: "Chi nhánh" },
  { key: "promotion", label: "Khuyến mãi" },
  { key: "inventory", label: "Tồn kho" },
];

const PRESETS = [
  "today",
  "yesterday",
  "7days",
  "thisMonth",
  "lastMonth",
  "thisQuarter",
  "thisYear",
  "custom",
] as const;
type Preset = (typeof PRESETS)[number];
const PRESET_LABEL: Record<Preset, string> = {
  today: "Hôm nay",
  yesterday: "Hôm qua",
  "7days": "7 ngày",
  thisMonth: "Tháng này",
  lastMonth: "Tháng trước",
  thisQuarter: "Quý này",
  thisYear: "Năm nay",
  custom: "Tuỳ chọn",
};

export function presetRange(p: Preset, today: string): { from: string; to: string } | null {
  const month = today.slice(0, 8);
  switch (p) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7days":
      return { from: addDays(today, -6), to: today };
    case "thisMonth":
      return { from: `${month}01`, to: today };
    case "lastMonth": {
      const end = addDays(`${month}01`, -1);
      return { from: `${end.slice(0, 8)}01`, to: end };
    }
    case "thisQuarter": {
      const m = Number(today.slice(5, 7));
      const q = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${today.slice(0, 5)}${String(q).padStart(2, "0")}-01`, to: today };
    }
    case "thisYear":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:
      return null;
  }
}

const COMPARE_LABEL: Record<Compare, string | null> = {
  previous_period: "kỳ trước",
  previous_year: "cùng kỳ năm trước",
  none: null,
};

function ExportButtons({ auth, request }: { auth: ApiAuth; request: () => unknown }) {
  const [busy, setBusy] = useState<"" | "xlsx" | "pdf">("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function run(format: "xlsx" | "pdf") {
    const ctx = apiContext(auth);
    setBusy(format);
    setError("");
    setMsg("");
    const t0 = performance.now();
    try {
      const { jobId } = await trpc.reports.export.mutate(
        { ...(request() as object), format } as Parameters<typeof trpc.reports.export.mutate>[0],
        ctx,
      );
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, i < 10 ? 300 : 1000));
        const st = await trpc.reports.exportStatus.query({ jobId }, ctx);
        if (st.state === "failed") throw new Error(st.error);
        if (st.state === "completed") {
          const bytes = Uint8Array.from(atob(st.base64), (c) => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: st.mimeType }));
          const a = document.createElement("a");
          a.href = url;
          a.download = st.fileName;
          a.click();
          URL.revokeObjectURL(url);
          setMsg(`Đã xuất ${st.fileName} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
          return;
        }
        if (i === 15 && st.state === "waiting") setMsg("Đang chờ worker xử lý…");
      }
      throw new Error("Quá thời gian chờ — kiểm tra process worker (npm run dev:worker)");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btnSecondary} disabled={busy !== ""} onClick={() => run("pdf")}>
        {busy === "pdf" ? "Đang xuất…" : "Xuất PDF"}
      </button>
      <button className={btnSecondary} disabled={busy !== ""} onClick={() => run("xlsx")}>
        {busy === "xlsx" ? "Đang xuất…" : "Xuất Excel"}
      </button>
      <EmailReportButton auth={auth} request={request} />
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      {error && (
        <span className="text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function ReportsClient({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const today = vnToday();
  const [tab, setTab] = useState<Tab>("revenue");
  const [preset, setPreset] = useState<Preset>("7days");
  const [range, setRange] = useState(() => presetRange("7days", today)!);
  const [branchId, setBranchId] = useState<number | undefined>();
  const [userId, setUserId] = useState<number | undefined>();
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [compare, setCompare] = useState<Compare>("previous_period");
  const [couponId, setCouponId] = useState<number | undefined>();
  const [promo, setPromo] = useState(() => ({
    from: addDays(weekStart(today), -7),
    to: addDays(weekStart(today), -1),
  }));
  const [warehouseId, setWarehouseId] = useState<number | undefined>();

  const options = useLoad(JSON.stringify(["opts", auth]), () =>
    trpc.reports.options.query(undefined, ctx),
  );
  const opts = options.data;

  const filter = useMemo(
    () => ({ ...range, branchId, userId, categoryId, compare }),
    [range, branchId, userId, categoryId, compare],
  );
  const request = (): unknown => {
    if (tab === "promotion") return { type: tab, filter: { ...promo, couponId, branchId } };
    if (tab === "inventory")
      return { type: tab, filter: { warehouseId, branchId, expiringDays: 30 } };
    return { type: tab, filter };
  };

  const key = JSON.stringify([tab, filter, promo, couponId, warehouseId, auth]);
  const report = useLoad(key, async () => {
    const t0 = performance.now();
    const data =
      tab === "revenue"
        ? await trpc.reports.revenue.query(filter, ctx)
        : tab === "profit"
          ? await trpc.reports.profit.query(filter, ctx)
          : tab === "products"
            ? await trpc.reports.products.query(filter, ctx)
            : tab === "staff"
              ? await trpc.reports.staff.query(filter, ctx)
              : tab === "branches"
                ? await trpc.reports.branches.query({ ...filter, branchId: undefined }, ctx)
                : tab === "promotion"
                  ? await trpc.reports.promotion.query({ ...promo, couponId, branchId }, ctx)
                  : await trpc.reports.inventory.query(
                      { warehouseId, branchId, expiringDays: 30 },
                      ctx,
                    );
    return { tab, data, ms: Math.round(performance.now() - t0) };
  });

  const compareLabel = COMPARE_LABEL[compare];
  const usesPeriod = tab !== "promotion" && tab !== "inventory";
  const r = report.data?.tab === tab ? report.data : null;

  const catOptions = useMemo(() => {
    const cats = opts?.categories ?? [];
    const depth = (id: number | null, d = 0): number => {
      const c = cats.find((x) => x.id === id);
      return c?.parentId ? depth(c.parentId, d + 1) : d;
    };
    return cats.map((c) => ({ id: c.id, label: `${"— ".repeat(depth(c.id))}${c.name}` }));
  }, [opts]);

  return (
    <div className="space-y-4">
      <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Loại báo cáo">
        <div className="flex min-w-max gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "-mb-px h-11 border-b-2 px-4 text-sm font-medium whitespace-nowrap",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        {usesPeriod && (
          <>
            <select
              className={inputAutoCls}
              aria-label="Khoảng thời gian"
              value={preset}
              onChange={(e) => {
                const p = e.target.value as Preset;
                setPreset(p);
                const next = presetRange(p, today);
                if (next) setRange(next);
              }}
            >
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABEL[p]}
                </option>
              ))}
            </select>
            {preset === "custom" && (
              <>
                <input
                  type="date"
                  aria-label="Từ ngày"
                  className={inputAutoCls}
                  value={range.from}
                  max={range.to}
                  onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })}
                />
                <input
                  type="date"
                  aria-label="Đến ngày"
                  className={inputAutoCls}
                  value={range.to}
                  min={range.from}
                  onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })}
                />
              </>
            )}
          </>
        )}
        {tab === "promotion" && (
          <>
            <span className="text-sm text-slate-600">Khung KM</span>
            <input
              type="date"
              aria-label="KM từ ngày"
              className={inputAutoCls}
              value={promo.from}
              max={promo.to}
              onChange={(e) => e.target.value && setPromo({ ...promo, from: e.target.value })}
            />
            <input
              type="date"
              aria-label="KM đến ngày"
              className={inputAutoCls}
              value={promo.to}
              min={promo.from}
              onChange={(e) => e.target.value && setPromo({ ...promo, to: e.target.value })}
            />
            <select
              className={inputAutoCls}
              aria-label="Mã giảm giá"
              value={couponId ?? ""}
              onChange={(e) => setCouponId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Mọi mã giảm giá</option>
              {opts?.coupons.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </>
        )}
        {tab !== "branches" && (
          <select
            className={inputAutoCls}
            aria-label="Chi nhánh"
            value={branchId ?? ""}
            onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : undefined)}
          >
            {/* P4.6: empty = the branch picked in the top bar ("Tất cả" for admins) */}
            <option value="">Chi nhánh đang làm việc</option>
            {opts?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        {tab === "inventory" && (
          <select
            className={inputAutoCls}
            aria-label="Kho"
            value={warehouseId ?? ""}
            onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Tất cả kho</option>
            {opts?.warehouses
              .filter((w) => !branchId || w.branchId === branchId)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        )}
        {usesPeriod && (
          <>
            {tab !== "staff" && (
              <select
                className={inputAutoCls}
                aria-label="Nhân viên"
                value={userId ?? ""}
                onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Tất cả nhân viên</option>
                {opts?.staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                    {u.isActive ? "" : " (đã nghỉ)"}
                  </option>
                ))}
              </select>
            )}
            <select
              className={inputAutoCls}
              aria-label="Danh mục"
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Tất cả danh mục</option>
              {catOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {tab !== "products" && (
              <select
                className={inputAutoCls}
                aria-label="So sánh"
                value={compare}
                onChange={(e) => setCompare(e.target.value as Compare)}
              >
                <option value="previous_period">So với kỳ trước</option>
                <option value="previous_year">So với cùng kỳ năm trước</option>
                <option value="none">Không so sánh</option>
              </select>
            )}
          </>
        )}
        <div className="flex-1" />
        {tab !== "branches" && <ExportButtons auth={auth} request={request} />}
      </div>

      <ErrorBox message={report.error || options.error} />
      {report.loading && !r && (
        <div className="py-12 text-center text-sm text-slate-400">Đang tải báo cáo…</div>
      )}
      {r && (
        <div className={report.loading ? "opacity-60 transition-opacity" : ""}>
          <p className="mb-2 text-xs text-slate-400">
            Tải trong {r.ms} ms · doanh số từ hoá đơn POS (không gồm hoá đơn đã huỷ)
          </p>
          {r.tab === "revenue" && (
            <RevenueReport data={r.data as never} compareLabel={compareLabel} />
          )}
          {r.tab === "profit" && (
            <ProfitReport data={r.data as never} compareLabel={compareLabel} />
          )}
          {r.tab === "products" && <ProductPerformance data={r.data as never} />}
          {r.tab === "staff" && (
            <StaffPerformance data={r.data as never} compareLabel={compareLabel} />
          )}
          {r.tab === "branches" && (
            <BranchSummary data={r.data as never} compareLabel={compareLabel} />
          )}
          {r.tab === "promotion" && <PromotionReport data={r.data as never} />}
          {r.tab === "inventory" && <InventoryReport data={r.data as never} />}
        </div>
      )}
    </div>
  );
}
