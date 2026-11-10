import { getPrisma } from "@/lib/prisma";
import { dbDate, vnDateKey, vnWallTime } from "@/lib/vn-time";
import { fmtVnd } from "@/lib/notifications/template";
import { getEventSettings, notify } from "@/server/services/notification.service";
import { minutesOf, fromDbTime } from "@/server/services/shift.service";

/**
 * Time-based notifications, run by the worker for every tenant (inside runWithTenant):
 * - every 5 minutes: shift reminders (SRS "Nhắc ca làm việc");
 * - daily 08:00 VN: customer debts overdue, supplier debts due soon / overdue (#66),
 *   pre-orders due for delivery (#78).
 * Dedupe keys make each reminder fire once even if a scan runs twice.
 */

const DAY_MS = 86_400_000;
const fmtDateKey = (key: string) => key.split("-").reverse().join("/");

/** Whole VN days from date key `a` to `b` (b − a) */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export async function scanShiftReminders(now = new Date()) {
  const settings = await getEventSettings("shift_reminder");
  if (!settings.inApp && !settings.email && !settings.sms && !settings.push) return { sent: 0 };
  const minutesBefore = Number(settings.options.minutesBefore ?? 30);
  const today = vnDateKey(now);
  const tomorrow = vnDateKey(new Date(now.getTime() + DAY_MS));
  const rows = await getPrisma().shiftAssignment.findMany({
    where: {
      date: { in: [dbDate(today), dbDate(tomorrow)] },
      shift: { isActive: true },
      user: { isActive: true },
    },
    include: { shift: { include: { branch: { select: { name: true } } } } },
  });
  let sent = 0;
  for (const a of rows) {
    const dateKey = a.date.toISOString().slice(0, 10);
    const start = vnWallTime(dateKey, minutesOf(a.shift.startTime));
    const ms = start.getTime() - now.getTime();
    if (ms <= 0 || ms > minutesBefore * 60_000) continue;
    const startTime = fromDbTime(a.shift.startTime);
    const id = await notify({
      type: "shift_reminder",
      userId: a.userId,
      branchId: a.shift.branchId,
      title: `Ca ${a.shift.name} của bạn bắt đầu lúc ${startTime}`,
      content: `Ngày ${fmtDateKey(dateKey)} (${startTime}–${fromDbTime(a.shift.endTime)})${a.shift.branch ? ` tại ${a.shift.branch.name}` : ""}`,
      link: "/staff/attendance",
      dedupeKey: `shift:${a.id}`,
      vars: {
        shift_name: a.shift.name,
        start_time: startTime,
        end_time: fromDbTime(a.shift.endTime),
        date: fmtDateKey(dateKey),
        branch_name: a.shift.branch?.name ?? "",
      },
    });
    if (id) sent++;
  }
  return { sent };
}

export async function scanCustomerDebts(now = new Date()) {
  const today = vnDateKey(now);
  const debts = await getPrisma().customerDebt.findMany({
    where: {
      status: { not: "paid" },
      remainingAmount: { gt: 0 },
      dueDate: { lt: dbDate(today) },
      customer: { isActive: true },
    },
    include: { customer: { select: { id: true, fullName: true, phone: true } } },
    take: 500,
    orderBy: { dueDate: "asc" },
  });
  let sent = 0;
  for (const d of debts) {
    const dueKey = d.dueDate!.toISOString().slice(0, 10);
    const days = daysBetween(dueKey, today);
    const milestone = days >= 30 ? 30 : 1;
    const amount = fmtVnd(d.remainingAmount.toString());
    const id = await notify({
      type: "customer_debt_overdue",
      title: `KH ${d.customer.fullName} nợ ${amount} quá hạn ${days} ngày`,
      content: `Hạn thanh toán ${fmtDateKey(dueKey)} — SĐT ${d.customer.phone}`,
      link: `/crm/${d.customer.id}`,
      severity: milestone === 30 ? "error" : "warning",
      dedupeKey: `cust_debt:${d.id}:${milestone}`,
      vars: {
        customer_id: d.customer.id,
        customer_name: d.customer.fullName,
        customer_phone: d.customer.phone,
        remaining_amount: amount,
        due_date: fmtDateKey(dueKey),
        days_overdue: days,
      },
    });
    if (id) sent++;
  }
  return { sent };
}

export async function scanSupplierDebts(now = new Date()) {
  const today = vnDateKey(now);
  const settings = await getEventSettings("supplier_debt_due");
  const daysBefore = Number(settings.options.daysBefore ?? 3);
  const horizon = vnDateKey(new Date(now.getTime() + daysBefore * DAY_MS));
  const prisma = getPrisma();
  const debts = await prisma.supplierDebt.findMany({
    where: {
      status: { not: "paid" },
      remainingAmount: { gt: 0 },
      dueDate: { not: null, lte: dbDate(horizon) },
      supplier: { isActive: true },
    },
    include: { supplier: { select: { id: true, name: true } } },
    take: 500,
    orderBy: { dueDate: "asc" },
  });
  const poIds = debts.map((d) => d.poId).filter((x): x is number => x !== null);
  const pos = poIds.length
    ? await prisma.purchaseOrder.findMany({
        where: { id: { in: poIds } },
        select: { id: true, poCode: true, branchId: true },
      })
    : [];
  const poById = new Map(pos.map((p) => [p.id, p]));
  let due = 0;
  let overdue = 0;
  for (const d of debts) {
    const dueKey = d.dueDate!.toISOString().slice(0, 10);
    const left = daysBetween(today, dueKey);
    const po = d.poId ? poById.get(d.poId) : undefined;
    const amount = fmtVnd(d.remainingAmount.toString());
    const common = {
      link: `/suppliers/${d.supplier.id}`,
      branchId: po?.branchId ?? null,
      vars: {
        supplier_name: d.supplier.name,
        po_code: po?.poCode ?? "",
        remaining_amount: amount,
        due_date: fmtDateKey(dueKey),
        days_left: Math.max(0, left),
        days_overdue: Math.max(0, -left),
      },
    };
    if (left >= 0) {
      const title =
        left === 0
          ? `Nợ NCC ${d.supplier.name} ${amount} đến hạn hôm nay`
          : `Nợ NCC ${d.supplier.name} ${amount} đến hạn sau ${left} ngày`;
      const id = await notify({
        type: "supplier_debt_due",
        title,
        content: `Đơn nhập ${po?.poCode ?? "—"} · hạn ${fmtDateKey(dueKey)}`,
        dedupeKey: `sup_debt_due:${d.id}:${dueKey}`,
        ...common,
        vars: { ...common.vars, title, content: `Hạn thanh toán ${fmtDateKey(dueKey)}` },
      });
      if (id) due++;
    } else {
      const days = -left;
      const milestone = days >= 30 ? 30 : 1;
      const title = `Nợ NCC ${d.supplier.name} ${amount} quá hạn ${days} ngày`;
      const id = await notify({
        type: "supplier_debt_overdue",
        title,
        content: `Đơn nhập ${po?.poCode ?? "—"} · hạn ${fmtDateKey(dueKey)}`,
        severity: milestone === 30 ? "error" : "warning",
        dedupeKey: `sup_debt_over:${d.id}:${milestone}`,
        ...common,
        vars: { ...common.vars, title, content: `Quá hạn ${days} ngày` },
      });
      if (id) overdue++;
    }
  }
  return { due, overdue };
}

export async function scanPreorders(now = new Date()) {
  const settings = await getEventSettings("preorder_due");
  const daysBefore = Number(settings.options.daysBefore ?? 1);
  const today = vnDateKey(now);
  const horizon = vnDateKey(new Date(now.getTime() + daysBefore * DAY_MS));
  const rows = await getPrisma().preorder.findMany({
    where: { status: "pending", dueDate: { gte: dbDate(today), lte: dbDate(horizon) } },
    include: { customer: { select: { id: true, fullName: true, phone: true } } },
    take: 500,
  });
  let sent = 0;
  for (const p of rows) {
    const dueKey = p.dueDate!.toISOString().slice(0, 10);
    const left = daysBetween(today, dueKey);
    const remaining = Math.max(0, Number(p.estimatedTotal) - Number(p.depositAmount));
    const when = left === 0 ? "hôm nay" : left === 1 ? "ngày mai" : `sau ${left} ngày`;
    const id = await notify({
      type: "preorder_due",
      branchId: p.branchId,
      title: `Đơn đặt trước ${p.preorderCode} hẹn giao ${when}`,
      content: `${p.customer.fullName} (${p.customer.phone}) — còn thu dự kiến ${fmtVnd(remaining)}`,
      link: "/pos",
      dedupeKey: `preorder:${p.id}:${today}`,
      vars: {
        preorder_code: p.preorderCode,
        customer_id: p.customer.id,
        customer_name: p.customer.fullName,
        customer_phone: p.customer.phone,
        due_date: fmtDateKey(dueKey),
        remaining_amount: fmtVnd(remaining),
      },
    });
    if (id) sent++;
  }
  return { sent };
}
