"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  apiContext,
  errorMessage,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import {
  ErrorBox,
  addDays,
  btnPrimary,
  btnSecondary,
  dayLabel,
  fmtMinutes,
  fmtTime,
  inputAutoCls,
  useLoad,
  vnToday,
  weekStart,
} from "./shared";

type Sheet = RouterOutputs["staff"]["attendance"]["timesheet"];
type Row = Sheet["rows"][number];

const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: "Đúng giờ", cls: "bg-emerald-50 text-emerald-700" },
  late: { label: "Đi trễ", cls: "bg-amber-50 text-amber-800" },
  early_leave: { label: "Về sớm", cls: "bg-orange-50 text-orange-700" },
  late_early: { label: "Trễ + về sớm", cls: "bg-red-50 text-red-700" },
  absent: { label: "Vắng", cls: "bg-red-50 text-red-700" },
  scheduled: { label: "Có ca", cls: "bg-blue-50 text-blue-700" },
  off: { label: "Nghỉ", cls: "bg-slate-100 text-slate-500" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.off;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
}

function TodayCard({ auth }: { auth: ApiAuth }) {
  const ctx = apiContext(auth);
  const me = useLoad(JSON.stringify(["me", auth]), () =>
    trpc.staff.attendance.me.query(undefined, ctx),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function act(kind: "in" | "out") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "in") {
        const r = await trpc.staff.attendance.checkIn.mutate({}, ctx);
        setNotice(
          r.lateMinutes
            ? `Đã check-in lúc ${fmtTime(r.checkIn)} — trễ ${fmtMinutes(r.lateMinutes)}`
            : `Đã check-in lúc ${fmtTime(r.checkIn)}`,
        );
      } else {
        const r = await trpc.staff.attendance.checkOut.mutate({}, ctx);
        setNotice(
          `Đã check-out lúc ${fmtTime(r.checkOut)} — làm ${fmtMinutes(r.workedMinutes)}` +
            (r.earlyMinutes ? `, về sớm ${fmtMinutes(r.earlyMinutes)}` : ""),
        );
      }
      me.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const d = me.data;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">
            Chấm công hôm nay · {dayLabel(vnToday())}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {d?.shifts.length
              ? `Ca: ${d.shifts.map((s) => `${s.name} ${s.startTime}–${s.endTime}`).join(", ")}`
              : "Hôm nay bạn không có ca được phân."}
          </p>
          {d?.record && (
            <p className="mt-1 text-sm text-slate-700">
              Vào {fmtTime(d.record.checkIn)} · Ra {fmtTime(d.record.checkOut)}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            className={`${btnPrimary} h-12 text-base sm:min-w-32`}
            disabled={busy || !d?.canCheckIn}
            onClick={() => act("in")}
          >
            Check-in
          </button>
          <button
            className={`${btnSecondary} h-12 text-base sm:min-w-32`}
            disabled={busy || !d?.canCheckOut}
            onClick={() => act("out")}
          >
            Check-out
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <ErrorBox message={error || me.error} />
        {notice && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
        )}
      </div>
    </section>
  );
}

function DetailTable({ row }: { row: Row }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Ngày</th>
            <th className="px-3 py-2 text-left font-medium">Ca</th>
            <th className="px-3 py-2 text-left font-medium">Vào</th>
            <th className="px-3 py-2 text-left font-medium">Ra</th>
            <th className="px-3 py-2 text-right font-medium">Giờ làm</th>
            <th className="px-3 py-2 text-right font-medium">Trễ</th>
            <th className="px-3 py-2 text-right font-medium">Về sớm</th>
            <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {row.days.map((d) => (
            <tr key={d.date} className="border-t border-slate-100">
              <td className="px-3 py-2 whitespace-nowrap">{dayLabel(d.date)}</td>
              <td className="px-3 py-2 text-slate-600">{d.shifts.join(", ") || "—"}</td>
              <td className="px-3 py-2">{fmtTime(d.checkIn)}</td>
              <td className="px-3 py-2">{fmtTime(d.checkOut)}</td>
              <td className="px-3 py-2 text-right">
                {d.workedMinutes ? fmtMinutes(d.workedMinutes) : "—"}
              </td>
              <td className="px-3 py-2 text-right text-amber-700">
                {d.lateMinutes ? fmtMinutes(d.lateMinutes) : ""}
              </td>
              <td className="px-3 py-2 text-right text-orange-700">
                {d.earlyMinutes ? fmtMinutes(d.earlyMinutes) : ""}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={d.status} />
                {d.notes && <span className="ml-2 text-xs text-slate-500">{d.notes}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AttendanceClient({ auth }: { auth: ApiAuth }) {
  const today = vnToday();
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState<number | null>(null);
  const ctx = apiContext(auth);

  const from = mode === "week" ? weekStart(anchor) : `${anchor.slice(0, 8)}01`;
  const to =
    mode === "week"
      ? addDays(from, 6)
      : addDays(`${addDays(`${anchor.slice(0, 8)}28`, 4).slice(0, 8)}01`, -1);
  const sheet = useLoad(JSON.stringify([from, to, auth]), () =>
    trpc.staff.attendance.timesheet.query({ from, to }, ctx),
  );
  const shift = (dir: number) =>
    setAnchor(
      mode === "week"
        ? addDays(anchor, 7 * dir)
        : addDays(dir > 0 ? `${to}` : from, dir > 0 ? 1 : -1),
    );
  const rows = sheet.data?.rows ?? [];
  const selectedRow =
    rows.find((r) => r.user.id === selected) ?? (rows.length === 1 ? rows[0] : null);

  return (
    <div className="space-y-6">
      <TodayCard auth={auth} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold text-slate-800">
            Bảng chấm công {dayLabel(from).slice(3)} – {dayLabel(to).slice(3)}
          </h2>
          <select
            className={inputAutoCls}
            aria-label="Kỳ xem"
            value={mode}
            onChange={(e) => setMode(e.target.value as "week" | "month")}
          >
            <option value="week">Theo tuần</option>
            <option value="month">Theo tháng</option>
          </select>
          <button className={btnSecondary} onClick={() => shift(-1)} aria-label="Kỳ trước">
            ‹
          </button>
          <button className={btnSecondary} onClick={() => setAnchor(today)}>
            Hiện tại
          </button>
          <button className={btnSecondary} onClick={() => shift(1)} aria-label="Kỳ sau">
            ›
          </button>
        </div>
        <ErrorBox message={sheet.error} />
        {sheet.data && (
          <p className="text-xs text-slate-500">
            Đi trễ / về sớm tính khi lệch quá {sheet.data.graceMinutes} phút so với ca được phân.
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nhân viên</th>
                <th className="px-3 py-2 text-right font-medium">Ca phân</th>
                <th className="px-3 py-2 text-right font-medium">Ngày công</th>
                <th className="px-3 py-2 text-right font-medium">Giờ làm</th>
                <th className="px-3 py-2 text-right font-medium">Đi trễ</th>
                <th className="px-3 py-2 text-right font-medium">Về sớm</th>
                <th className="px-3 py-2 text-right font-medium">Vắng</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sheet.loading && !sheet.data && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Đang tải...
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.user.id}
                  className={`border-t border-slate-100 ${selectedRow?.user.id === r.user.id ? "bg-blue-50/50" : ""}`}
                >
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {r.user.fullName}
                    {!r.user.isActive && (
                      <span className="ml-1 text-xs text-slate-400">(đã nghỉ)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{r.totals.scheduledDays}</td>
                  <td className="px-3 py-2 text-right">{r.totals.workedDays}</td>
                  <td className="px-3 py-2 text-right">{fmtMinutes(r.totals.workedMinutes)}</td>
                  <td className="px-3 py-2 text-right text-amber-700">
                    {r.totals.lateCount
                      ? `${r.totals.lateCount} lần · ${fmtMinutes(r.totals.lateMinutes)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-orange-700">
                    {r.totals.earlyCount
                      ? `${r.totals.earlyCount} lần · ${fmtMinutes(r.totals.earlyMinutes)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-red-600">
                    {r.totals.absentCount || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="h-9 rounded-md px-3 text-sm text-primary hover:bg-blue-50"
                      onClick={() => setSelected(r.user.id)}
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedRow && (
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-700">Chi tiết — {selectedRow.user.fullName}</h3>
            <DetailTable row={selectedRow} />
          </div>
        )}
      </section>
    </div>
  );
}
