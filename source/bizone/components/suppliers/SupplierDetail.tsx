"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtMoney,
  fmtNumber,
  type ApiAuth,
} from "@/components/inventory/shared";
import { ErrorBox, btnPrimary, btnSecondary, useLoad } from "@/components/staff/shared";
import { cn } from "@/lib/utils";
import { SupplierForm, toFormValue } from "./SupplierForm";
import { PaymentModal } from "./PaymentModal";
import { PurchaseOrderTable } from "./PurchaseOrderList";
import { PriceComparisonTable } from "./PriceComparison";
import { Badge, DEBT_STATUS, PAYMENT_METHODS, Pager, SupplierNav, fmtDay } from "./shared";

type Tab = "orders" | "debts" | "history" | "prices";
const TABS: { key: Tab; label: string }[] = [
  { key: "orders", label: "Đơn nhập" },
  { key: "debts", label: "Công nợ & thanh toán" },
  { key: "history", label: "Lịch sử giao dịch" },
  { key: "prices", label: "Giá nhập" },
];

export function SupplierDetail({ auth, supplierId }: { auth: ApiAuth; supplierId: number }) {
  const router = useRouter();
  const toast = useToast();
  const ctx = apiContext(auth);
  const [tab, setTab] = useState<Tab>("orders");
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);

  const sup = useLoad(`sup:${supplierId}`, () => trpc.supplier.get.query({ id: supplierId }, ctx));
  const s = sup.data;

  async function remove() {
    if (!s || !confirm(`Xoá nhà cung cấp "${s.name}"? Không thể hoàn tác.`)) return;
    try {
      await trpc.supplier.delete.mutate({ id: s.id }, ctx);
      toast.success("Đã xoá nhà cung cấp");
      router.push("/suppliers");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (!s) {
    return (
      <div className="space-y-4">
        <SupplierNav />
        <ErrorBox message={sup.error} />
        {!sup.error && <p className="py-12 text-center text-sm text-slate-400">Đang tải…</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SupplierNav />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/suppliers"
            className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> Danh sách nhà cung cấp
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">{s.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {s.code}
            {s.taxCode && <> · MST {s.taxCode}</>}
            {!s.isActive && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                Ngừng hợp tác
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnSecondary} onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Sửa
          </button>
          {s.stats.poCount === 0 && (
            <button type="button" className={btnSecondary} onClick={remove}>
              <Trash2 className="h-4 w-4" /> Xoá
            </button>
          )}
          <button
            type="button"
            className={btnSecondary}
            disabled={s.stats.owed <= 0}
            onClick={() => setPaying(true)}
          >
            <Wallet className="h-4 w-4" /> Thanh toán
          </button>
          {s.isActive && (
            <Link href={`/purchase-orders/new?supplier=${s.id}`} className={btnPrimary}>
              <Plus className="h-4 w-4" /> Tạo đơn nhập
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Còn nợ"
          value={fmtMoney(s.stats.owed)}
          tone={s.stats.owed > 0 ? "strong" : undefined}
        />
        <Stat
          label="Nợ quá hạn"
          value={fmtMoney(s.stats.overdue)}
          tone={s.stats.overdue > 0 ? "danger" : undefined}
        />
        <Stat
          label="Đã nhập / đã trả"
          value={`${fmtMoney(s.stats.purchasedAmount)}`}
          sub={`Đã trả ${fmtMoney(s.stats.paidAmount)}`}
        />
        <Stat
          label="Đơn nhập"
          value={fmtNumber(s.stats.poCount)}
          sub={`${s.stats.pending} chờ · ${s.stats.partial} một phần · ${s.stats.received} đã nhập · ${s.stats.cancelled} huỷ`}
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Người liên hệ" value={s.contactPerson} />
        <Info label="Điện thoại" value={s.phone} />
        <Info label="Email" value={s.email} />
        <Info label="Điều khoản thanh toán" value={s.paymentTerms} />
        <Info label="Địa chỉ" value={s.address} />
        <Info
          label="Lần nhập gần nhất"
          value={s.stats.lastPurchaseAt ? fmtDate(s.stats.lastPurchaseAt) : null}
        />
        {s.notes && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Info label="Ghi chú" value={s.notes} />
          </div>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-slate-200" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "orders" && <PurchaseOrderTable auth={auth} supplierId={s.id} />}
      {tab === "debts" && (
        <DebtsTab auth={auth} supplierId={s.id} supplierName={s.name} onChanged={sup.reload} />
      )}
      {tab === "history" && <HistoryTab auth={auth} supplierId={s.id} />}
      {tab === "prices" && <PriceComparisonTable auth={auth} supplierId={s.id} minSuppliers={1} />}

      {editing && (
        <SupplierForm
          auth={auth}
          initial={toFormValue(s)}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            sup.reload();
          }}
        />
      )}
      {paying && (
        <PaymentModal
          auth={auth}
          supplierId={s.id}
          supplierName={s.name}
          maxAmount={s.stats.owed}
          onClose={() => setPaying(false)}
          onPaid={() => {
            setPaying(false);
            sup.reload();
            setTab("debts");
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "strong" | "danger";
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          tone === "danger"
            ? "text-red-600"
            : tone === "strong"
              ? "text-slate-900"
              : "text-slate-700",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="whitespace-pre-line text-slate-800">{value || "—"}</div>
    </div>
  );
}

function DebtsTab({
  auth,
  supplierId,
  supplierName,
  onChanged,
}: {
  auth: ApiAuth;
  supplierId: number;
  supplierName: string;
  onChanged: () => void;
}) {
  const data = useLoad(`debts:${supplierId}`, () =>
    trpc.supplier.debts.query({ supplierId }, apiContext(auth)),
  );
  const [pay, setPay] = useState<{ poId: number; poCode: string; max: number } | null>(null);
  const debts = data.data?.debts ?? [];
  const payments = data.data?.payments ?? [];

  return (
    <div className="space-y-5">
      <ErrorBox message={data.error} />
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          Công nợ phải trả theo đơn nhập
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">Đơn nhập</th>
                <th className="px-4 py-2 text-right">Phải trả</th>
                <th className="px-4 py-2 text-right">Đã trả</th>
                <th className="px-4 py-2 text-right">Còn lại</th>
                <th className="px-4 py-2">Hạn trả</th>
                <th className="px-4 py-2">Trạng thái</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {debts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {data.loading
                      ? "Đang tải…"
                      : "Chưa có công nợ (chưa nhận hàng từ nhà cung cấp này)"}
                  </td>
                </tr>
              )}
              {debts.map((d) => (
                <tr key={d.id} className={d.isOverdue ? "bg-red-50/40" : undefined}>
                  <td className="px-4 py-2">
                    {d.poId ? (
                      <Link
                        href={`/purchase-orders/${d.poId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {d.poCode}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(d.totalAmount)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(d.paidAmount)}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {fmtMoney(d.remainingAmount)}
                  </td>
                  <td className={cn("px-4 py-2", d.isOverdue && "font-medium text-red-600")}>
                    {fmtDay(d.dueDate)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge map={DEBT_STATUS} value={d.isOverdue ? "overdue" : d.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {d.remainingAmount > 0 && d.poId && (
                      <button
                        type="button"
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={() =>
                          setPay({ poId: d.poId!, poCode: d.poCode ?? "", max: d.remainingAmount })
                        }
                      >
                        Trả
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          Lịch sử thanh toán
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">Ngày</th>
                <th className="px-4 py-2">Đơn nhập</th>
                <th className="px-4 py-2">Hình thức</th>
                <th className="px-4 py-2">Chứng từ</th>
                <th className="px-4 py-2 text-right">Số tiền</th>
                <th className="px-4 py-2">Người ghi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Chưa có thanh toán
                  </td>
                </tr>
              )}
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">{fmtDay(p.paymentDate)}</td>
                  <td className="px-4 py-2">{p.poCode ?? "—"}</td>
                  <td className="px-4 py-2">
                    {PAYMENT_METHODS[p.paymentMethod ?? ""] ?? p.paymentMethod ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{p.referenceCode || "—"}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {fmtMoney(p.amount)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{p.createdBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {pay && (
        <PaymentModal
          auth={auth}
          supplierId={supplierId}
          supplierName={supplierName}
          poId={pay.poId}
          poCode={pay.poCode}
          maxAmount={pay.max}
          onClose={() => setPay(null)}
          onPaid={() => {
            setPay(null);
            data.reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

const HISTORY_LABEL: Record<string, { label: string; className: string }> = {
  po_created: { label: "Tạo đơn nhập", className: "bg-slate-100 text-slate-700 ring-slate-200" },
  receipt: { label: "Nhập kho", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  payment: { label: "Thanh toán", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  po_cancelled: { label: "Huỷ đơn", className: "bg-red-50 text-red-700 ring-red-200" },
};

function HistoryTab({ auth, supplierId }: { auth: ApiAuth; supplierId: number }) {
  const [page, setPage] = useState(1);
  const input = { supplierId, page, pageSize: 20 };
  const h = useLoad(JSON.stringify(input), () =>
    trpc.supplier.history.query(input, apiContext(auth)),
  );
  const rows = h.data?.items ?? [];
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <ErrorBox message={h.error} />
      <ol className="divide-y divide-slate-100">
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-400">
            {h.loading ? "Đang tải…" : "Chưa có giao dịch"}
          </li>
        )}
        {rows.map((r, i) => (
          <li
            key={`${r.kind}-${r.ref}-${i}`}
            className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <span className="w-32 shrink-0 text-slate-500 tabular-nums">{fmtDate(r.at, true)}</span>
            <Badge map={HISTORY_LABEL} value={r.kind} />
            <span className="font-medium text-slate-800">{r.ref}</span>
            {r.poCode && r.kind !== "po_created" && r.kind !== "po_cancelled" && r.poId && (
              <Link href={`/purchase-orders/${r.poId}`} className="text-primary hover:underline">
                {r.poCode}
              </Link>
            )}
            {r.poId && (r.kind === "po_created" || r.kind === "po_cancelled") && (
              <Link
                href={`/purchase-orders/${r.poId}`}
                className="text-xs text-primary hover:underline"
              >
                Xem đơn
              </Link>
            )}
            {r.note && <span className="text-slate-500">{r.note}</span>}
            <span className="ml-auto font-medium tabular-nums">
              {r.amount !== null ? fmtMoney(r.amount) : ""}
            </span>
          </li>
        ))}
      </ol>
      {h.data && (
        <Pager
          page={h.data.meta.page}
          totalPages={h.data.meta.totalPages}
          total={h.data.meta.total}
          onPage={setPage}
        />
      )}
    </section>
  );
}
