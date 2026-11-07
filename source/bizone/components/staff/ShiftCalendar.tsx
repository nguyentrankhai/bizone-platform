"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import {
  ErrorBox,
  Field,
  addDays,
  btnPrimary,
  btnSecondary,
  dayLabel,
  inputCls,
  useLoad,
  vnToday,
  weekStart,
} from "./shared";

type Calendar = RouterOutputs["staff"]["shift"]["calendar"];
type ShiftRow = RouterOutputs["staff"]["shift"]["list"][number];

const SHIFT_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-amber-50 text-amber-800 border-amber-200",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-rose-50 text-rose-700 border-rose-200",
];

function ShiftForm({
  auth,
  shift,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  shift: ShiftRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: shift?.name ?? "",
    startTime: shift?.startTime ?? "08:00",
    endTime: shift?.endTime ?? "16:00",
    description: shift?.description ?? "",
    isActive: shift?.isActive ?? true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ctx = apiContext(auth);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={shift ? `Sửa ca — ${shift.name}` : "Tạo ca làm việc"}
      footer={
        <>
          {shift && (
            <button
              className={`${btnSecondary} text-red-600`}
              disabled={busy}
              onClick={() => run(() => trpc.staff.shift.delete.mutate({ id: shift.id }, ctx))}
            >
              Xoá ca
            </button>
          )}
          <div className="flex-1" />
          <button className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button
            className={btnPrimary}
            disabled={busy || !form.name}
            onClick={() =>
              run(() =>
                shift
                  ? trpc.staff.shift.update.mutate({ id: shift.id, ...form }, ctx)
                  : trpc.staff.shift.create.mutate(form, ctx),
              )
            }
          >
            Lưu
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorBox message={error} />
        <Field label="Tên ca *" htmlFor="sh-name">
          <input
            id="sh-name"
            className={inputCls}
            value={form.name}
            placeholder="Ca sáng"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bắt đầu" htmlFor="sh-start">
            <input
              id="sh-start"
              type="time"
              className={inputCls}
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </Field>
          <Field label="Kết thúc" htmlFor="sh-end" hint="Sớm hơn giờ bắt đầu = ca qua đêm">
            <input
              id="sh-end"
              type="time"
              className={inputCls}
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Mô tả" htmlFor="sh-desc">
          <input
            id="sh-desc"
            className={inputCls}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-5 w-5 accent-blue-600"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Đang sử dụng
        </label>
      </div>
    </Modal>
  );
}

function AssignModal({
  auth,
  calendar,
  initial,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  calendar: Calendar;
  initial: { userId: number; date: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [shiftId, setShiftId] = useState<number | "">(calendar.shifts[0]?.id ?? "");
  const [dates, setDates] = useState<string[]>([initial.date]);
  const [userIds, setUserIds] = useState<number[]>([initial.userId]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  async function save() {
    if (!shiftId) return;
    setBusy(true);
    setError("");
    try {
      await trpc.staff.shift.assign.mutate({ shiftId, userIds, dates }, apiContext(auth));
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Phân ca"
      size="lg"
      footer={
        <>
          <button className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button
            className={btnPrimary}
            disabled={busy || !shiftId || !dates.length || !userIds.length}
            onClick={save}
          >
            Phân {userIds.length * dates.length} lượt
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorBox message={error} />
        {calendar.shifts.length === 0 ? (
          <p className="text-sm text-amber-700">Chưa có ca làm việc — tạo ca trước.</p>
        ) : (
          <Field label="Ca" htmlFor="as-shift">
            <select
              id="as-shift"
              className={inputCls}
              value={shiftId}
              onChange={(e) => setShiftId(Number(e.target.value))}
            >
              {calendar.shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime}–{s.endTime})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Ngày">
          <div className="flex flex-wrap gap-2">
            {calendar.days.map((d) => (
              <label
                key={d}
                className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={dates.includes(d)}
                  onChange={() => setDates(toggle(dates, d))}
                />
                {dayLabel(d)}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Nhân viên">
          <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
            {calendar.staff.map((u) => (
              <label
                key={u.id}
                className="flex h-10 items-center gap-2 rounded px-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-blue-600"
                  checked={userIds.includes(u.id)}
                  onChange={() => setUserIds(toggle(userIds, u.id))}
                />
                {u.fullName}
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

export function ShiftCalendar({ auth }: { auth: ApiAuth }) {
  const [from, setFrom] = useState(() => weekStart(vnToday()));
  const to = addDays(from, 6);
  const [editingShift, setEditingShift] = useState<ShiftRow | null | "new">(null);
  const [assigning, setAssigning] = useState<{ userId: number; date: string } | null>(null);
  const [error, setError] = useState("");
  const ctx = apiContext(auth);

  const cal = useLoad(JSON.stringify([from, auth]), () =>
    trpc.staff.shift.calendar.query({ from, to }, ctx),
  );
  const shifts = useLoad(JSON.stringify(["shifts", auth]), () =>
    trpc.staff.shift.list.query({ includeInactive: true }, ctx),
  );
  const color = (shiftId: number) => {
    const idx = (shifts.data ?? []).findIndex((s) => s.id === shiftId);
    return SHIFT_COLORS[(idx < 0 ? 0 : idx) % SHIFT_COLORS.length];
  };

  async function unassign(id: number) {
    setError("");
    try {
      await trpc.staff.shift.unassign.mutate({ id }, ctx);
      cal.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const data = cal.data;
  const today = vnToday();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold text-slate-800">Danh sách ca</h2>
          <button className={btnPrimary} onClick={() => setEditingShift("new")}>
            + Tạo ca
          </button>
        </div>
        <ErrorBox message={shifts.error} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(shifts.data ?? []).map((s) => (
            <button
              key={s.id}
              onClick={() => setEditingShift(s)}
              className={`rounded-lg border p-3 text-left ${color(s.id)} ${s.isActive ? "" : "opacity-50"}`}
            >
              <p className="font-semibold">{s.name}</p>
              <p className="text-sm">
                {s.startTime} – {s.endTime}
                {s.endTime <= s.startTime && " (qua đêm)"}
              </p>
              <p className="mt-1 text-xs opacity-80">
                {s.isActive ? `${s._count.shiftAssignments} lượt đã phân` : "Ngừng sử dụng"}
              </p>
            </button>
          ))}
          {shifts.data?.length === 0 && (
            <p className="text-sm text-slate-500">Chưa có ca nào — bấm “Tạo ca”.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold text-slate-800">
            Lịch tuần {dayLabel(from).slice(3)} – {dayLabel(to).slice(3)}
          </h2>
          <button
            className={btnSecondary}
            onClick={() => setFrom(addDays(from, -7))}
            aria-label="Tuần trước"
          >
            ‹
          </button>
          <button className={btnSecondary} onClick={() => setFrom(weekStart(vnToday()))}>
            Tuần này
          </button>
          <button
            className={btnSecondary}
            onClick={() => setFrom(addDays(from, 7))}
            aria-label="Tuần sau"
          >
            ›
          </button>
        </div>
        <ErrorBox message={cal.error || error} />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] table-fixed text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-44 px-3 py-2 text-left font-medium">Nhân viên</th>
                {(data?.days ?? []).map((d) => (
                  <th
                    key={d}
                    className={`px-2 py-2 text-center font-medium ${d === today ? "text-primary" : ""}`}
                  >
                    {dayLabel(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cal.loading && !data && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Đang tải...
                  </td>
                </tr>
              )}
              {data?.staff.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 align-top">
                  <td className="truncate px-3 py-2 font-medium text-slate-700">{u.fullName}</td>
                  {data.days.map((d) => {
                    const cells = data.assignments.filter((a) => a.userId === u.id && a.date === d);
                    return (
                      <td key={d} className={`px-1.5 py-1.5 ${d === today ? "bg-blue-50/40" : ""}`}>
                        <div className="space-y-1">
                          {cells.map((a) => (
                            <div
                              key={a.id}
                              className={`group flex items-center justify-between rounded border px-1.5 py-1 text-xs ${color(a.shift.id)}`}
                            >
                              <span
                                className="truncate"
                                title={`${a.shift.startTime}–${a.shift.endTime}`}
                              >
                                {a.shift.name}
                              </span>
                              <button
                                className="ml-1 h-6 w-6 shrink-0 rounded hover:bg-white/70"
                                aria-label={`Bỏ ${a.shift.name} của ${u.fullName} ngày ${d}`}
                                onClick={() => unassign(a.id)}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <button
                            className="h-8 w-full rounded border border-dashed border-slate-200 text-xs text-slate-400 hover:border-blue-300 hover:text-primary"
                            aria-label={`Phân ca cho ${u.fullName} ngày ${d}`}
                            onClick={() => setAssigning({ userId: u.id, date: d })}
                          >
                            +
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {data && data.staff.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Chưa có nhân viên đang làm việc
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingShift && (
        <ShiftForm
          auth={auth}
          shift={editingShift === "new" ? null : editingShift}
          onClose={() => setEditingShift(null)}
          onSaved={() => {
            setEditingShift(null);
            shifts.reload();
            cal.reload();
          }}
        />
      )}
      {assigning && data && (
        <AssignModal
          auth={auth}
          calendar={data}
          initial={assigning}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            cal.reload();
            shifts.reload();
          }}
        />
      )}
    </div>
  );
}
