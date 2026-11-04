"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import {
  apiContext,
  fmtMoney,
  fmtDate,
  errorMessage,
  type ApiAuth,
} from "@/components/inventory/shared";
import { RANKING, DEBT_STATUS, LOYALTY_TYPE, GENDER_LABEL } from "./shared";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

type CustomerFull = inferRouterOutputs<AppRouter>["customer"]["get"] & {
  group?: { id: number; name: string } | null;
  customerAddresses: Array<{ id: number; address: string; isDefault: boolean }>;
  customerLoyaltyPoints: Array<{
    id: number;
    points: number;
    type: string;
    notes: string | null;
    createdAt: Date;
  }>;
  customerDebts: Array<{
    id: number;
    totalAmount: unknown;
    paidAmount: unknown;
    remainingAmount: unknown;
    dueDate: Date | null;
    status: string;
    notes: string | null;
  }>;
  invoices: Array<{
    id: number;
    invoiceCode: string;
    totalAmount: unknown;
    status: string;
    createdAt: Date;
  }>;
  orders: Array<{
    id: number;
    orderCode: string;
    totalAmount: unknown;
    status: string;
    createdAt: Date;
  }>;
};

type Tab = "info" | "history" | "points" | "debts";

interface Props {
  customerId: number;
  auth: ApiAuth;
}

export function CustomerDetail({ customerId, auth }: Props) {
  const router = useRouter();
  const toast = useToast();
  const ctx = apiContext(auth);

  const [customer, setCustomer] = useState<CustomerFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("info");

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ fullName: "", phone: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Adjust points modal
  const [showPoints, setShowPoints] = useState(false);
  const [pointsForm, setPointsForm] = useState({ points: "", type: "adjust" as "earn" | "redeem" | "adjust", notes: "" });
  const [savingPoints, setSavingPoints] = useState(false);

  // Add debt modal
  const [showDebt, setShowDebt] = useState(false);
  const [debtForm, setDebtForm] = useState({ totalAmount: "", dueDate: "", notes: "" });
  const [savingDebt, setSavingDebt] = useState(false);

  // Pay debt modal
  const [payDebtId, setPayDebtId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payingDebt, setPayingDebt] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trpc.customer.get.query({ id: customerId }, ctx);
      setCustomer(result);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function startEdit() {
    if (!customer) return;
    setEditForm({
      fullName: customer.fullName,
      phone: customer.phone,
      email: customer.email ?? "",
      notes: customer.notes ?? "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!customer) return;
    setSaving(true);
    try {
      await trpc.customer.update.mutate(
        {
          id: customer.id,
          data: {
            fullName: editForm.fullName || undefined,
            phone: editForm.phone || undefined,
            email: editForm.email || undefined,
            notes: editForm.notes || undefined,
          },
        },
        ctx,
      );
      toast.success("Đã cập nhật thông tin");
      setEditing(false);
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjustPoints() {
    if (!customer) return;
    const pts = parseInt(pointsForm.points);
    if (!pts || isNaN(pts)) { toast.error("Vui lòng nhập số điểm hợp lệ"); return; }
    setSavingPoints(true);
    try {
      await trpc.customer.adjustPoints.mutate(
        { customerId: customer.id, data: { points: pts, type: pointsForm.type, notes: pointsForm.notes || undefined } },
        ctx,
      );
      toast.success("Cập nhật điểm thành công");
      setShowPoints(false);
      setPointsForm({ points: "", type: "adjust", notes: "" });
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSavingPoints(false);
    }
  }

  async function handleAddDebt() {
    if (!customer) return;
    const amt = parseFloat(debtForm.totalAmount);
    if (!amt || isNaN(amt)) { toast.error("Vui lòng nhập số tiền hợp lệ"); return; }
    setSavingDebt(true);
    try {
      await trpc.customer.createDebt.mutate(
        { customerId: customer.id, data: { totalAmount: amt, dueDate: debtForm.dueDate || undefined, notes: debtForm.notes || undefined } },
        ctx,
      );
      toast.success("Ghi nhận công nợ thành công");
      setShowDebt(false);
      setDebtForm({ totalAmount: "", dueDate: "", notes: "" });
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSavingDebt(false);
    }
  }

  async function handlePayDebt() {
    if (!customer || !payDebtId) return;
    const amt = parseFloat(payAmount);
    if (!amt || isNaN(amt)) { toast.error("Vui lòng nhập số tiền hợp lệ"); return; }
    setPayingDebt(true);
    try {
      await trpc.customer.payDebt.mutate(
        { customerId: customer.id, data: { debtId: payDebtId, amount: amt } },
        ctx,
      );
      toast.success("Ghi nhận thanh toán công nợ");
      setPayDebtId(null);
      setPayAmount("");
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPayingDebt(false);
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-sm text-slate-400">Đang tải...</div>;
  }
  if (!customer) {
    return <div className="py-20 text-center text-sm text-slate-400">Không tìm thấy khách hàng</div>;
  }

  const rank = RANKING[customer.ranking];
  const initials = customer.fullName
    .split(" ")
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const totalDebt = customer.customerDebts
    .filter((d) => d.status !== "paid")
    .reduce((s, d) => s + Number(d.remainingAmount), 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => router.push("/crm")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Danh sách khách hàng
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex min-h-[500px] flex-col md:flex-row">
          {/* Left panel — profile */}
          <div className="w-full border-b border-slate-200 p-6 md:w-80 md:flex-shrink-0 md:border-r md:border-b-0">
            {/* Avatar + name */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-2xl font-bold text-blue-700">
                {initials}
              </div>
              {editing ? (
                <input
                  className="w-full rounded-lg border border-blue-300 px-3 py-1.5 text-center text-base font-semibold focus:outline-none"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              ) : (
                <div className="text-lg font-bold text-slate-800">{customer.fullName}</div>
              )}
              <div className="mt-1 text-sm text-slate-500">{customer.phone}</div>
              {rank && (
                <span className={`mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${rank.className}`}>
                  {rank.label}
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="mb-5 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-lg font-bold text-slate-800">
                  {customer.totalPoints.toLocaleString("vi-VN")}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">Điểm tích lũy</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-center">
                <div className="text-lg font-bold text-slate-800">
                  {fmtMoney(customer.totalSpent)}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">Tổng chi tiêu</div>
              </div>
              {totalDebt > 0 && (
                <div className="col-span-2 rounded-lg bg-red-50 p-3 text-center">
                  <div className="text-lg font-bold text-red-600">{fmtMoney(totalDebt)}</div>
                  <div className="mt-0.5 text-xs text-slate-500">Công nợ còn lại</div>
                </div>
              )}
            </div>

            {/* Edit controls */}
            {editing ? (
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {saving ? "Lưu..." : "Lưu"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  Huỷ
                </button>
              </div>
            ) : (
              <button
                onClick={startEdit}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <Edit2 className="h-4 w-4" />
                Chỉnh sửa
              </button>
            )}

            {/* Basic info */}
            <div className="space-y-0 divide-y divide-slate-100 text-sm">
              <div className="flex py-2.5">
                <span className="w-28 flex-shrink-0 text-slate-500">Mã KH</span>
                <span className="font-medium">{customer.code}</span>
              </div>
              {editing ? (
                <div className="flex py-2.5">
                  <span className="w-28 flex-shrink-0 text-slate-500">SĐT</span>
                  <input
                    className="flex-1 rounded border border-blue-300 px-2 py-0.5 text-sm focus:outline-none"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="flex py-2.5">
                  <span className="w-28 flex-shrink-0 text-slate-500">SĐT</span>
                  <span>{customer.phone}</span>
                </div>
              )}
              {editing ? (
                <div className="flex py-2.5">
                  <span className="w-28 flex-shrink-0 text-slate-500">Email</span>
                  <input
                    type="email"
                    className="flex-1 rounded border border-blue-300 px-2 py-0.5 text-sm focus:outline-none"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              ) : (
                <div className="flex py-2.5">
                  <span className="w-28 flex-shrink-0 text-slate-500">Email</span>
                  <span>{customer.email ?? "—"}</span>
                </div>
              )}
              <div className="flex py-2.5">
                <span className="w-28 flex-shrink-0 text-slate-500">Giới tính</span>
                <span>{customer.gender ? GENDER_LABEL[customer.gender] : "—"}</span>
              </div>
              <div className="flex py-2.5">
                <span className="w-28 flex-shrink-0 text-slate-500">Sinh nhật</span>
                <span>{customer.birthday ? fmtDate(customer.birthday) : "—"}</span>
              </div>
              <div className="flex py-2.5">
                <span className="w-28 flex-shrink-0 text-slate-500">Nhóm</span>
                <span>{customer.group?.name ?? "—"}</span>
              </div>
              <div className="flex py-2.5">
                <span className="w-28 flex-shrink-0 text-slate-500">Ngày tạo</span>
                <span>{fmtDate(customer.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Right panel — tabs */}
          <div className="flex-1 p-6">
            {/* Tabs */}
            <div className="mb-5 flex border-b border-slate-200">
              {(["info", "history", "points", "debts"] as Tab[]).map((t) => {
                const labels: Record<Tab, string> = {
                  info: "Thông tin",
                  history: "Lịch sử mua",
                  points: "Điểm thưởng",
                  debts: "Công nợ",
                };
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      tab === t
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {labels[t]}
                  </button>
                );
              })}
            </div>

            {/* Tab: Info */}
            {tab === "info" && (
              <div>
                <div className="text-sm font-medium text-slate-700 mb-3">Ghi chú</div>
                {editing ? (
                  <textarea
                    className="w-full rounded-lg border border-blue-300 px-3 py-2 text-sm focus:outline-none"
                    rows={4}
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Nhập ghi chú..."
                  />
                ) : (
                  <p className="text-sm text-slate-600">{customer.notes || "Không có ghi chú"}</p>
                )}

                {customer.customerAddresses.length > 0 && (
                  <div className="mt-5">
                    <div className="text-sm font-medium text-slate-700 mb-2">Địa chỉ</div>
                    {customer.customerAddresses.map((a) => (
                      <div key={a.id} className="text-sm text-slate-600 flex items-center gap-2 py-1.5 border-b border-slate-50">
                        {a.address}
                        {a.isDefault && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">Mặc định</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Purchase History */}
            {tab === "history" && (
              <div>
                {customer.invoices.length === 0 && customer.orders.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">Chưa có lịch sử mua hàng</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-2 text-left font-medium text-slate-500">Mã</th>
                        <th className="py-2 text-left font-medium text-slate-500">Loại</th>
                        <th className="py-2 text-right font-medium text-slate-500">Tổng tiền</th>
                        <th className="py-2 text-left font-medium text-slate-500">Trạng thái</th>
                        <th className="py-2 text-left font-medium text-slate-500">Ngày</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.invoices.map((inv) => (
                        <tr key={`inv-${inv.id}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="py-2 font-medium text-blue-600">{inv.invoiceCode}</td>
                          <td className="py-2"><span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">Hóa đơn</span></td>
                          <td className="py-2 text-right font-medium">{fmtMoney(inv.totalAmount)}</td>
                          <td className="py-2 text-slate-600">{inv.status}</td>
                          <td className="py-2 text-slate-500">{fmtDate(inv.createdAt)}</td>
                        </tr>
                      ))}
                      {customer.orders.map((ord) => (
                        <tr key={`ord-${ord.id}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="py-2 font-medium text-blue-600">{ord.orderCode}</td>
                          <td className="py-2"><span className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">Đơn hàng</span></td>
                          <td className="py-2 text-right font-medium">{fmtMoney(ord.totalAmount)}</td>
                          <td className="py-2 text-slate-600">{ord.status}</td>
                          <td className="py-2 text-slate-500">{fmtDate(ord.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: Loyalty Points */}
            {tab === "points" && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm text-slate-600">
                    Tổng điểm: <span className="text-lg font-bold text-blue-600">{customer.totalPoints.toLocaleString("vi-VN")}</span>
                  </div>
                  <button
                    onClick={() => setShowPoints(true)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Điều chỉnh điểm
                  </button>
                </div>
                {customer.customerLoyaltyPoints.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">Chưa có lịch sử điểm</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-2 text-left font-medium text-slate-500">Loại</th>
                        <th className="py-2 text-right font-medium text-slate-500">Điểm</th>
                        <th className="py-2 text-left font-medium text-slate-500">Ghi chú</th>
                        <th className="py-2 text-left font-medium text-slate-500">Ngày</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.customerLoyaltyPoints.map((p) => {
                        const lt = LOYALTY_TYPE[p.type];
                        const isPositive = p.points > 0;
                        return (
                          <tr key={p.id} className="border-b border-slate-50">
                            <td className="py-2">{lt?.label ?? p.type}</td>
                            <td className={`py-2 text-right font-semibold ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                              {isPositive ? "+" : ""}{p.points.toLocaleString("vi-VN")}
                            </td>
                            <td className="py-2 text-slate-500">{p.notes ?? "—"}</td>
                            <td className="py-2 text-slate-500">{fmtDate(p.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: Debts */}
            {tab === "debts" && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex gap-4 text-sm">
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
                      <div className="text-lg font-bold text-red-500">{fmtMoney(totalDebt)}</div>
                      <div className="text-xs text-slate-500">Còn nợ</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDebt(true)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Ghi nợ mới
                  </button>
                </div>
                {customer.customerDebts.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">Không có công nợ</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="py-2 text-right font-medium text-slate-500">Tổng nợ</th>
                        <th className="py-2 text-right font-medium text-slate-500">Đã trả</th>
                        <th className="py-2 text-right font-medium text-slate-500">Còn lại</th>
                        <th className="py-2 text-left font-medium text-slate-500">Hạn</th>
                        <th className="py-2 text-left font-medium text-slate-500">Trạng thái</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.customerDebts.map((d) => {
                        const ds = DEBT_STATUS[d.status];
                        return (
                          <tr key={d.id} className="border-b border-slate-50">
                            <td className="py-2 text-right font-medium">{fmtMoney(d.totalAmount)}</td>
                            <td className="py-2 text-right text-emerald-600">{fmtMoney(d.paidAmount)}</td>
                            <td className="py-2 text-right font-semibold text-red-500">{fmtMoney(d.remainingAmount)}</td>
                            <td className="py-2 text-slate-500">{d.dueDate ? fmtDate(d.dueDate) : "—"}</td>
                            <td className="py-2">
                              {ds && (
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ds.className}`}>
                                  {ds.label}
                                </span>
                              )}
                            </td>
                            <td className="py-2">
                              {d.status !== "paid" && (
                                <button
                                  onClick={() => { setPayDebtId(d.id); setPayAmount(""); }}
                                  className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                                >
                                  Thanh toán
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Adjust Points Modal */}
      {showPoints && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold">Điều chỉnh điểm thưởng</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Loại</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                  value={pointsForm.type}
                  onChange={(e) => setPointsForm((f) => ({ ...f, type: e.target.value as typeof f.type }))}
                >
                  <option value="earn">Tích điểm (+)</option>
                  <option value="redeem">Đổi điểm (-)</option>
                  <option value="adjust">Điều chỉnh thủ công</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Số điểm *</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                  placeholder="Nhập số điểm"
                  value={pointsForm.points}
                  onChange={(e) => setPointsForm((f) => ({ ...f, points: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Ghi chú</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                  placeholder="Lý do điều chỉnh"
                  value={pointsForm.notes}
                  onChange={(e) => setPointsForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowPoints(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Huỷ</button>
              <button onClick={() => void handleAdjustPoints()} disabled={savingPoints} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {savingPoints ? "Đang lưu..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Debt Modal */}
      {showDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold">Ghi nhận công nợ mới</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Số tiền nợ *</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                  placeholder="Nhập số tiền"
                  value={debtForm.totalAmount}
                  onChange={(e) => setDebtForm((f) => ({ ...f, totalAmount: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Hạn thanh toán</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                  value={debtForm.dueDate}
                  onChange={(e) => setDebtForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Ghi chú</label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                  placeholder="Mô tả công nợ"
                  value={debtForm.notes}
                  onChange={(e) => setDebtForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowDebt(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Huỷ</button>
              <button onClick={() => void handleAddDebt()} disabled={savingDebt} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {savingDebt ? "Đang lưu..." : "Ghi nhận"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Debt Modal */}
      {payDebtId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold">Ghi nhận thanh toán nợ</h3>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Số tiền thanh toán *</label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none"
                placeholder="Nhập số tiền"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setPayDebtId(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Huỷ</button>
              <button onClick={() => void handlePayDebt()} disabled={payingDebt} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {payingDebt ? "Đang lưu..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
