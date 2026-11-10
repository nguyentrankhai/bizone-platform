"use client";

import { useState } from "react";
import { Download, Minus, Plus, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  downloadCsv,
  errorMessage,
  fmtMoney,
  type ApiAuth,
} from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  btnPrimary,
  btnSecondary,
  inputAutoCls,
  inputCls,
  useLoad,
} from "@/components/staff/shared";
import { Pager, fmtDay } from "@/components/suppliers/shared";
import { KpiTile } from "@/components/reports/shared";
import { fmtDT } from "@/components/marketing/shared";
import { cn } from "@/lib/utils";
import { RecordForm, type RecordRow } from "./RecordForm";
import {
  AccountingHeader,
  PeriodPicker,
  flattenCategories,
  signed,
  useCategories,
  useFundOptions,
  usePeriod,
} from "./shared";

type Status = "active" | "cancelled" | "all";

export function RecordList({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const period = usePeriod("thisMonth");
  const [page, setPage] = useState(1);
  const [type, setType] = useState<"" | "revenue" | "expense">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [fundId, setFundId] = useState<number | "">("");
  const [status, setStatus] = useState<Status>("active");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<{
    type: "revenue" | "expense";
    editing: RecordRow | null;
  } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const funds = useFundOptions(auth);
  const cats = useCategories(auth);
  const flat = flattenCategories(cats.data ?? []);

  const filter = {
    from: period.range.from,
    to: period.range.to,
    status,
    ...(type ? { type } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(fundId ? { fundId } : {}),
    ...(query ? { search: query } : {}),
  };
  const input = { ...filter, page, pageSize: 20 };
  const list = useLoad(JSON.stringify(input), () => trpc.accounting.records.query(input, ctx));
  const rows = list.data?.items ?? [];
  const totals = list.data?.totals;

  async function exportCsv() {
    setExporting(true);
    try {
      const all: RecordRow[] = [];
      for (let p = 1; p <= 50; p++) {
        const res = await trpc.accounting.records.query({ ...filter, page: p, pageSize: 100 }, ctx);
        all.push(...res.items);
        if (p >= res.meta.totalPages) break;
      }
      downloadCsv(`so-thu-chi_${period.range.from}_${period.range.to}.csv`, [
        [
          "Số phiếu",
          "Ngày",
          "Loại",
          "Danh mục",
          "Quỹ",
          "Người nộp/nhận",
          "Diễn giải",
          "Thu",
          "Chi",
          "Trạng thái",
        ],
        ...all.map((r) => [
          r.code ?? "",
          r.date,
          r.type === "revenue" ? "Thu" : "Chi",
          r.category.name,
          r.fund?.name ?? "",
          r.partnerName ?? "",
          r.description ?? "",
          r.type === "revenue" ? r.amount : "",
          r.type === "expense" ? r.amount : "",
          r.status === "cancelled" ? "Đã huỷ" : "",
        ]),
      ]);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  const reloadAll = () => {
    list.reload();
    funds.reload();
  };

  return (
    <div className="space-y-5">
      <AccountingHeader
        title="Kế toán & Tài chính"
        subtitle="Sổ thu chi: phiếu thu (tiền vào quỹ) và phiếu chi (tiền ra khỏi quỹ)"
        actions={
          <>
            <button
              type="button"
              className={cn(btnPrimary, "bg-emerald-600 hover:bg-emerald-700")}
              onClick={() => setForm({ type: "revenue", editing: null })}
            >
              <Plus className="h-4 w-4" /> Lập phiếu thu
            </button>
            <button
              type="button"
              className={cn(btnPrimary, "bg-red-600 hover:bg-red-700")}
              onClick={() => setForm({ type: "expense", editing: null })}
            >
              <Minus className="h-4 w-4" /> Lập phiếu chi
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker period={period} />
        <select
          className={inputAutoCls}
          value={type}
          aria-label="Loại phiếu"
          onChange={(e) => {
            setPage(1);
            setType(e.target.value as typeof type);
          }}
        >
          <option value="">Thu &amp; chi</option>
          <option value="revenue">Phiếu thu</option>
          <option value="expense">Phiếu chi</option>
        </select>
        <select
          className={cn(inputAutoCls, "max-w-60")}
          value={categoryId}
          aria-label="Danh mục"
          onChange={(e) => {
            setPage(1);
            setCategoryId(e.target.value ? Number(e.target.value) : "");
          }}
        >
          <option value="">Mọi danh mục</option>
          {flat
            .filter((c) => !type || c.type === "both" || c.type === type)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
        </select>
        <select
          className={inputAutoCls}
          value={fundId}
          aria-label="Quỹ"
          onChange={(e) => {
            setPage(1);
            setFundId(e.target.value ? Number(e.target.value) : "");
          }}
        >
          <option value="">Mọi quỹ</option>
          {(funds.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          className={inputAutoCls}
          value={status}
          aria-label="Trạng thái"
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as Status);
          }}
        >
          <option value="active">Hiệu lực</option>
          <option value="cancelled">Đã huỷ</option>
          <option value="all">Tất cả</option>
        </select>
        <form
          className="relative min-w-48 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Số phiếu, diễn giải, người nộp/nhận (Enter)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm phiếu"
          />
        </form>
        <button type="button" className={btnSecondary} onClick={exportCsv} disabled={exporting}>
          <Download className="h-4 w-4" /> {exporting ? "Đang xuất…" : "Xuất CSV"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Tổng thu" value={fmtMoney(totals?.revenue ?? 0)} />
        <KpiTile label="Tổng chi" value={fmtMoney(totals?.expense ?? 0)} />
        <KpiTile label="Chênh lệch thu − chi" value={signed(totals?.net ?? 0)} />
      </div>

      <ErrorBox message={list.error} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">Số phiếu</th>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Danh mục</th>
                <th className="px-4 py-3">Diễn giải</th>
                <th className="px-4 py-3">Quỹ</th>
                <th className="px-4 py-3 text-right">Thu</th>
                <th className="px-4 py-3 text-right">Chi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    "cursor-pointer hover:bg-slate-50",
                    r.status === "cancelled" && "text-slate-400 line-through",
                  )}
                  onClick={() => setDetailId(r.id)}
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    <span className={r.type === "revenue" ? "text-emerald-700" : "text-red-600"}>
                      {r.code}
                    </span>
                    {r.sourceLabel && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-500 no-underline">
                        Tự động
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDay(r.date)}</td>
                  <td className="px-4 py-3">{r.category.name}</td>
                  <td className="max-w-80 px-4 py-3">
                    <p className="truncate">{r.description || "—"}</p>
                    {r.partnerName && (
                      <p className="truncate text-xs text-slate-500">{r.partnerName}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.fund?.name ?? <span className="text-slate-400">Không qua quỹ</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-emerald-700 tabular-nums">
                    {r.type === "revenue" ? fmtMoney(r.amount) : ""}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-red-600 tabular-nums">
                    {r.type === "expense" ? fmtMoney(r.amount) : ""}
                  </td>
                </tr>
              ))}
              {!list.loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Chưa có phiếu thu chi trong khoảng này
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {list.data && (
          <Pager
            page={page}
            totalPages={list.data.meta.totalPages}
            total={list.data.meta.total}
            onPage={setPage}
          />
        )}
      </div>

      {form && (
        <RecordForm
          key={`${form.type}:${form.editing?.id ?? "new"}`}
          auth={auth}
          open
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reloadAll();
          }}
          initialType={form.type}
          editing={form.editing}
          funds={funds.data ?? []}
          categories={cats.data ?? []}
        />
      )}
      {detailId !== null && (
        <RecordDetail
          auth={auth}
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(r) => {
            setDetailId(null);
            setForm({ type: r.type, editing: r });
          }}
          onChanged={reloadAll}
        />
      )}
    </div>
  );
}

function RecordDetail({
  auth,
  id,
  onClose,
  onEdit,
  onChanged,
}: {
  auth: ApiAuth;
  id: number;
  onClose: () => void;
  onEdit: (r: RecordRow) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const ctx = apiContext(auth);
  const rec = useLoad(`record:${id}`, () => trpc.accounting.record.query({ id }, ctx));
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const r = rec.data;

  async function cancel() {
    if (!reason.trim()) return setError("Nhập lý do huỷ");
    try {
      await trpc.accounting.cancelRecord.mutate({ id, reason }, ctx);
      toast.success(`Đã huỷ phiếu ${r?.code}`);
      onChanged();
      rec.reload();
      setCancelling(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={r ? `${r.type === "revenue" ? "Phiếu thu" : "Phiếu chi"} ${r.code}` : "Phiếu thu chi"}
      size="lg"
    >
      <ErrorBox message={rec.error} />
      {r && (
        <div className="space-y-4 text-sm">
          {r.status === "cancelled" && (
            <div className="rounded-md bg-slate-100 px-3 py-2 text-slate-600">
              Đã huỷ {fmtDT(r.cancelledAt)} bởi {r.cancelledBy ?? "—"}: {r.cancelReason}
            </div>
          )}
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Item label="Số tiền">
              <span
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  r.type === "revenue" ? "text-emerald-700" : "text-red-600",
                )}
              >
                {r.type === "revenue" ? "+" : "−"}
                {fmtMoney(r.amount)}
              </span>
            </Item>
            <Item label="Ngày chứng từ">{fmtDay(r.date)}</Item>
            <Item label="Danh mục">{r.category.name}</Item>
            <Item label="Quỹ">{r.fund?.name ?? "Không qua quỹ"}</Item>
            <Item label={r.type === "revenue" ? "Người nộp" : "Người nhận"}>
              {r.partnerName || "—"}
            </Item>
            <Item label="Chi nhánh">{r.branch?.name ?? "Toàn cửa hàng"}</Item>
            <Item label="Người lập">
              {r.createdBy ?? "—"} · {fmtDT(r.createdAt)}
            </Item>
            {r.sourceLabel && <Item label="Nguồn">{r.sourceLabel} (phiếu tự động)</Item>}
          </dl>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">Diễn giải</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{r.description || "—"}</p>
          </div>
          {r.movements.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500 uppercase">Biến động quỹ</p>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {r.movements.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="text-slate-500">{fmtDT(m.at)}</span>
                    <span className="flex-1 text-slate-700">{m.description}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        m.direction === "in" ? "text-emerald-700" : "text-red-600",
                      )}
                    >
                      {m.direction === "in" ? "+" : "−"}
                      {fmtMoney(m.amount)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {m.fundName}: {fmtMoney(m.balanceAfter)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cancelling && (
            <Field label="Lý do huỷ phiếu" htmlFor="cancel-reason">
              <input
                id="cancel-reason"
                className={inputCls}
                value={reason}
                autoFocus
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          <ErrorBox message={error} />
          <div className="flex flex-wrap justify-end gap-2">
            {r.editable && !cancelling && (
              <>
                <button type="button" className={btnSecondary} onClick={() => setCancelling(true)}>
                  Huỷ phiếu
                </button>
                <button type="button" className={btnPrimary} onClick={() => onEdit(r)}>
                  Sửa phiếu
                </button>
              </>
            )}
            {cancelling && (
              <>
                <button type="button" className={btnSecondary} onClick={() => setCancelling(false)}>
                  Thôi
                </button>
                <button
                  type="button"
                  className={cn(btnPrimary, "bg-red-600 hover:bg-red-700")}
                  onClick={cancel}
                >
                  Xác nhận huỷ phiếu
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}
