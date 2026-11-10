"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockOpen, Lock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { NumericKeypad } from "@/components/forms/NumericKeypad";
import { StatusBadge } from "@/components/inventory/StatusBadge";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtMoney,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { ANY_METHOD_LABEL } from "./PaymentModal";

type Session = NonNullable<RouterOutputs["pos"]["currentSession"]>;
type Summary = RouterOutputs["pos"]["sessionSummary"];
type Branch = RouterOutputs["pos"]["branches"][number];
type SessionRow = RouterOutputs["pos"]["sessions"]["items"][number];

/** Mở ca / tổng kết ca / khóa ca (đối soát tiền mặt cuối ca) */
export function SessionClient({ auth }: { auth: ApiAuth }) {
  const router = useRouter();
  const toast = useToast();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [closed, setClosed] = useState<Summary | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [cash, setCash] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<SessionRow[]>([]);

  const load = useCallback(async () => {
    try {
      const ctx = apiContext(auth);
      const [s, b, h] = await Promise.all([
        trpc.pos.currentSession.query(undefined, ctx),
        trpc.pos.branches.query(undefined, ctx),
        trpc.pos.sessions.query({ page: 1, pageSize: 10 }, ctx),
      ]);
      setSession(s);
      setBranches(b);
      setBranchId((cur) => cur || String(b[0]?.id ?? ""));
      setHistory(h.items);
      setSummary(s ? await trpc.pos.sessionSummary.query({ id: s.id }, ctx) : null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function open() {
    setBusy(true);
    try {
      await trpc.pos.openSession.mutate(
        { branchId: Number(branchId), openingBalance: Number(cash) },
        apiContext(auth),
      );
      toast.success("Đã mở ca");
      router.push("/pos");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!session || !summary) return;
    const diff = Number(cash) - summary.expectedCash;
    if (
      diff !== 0 &&
      !confirm(
        `Tiền thực tế ${diff > 0 ? "dư" : "thiếu"} ${fmtMoney(Math.abs(diff))} so với dự kiến. Khóa ca?`,
      )
    )
      return;
    setBusy(true);
    try {
      const final = await trpc.pos.closeSession.mutate(
        { sessionId: session.id, actualClosingBalance: Number(cash), notes: notes.trim() || null },
        apiContext(auth),
      );
      setClosed(final);
      setCash("0");
      setNotes("");
      toast.success("Đã khóa ca");
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const diff = summary ? Number(cash) - summary.expectedCash : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4">
        <Link
          href="/pos"
          aria-label="Về màn hình bán hàng"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">Ca bán hàng</h1>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-[1fr_340px]">
        {session === undefined ? (
          <p className="text-gray-400">Đang tải...</p>
        ) : session === null ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            {closed && <SummaryCard title="Kết quả ca vừa khóa" summary={closed} />}
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <LockOpen className="h-5 w-5 text-blue-600" /> Mở ca mới
            </h2>
            {branches.length === 0 ? (
              <p className="text-sm text-amber-700">
                Chưa có chi nhánh đang hoạt động — tạo chi nhánh và kho trước khi bán hàng.
              </p>
            ) : (
              <>
                <label className="mb-4 block text-sm font-medium text-gray-700">
                  Chi nhánh
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="mt-1 h-12 w-full rounded-lg border border-gray-300 px-3 text-base"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b._count.warehouses === 0 ? " (chưa có kho)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <CashInput label="Tiền đầu ca trong két" value={cash} onChange={setCash} />
                <button
                  onClick={open}
                  disabled={busy || !branchId}
                  className="mt-4 h-14 w-full rounded-xl bg-blue-600 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  {busy ? "Đang mở..." : "Mở ca"}
                </button>
              </>
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <Lock className="h-5 w-5 text-blue-600" /> Khóa ca #{session.id} —{" "}
              {session.branch.name}
            </h2>
            <p className="mb-4 text-sm text-gray-500">Mở lúc {fmtDate(session.openedAt, true)}</p>
            {summary && <SummaryCard title="Tổng kết ca" summary={summary} />}
            <CashInput label="Tiền mặt thực tế đếm được" value={cash} onChange={setCash} />
            {summary && (
              <p
                className={cn(
                  "mt-2 text-sm font-medium",
                  diff === 0 ? "text-emerald-600" : "text-red-600",
                )}
                data-testid="close-diff"
              >
                Chênh lệch so với dự kiến: {diff > 0 ? "+" : ""}
                {fmtMoney(diff)}
              </p>
            )}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú (lý do chênh lệch...)"
              aria-label="Ghi chú khóa ca"
              rows={2}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-3">
              <Link
                href="/pos"
                className="flex h-14 flex-1 items-center justify-center rounded-xl border border-gray-300 font-medium"
              >
                Tiếp tục bán
              </Link>
              <button
                onClick={close}
                disabled={busy}
                className="h-14 flex-1 rounded-xl bg-red-600 text-lg font-bold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {busy ? "Đang khóa..." : "Khóa ca"}
              </button>
            </div>
          </section>
        )}

        <aside className="rounded-2xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Ca gần đây</h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">Chưa có ca nào</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {history.map((h) => (
                <li key={h.id} className="py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      Ca #{h.id} · {h.branch.name}
                    </span>
                    <StatusBadge status={h.status === "open" ? "in_progress" : "completed"} />
                  </div>
                  <p className="text-xs text-gray-500">
                    {h.user.fullName} · {fmtDate(h.openedAt, true)} · {h._count.invoices} HĐ
                    {h.difference !== null && Number(h.difference) !== 0
                      ? ` · lệch ${fmtMoney(h.difference)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}

function CashInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">
        {label}
        <input
          value={Number(value || 0).toLocaleString("vi-VN")}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "") || "0")}
          inputMode="numeric"
          aria-label={label}
          className="mt-1 h-14 w-full rounded-xl border border-gray-300 px-4 text-right text-2xl font-bold outline-none focus:border-blue-500"
        />
      </label>
      <NumericKeypad value={value} onChange={onChange} maxLength={11} className="mt-3" />
    </div>
  );
}

function SummaryCard({ title, summary }: { title: string; summary: Summary }) {
  const rows: [string, string][] = [
    ["Tiền đầu ca", fmtMoney(summary.openingBalance)],
    [
      "Số hóa đơn",
      `${summary.invoiceCount}${summary.cancelledCount ? ` (hủy ${summary.cancelledCount})` : ""}`,
    ],
    ["Doanh thu", fmtMoney(summary.revenue)],
    ...Object.entries(summary.received).map(
      ([m, v]) => [`  • ${ANY_METHOD_LABEL[m] ?? m}`, fmtMoney(v)] as [string, string],
    ),
    ...Object.entries(summary.credits).map(
      ([m, v]) =>
        [`  • ${ANY_METHOD_LABEL[m] ?? m} (không thu tiền)`, fmtMoney(v)] as [string, string],
    ),
    ["Tiền thối", `−${fmtMoney(summary.change)}`],
  ];
  if (summary.refundTotal > 0) rows.push(["Hoàn trả", `−${fmtMoney(summary.refundTotal)}`]);
  // P4.5: pre-order deposits are cash in the drawer but not revenue yet
  if (summary.depositTotal > 0) {
    rows.push(["Nhận cọc đặt trước", fmtMoney(summary.depositTotal)]);
    for (const [m, v] of Object.entries(summary.deposits))
      rows.push([`  • ${ANY_METHOD_LABEL[m] ?? m}`, fmtMoney(v)]);
  }
  if (summary.depositRefundTotal > 0)
    rows.push(["Hoàn cọc", `−${fmtMoney(summary.depositRefundTotal)}`]);
  rows.push(["Tiền mặt dự kiến trong két", fmtMoney(summary.expectedCash)]);
  if (summary.difference !== null) rows.push(["Chênh lệch khi khóa", fmtMoney(summary.difference)]);
  const unused = summary.payhubUnused;
  return (
    <div className="mb-5 rounded-xl bg-gray-50 p-4" data-testid="session-summary">
      <p className="mb-2 text-sm font-semibold text-gray-700">{title}</p>
      <dl className="space-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="whitespace-pre text-gray-600">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {unused.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800" role="alert">
          {unused.length} thanh toán Payment Hub đã nhận tiền nhưng chưa gắn hoá đơn (
          {unused.map((u) => `${u.txnCode}: ${fmtMoney(u.amount)}`).join(", ")}) — đối soát / hoàn
          tiền cho khách.
        </p>
      )}
    </div>
  );
}
