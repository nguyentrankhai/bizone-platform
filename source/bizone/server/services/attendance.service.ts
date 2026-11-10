import { bizoneError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { dateKeysBetween, dbDate, vnDateKey, vnWallTime } from "@/lib/vn-time";
import { ensureDbUserId } from "./user.service";
import { recordAudit } from "./auditLog.service";
import { shiftWindow } from "./shift.service";
import type { AuthUser } from "@/types/auth";

/**
 * Self-service check-in/out and the timesheet. One `attendance` row per staff per VN date;
 * late / early-leave minutes are measured against the shifts rostered for that date
 * (earliest start → latest end) with a grace period from store_config
 * `attendance_grace_minutes` (default 5).
 */

const DEFAULT_GRACE_MIN = 5;
const DAY_MIN = 24 * 60;

export type DayStatus =
  "present" | "late" | "early_leave" | "late_early" | "absent" | "scheduled" | "off";

export interface DayWindow {
  startMin: number;
  endMin: number;
}

export interface DayResult {
  status: DayStatus;
  lateMinutes: number;
  earlyMinutes: number;
  workedMinutes: number;
}

/** Earliest start / latest end of the shifts rostered on one date (null = not rostered) */
export function mergeWindows(windows: DayWindow[]): DayWindow | null {
  if (windows.length === 0) return null;
  return {
    startMin: Math.min(...windows.map((w) => w.startMin)),
    endMin: Math.max(...windows.map((w) => w.endMin)),
  };
}

/**
 * Pure evaluation of one staff-day. Times are instants; `window` is in minutes from 00:00 VN
 * of `dateKey`. Late/early count only beyond the grace period, but report the full minutes.
 */
export function evaluateDay(args: {
  dateKey: string;
  window: DayWindow | null;
  checkIn: Date | null;
  checkOut: Date | null;
  now: Date;
  graceMinutes: number;
}): DayResult {
  const { dateKey, window, checkIn, checkOut, now, graceMinutes } = args;
  const workedMinutes =
    checkIn && checkOut
      ? Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000))
      : 0;
  if (!checkIn) {
    if (!window) return { status: "off", lateMinutes: 0, earlyMinutes: 0, workedMinutes };
    const ended = now.getTime() >= vnWallTime(dateKey, window.endMin).getTime();
    return {
      status: ended ? "absent" : "scheduled",
      lateMinutes: 0,
      earlyMinutes: 0,
      workedMinutes,
    };
  }
  if (!window) return { status: "present", lateMinutes: 0, earlyMinutes: 0, workedMinutes };
  const start = vnWallTime(dateKey, window.startMin).getTime();
  const end = vnWallTime(dateKey, window.endMin).getTime();
  const lateRaw = Math.round((checkIn.getTime() - start) / 60_000);
  const earlyRaw = checkOut ? Math.round((end - checkOut.getTime()) / 60_000) : 0;
  const lateMinutes = lateRaw > graceMinutes ? lateRaw : 0;
  const earlyMinutes = earlyRaw > graceMinutes ? earlyRaw : 0;
  const status: DayStatus =
    lateMinutes && earlyMinutes
      ? "late_early"
      : lateMinutes
        ? "late"
        : earlyMinutes
          ? "early_leave"
          : "present";
  return { status, lateMinutes, earlyMinutes, workedMinutes };
}

/** DB enum has no combined value: late wins, early leave goes to the notes */
function dbStatus(s: DayStatus): "present" | "late" | "early_leave" {
  if (s === "late" || s === "late_early") return "late";
  if (s === "early_leave") return "early_leave";
  return "present";
}

async function graceMinutes(): Promise<number> {
  const row = await getPrisma().storeConfig.findUnique({
    where: { configKey: "attendance_grace_minutes" },
    select: { configValue: true },
  });
  const v = Number(row?.configValue);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_GRACE_MIN;
}

async function windowsFor(userId: number, dateKeys: string[]): Promise<Map<string, DayWindow>> {
  const rows = await getPrisma().shiftAssignment.findMany({
    where: { userId, date: { in: dateKeys.map(dbDate) } },
    select: { date: true, shift: { select: { startTime: true, endTime: true } } },
  });
  const byDate = new Map<string, DayWindow[]>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), shiftWindow(r.shift.startTime, r.shift.endTime)]);
  }
  const out = new Map<string, DayWindow>();
  for (const [k, w] of byDate) out.set(k, mergeWindows(w)!);
  return out;
}

function previousDateKey(key: string): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) - DAY_MIN * 60_000).toISOString().slice(0, 10);
}

export async function checkIn(user: AuthUser, notes?: string, now = new Date()) {
  const prisma = getPrisma();
  const userId = await ensureDbUserId(user);
  const today = vnDateKey(now);
  const yesterday = previousDateKey(today);
  const windows = await windowsFor(userId, [yesterday, today]);

  // An overnight shift from yesterday that is still running belongs to yesterday's sheet
  let dateKey = today;
  const y = windows.get(yesterday);
  if (y && y.endMin > DAY_MIN && now.getTime() < vnWallTime(yesterday, y.endMin).getTime()) {
    const open = await prisma.attendance.findUnique({
      where: { userId_date: { userId, date: dbDate(yesterday) } },
    });
    if (!open) dateKey = yesterday;
  }

  const result = evaluateDay({
    dateKey,
    window: windows.get(dateKey) ?? null,
    checkIn: now,
    checkOut: null,
    now,
    graceMinutes: await graceMinutes(),
  });
  try {
    const row = await prisma.attendance.create({
      data: {
        userId,
        date: dbDate(dateKey),
        checkIn: now,
        status: dbStatus(result.status),
        notes: notes ?? (windows.has(dateKey) ? null : "Ngoài lịch phân ca"),
      },
    });
    await recordAudit({
      userId,
      module: "staff",
      action: "check_in",
      entityType: "attendance",
      entityId: row.id,
      newValue: { date: dateKey, checkIn: now.toISOString(), lateMinutes: result.lateMinutes },
    });
    return {
      ...row,
      date: dateKey,
      lateMinutes: result.lateMinutes,
      scheduled: windows.has(dateKey),
    };
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw bizoneError("CONFLICT", `Đã check-in ngày ${dateKey}`);
    }
    throw err;
  }
}

export async function checkOut(user: AuthUser, notes?: string, now = new Date()) {
  const prisma = getPrisma();
  const userId = await ensureDbUserId(user);
  const today = vnDateKey(now);
  const open = await prisma.attendance.findFirst({
    where: {
      userId,
      checkIn: { not: null },
      checkOut: null,
      date: { in: [dbDate(today), dbDate(previousDateKey(today))] },
    },
    orderBy: { date: "desc" },
  });
  if (!open?.checkIn) {
    const done = await prisma.attendance.findUnique({
      where: { userId_date: { userId, date: dbDate(today) } },
    });
    throw bizoneError(
      "CONFLICT",
      done ? "Hôm nay đã check-out" : "Chưa check-in — không thể check-out",
    );
  }
  const dateKey = open.date.toISOString().slice(0, 10);
  const windows = await windowsFor(userId, [dateKey]);
  const result = evaluateDay({
    dateKey,
    window: windows.get(dateKey) ?? null,
    checkIn: open.checkIn,
    checkOut: now,
    now,
    graceMinutes: await graceMinutes(),
  });
  const extra = [
    open.notes,
    notes,
    result.status === "late_early" ? `Về sớm ${result.earlyMinutes} phút` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Conditional update: a concurrent check-out wins once
  const updated = await prisma.attendance.updateMany({
    where: { id: open.id, checkOut: null },
    data: { checkOut: now, status: dbStatus(result.status), notes: extra || null },
  });
  if (updated.count === 0) throw bizoneError("CONFLICT", "Đã check-out");
  await recordAudit({
    userId,
    module: "staff",
    action: "check_out",
    entityType: "attendance",
    entityId: open.id,
    newValue: {
      date: dateKey,
      checkOut: now.toISOString(),
      workedMinutes: result.workedMinutes,
      earlyMinutes: result.earlyMinutes,
    },
  });
  return { id: open.id, date: dateKey, checkIn: open.checkIn, checkOut: now, ...result };
}

export interface TimesheetDay extends DayResult {
  date: string;
  checkIn: Date | null;
  checkOut: Date | null;
  shifts: string[];
  notes: string | null;
}

/** One user, or the staff of a branch scope (QA-3 #96) */
function userFilter(input: { userId?: number; userIds?: number[] }) {
  if (input.userId) return { userId: input.userId };
  if (input.userIds) return { userId: { in: input.userIds } };
  return {};
}

export async function timesheet(
  input: { from: string; to: string; userId?: number; userIds?: number[] },
  now = new Date(),
) {
  const days = dateKeysBetween(input.from, input.to);
  if (days.length === 0) throw bizoneError("VALIDATION_ERROR", "Khoảng ngày không hợp lệ");
  if (days.length > 62) throw bizoneError("VALIDATION_ERROR", "Tối đa 62 ngày mỗi lần xem");
  const prisma = getPrisma();
  const range = { gte: dbDate(input.from), lte: dbDate(input.to) };
  const [assignments, attendance] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { date: range, ...userFilter(input) },
      select: {
        userId: true,
        date: true,
        shift: { select: { name: true, startTime: true, endTime: true } },
      },
    }),
    prisma.attendance.findMany({
      where: { date: range, ...userFilter(input) },
    }),
  ]);
  const userIds = new Set([
    ...assignments.map((a) => a.userId),
    ...attendance.map((a) => a.userId),
  ]);
  if (input.userId) userIds.add(input.userId);
  const users = await prisma.user.findMany({
    where: input.userId
      ? { id: input.userId }
      : { OR: [{ id: { in: [...userIds] } }, { isActive: true }] },
    select: { id: true, fullName: true, username: true, isActive: true },
    orderBy: { fullName: "asc" },
  });
  const grace = await graceMinutes();

  const key = (userId: number, d: Date) => `${userId}:${d.toISOString().slice(0, 10)}`;
  const shiftsBy = new Map<string, { name: string; window: DayWindow }[]>();
  for (const a of assignments) {
    const k = key(a.userId, a.date);
    shiftsBy.set(k, [
      ...(shiftsBy.get(k) ?? []),
      { name: a.shift.name, window: shiftWindow(a.shift.startTime, a.shift.endTime) },
    ]);
  }
  const attBy = new Map(attendance.map((a) => [key(a.userId, a.date), a]));

  const rows = users.map((u) => {
    const sheet: TimesheetDay[] = days.map((date) => {
      const k = `${u.id}:${date}`;
      const shifts = shiftsBy.get(k) ?? [];
      const att = attBy.get(k);
      const result = evaluateDay({
        dateKey: date,
        window: mergeWindows(shifts.map((s) => s.window)),
        checkIn: att?.checkIn ?? null,
        checkOut: att?.checkOut ?? null,
        now,
        graceMinutes: grace,
      });
      return {
        date,
        checkIn: att?.checkIn ?? null,
        checkOut: att?.checkOut ?? null,
        shifts: shifts.map((s) => s.name),
        notes: att?.notes ?? null,
        ...result,
      };
    });
    const totals = {
      scheduledDays: sheet.filter((d) => d.shifts.length > 0).length,
      workedDays: sheet.filter((d) => d.checkIn).length,
      workedMinutes: sheet.reduce((s, d) => s + d.workedMinutes, 0),
      lateCount: sheet.filter((d) => d.lateMinutes > 0).length,
      lateMinutes: sheet.reduce((s, d) => s + d.lateMinutes, 0),
      earlyCount: sheet.filter((d) => d.earlyMinutes > 0).length,
      earlyMinutes: sheet.reduce((s, d) => s + d.earlyMinutes, 0),
      absentCount: sheet.filter((d) => d.status === "absent").length,
    };
    return { user: u, days: sheet, totals };
  });
  return { days, graceMinutes: grace, rows };
}

/** Current user's attendance today + whether they are rostered */
export async function myToday(user: AuthUser, now = new Date()) {
  const prisma = getPrisma();
  const userId = await ensureDbUserId(user);
  const today = vnDateKey(now);
  const yesterday = previousDateKey(today);
  const [open, todayRow, shifts] = await Promise.all([
    prisma.attendance.findFirst({
      where: { userId, checkOut: null, date: { in: [dbDate(today), dbDate(yesterday)] } },
      orderBy: { date: "desc" },
    }),
    prisma.attendance.findUnique({ where: { userId_date: { userId, date: dbDate(today) } } }),
    prisma.shiftAssignment.findMany({
      where: { userId, date: dbDate(today) },
      select: { shift: { select: { name: true, startTime: true, endTime: true } } },
    }),
  ]);
  return {
    userId,
    date: today,
    record: open ?? todayRow,
    canCheckIn: !open && !todayRow,
    canCheckOut: Boolean(open),
    shifts: shifts.map((s) => ({
      name: s.shift.name,
      startTime: s.shift.startTime.toISOString().slice(11, 16),
      endTime: s.shift.endTime.toISOString().slice(11, 16),
    })),
  };
}
