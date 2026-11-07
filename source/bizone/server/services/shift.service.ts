import { bizoneError, notFound } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import { dateKeysBetween, dbDate } from "@/lib/vn-time";
import type { AssignShiftInput } from "@/lib/validators/staff";

/**
 * Work shifts (`shifts`) and the roster (`shift_assignments`). Shift times are VN wall-clock
 * times stored in TIME columns; a shift whose end is not after its start runs past midnight.
 */

/** "HH:MM" → value for a TIME column (Prisma maps TIME to 1970-01-01 UTC) */
export function toDbTime(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`);
}

/** TIME column value → "HH:MM" */
export function fromDbTime(d: Date): string {
  return d.toISOString().slice(11, 16);
}

/** Minutes after midnight of a TIME column value */
export function minutesOf(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Shift window in minutes from the start of its date (end > start; overnight ends add 24 h) */
export function shiftWindow(start: Date, end: Date): { startMin: number; endMin: number } {
  const startMin = minutesOf(start);
  let endMin = minutesOf(end);
  if (endMin <= startMin) endMin += 24 * 60;
  return { startMin, endMin };
}

function present<T extends { startTime: Date; endTime: Date }>(s: T) {
  return { ...s, startTime: fromDbTime(s.startTime), endTime: fromDbTime(s.endTime) };
}

const shiftSelect = {
  id: true,
  name: true,
  startTime: true,
  endTime: true,
  description: true,
  isActive: true,
  branchId: true,
  branch: { select: { id: true, name: true } },
} as const;

export async function listShifts(includeInactive = false) {
  const shifts = await getPrisma().shift.findMany({
    where: includeInactive ? {} : { isActive: true },
    select: { ...shiftSelect, _count: { select: { shiftAssignments: true } } },
    orderBy: [{ isActive: "desc" }, { startTime: "asc" }],
  });
  return shifts.map(present);
}

async function checkBranch(branchId: number | null | undefined) {
  if (!branchId) return;
  const branch = await getPrisma().branch.findUnique({
    where: { id: branchId },
    select: { id: true },
  });
  if (!branch) throw bizoneError("VALIDATION_ERROR", "Chi nhánh không tồn tại");
}

export async function createShift(input: {
  name: string;
  startTime: string;
  endTime: string;
  branchId?: number | null;
  description?: string;
  isActive: boolean;
}) {
  if (input.startTime === input.endTime) {
    throw bizoneError("VALIDATION_ERROR", "Giờ bắt đầu và kết thúc không được trùng nhau");
  }
  await checkBranch(input.branchId);
  const shift = await getPrisma().shift.create({
    data: {
      name: input.name,
      startTime: toDbTime(input.startTime),
      endTime: toDbTime(input.endTime),
      branchId: input.branchId ?? null,
      description: input.description ?? null,
      isActive: input.isActive,
    },
    select: shiftSelect,
  });
  return present(shift);
}

export async function updateShift(input: {
  id: number;
  name?: string;
  startTime?: string;
  endTime?: string;
  branchId?: number | null;
  description?: string;
  isActive?: boolean;
}) {
  const prisma = getPrisma();
  const current = await prisma.shift.findUnique({ where: { id: input.id } });
  if (!current) throw notFound("Ca làm việc", input.id);
  const start = input.startTime ?? fromDbTime(current.startTime);
  const end = input.endTime ?? fromDbTime(current.endTime);
  if (start === end) {
    throw bizoneError("VALIDATION_ERROR", "Giờ bắt đầu và kết thúc không được trùng nhau");
  }
  await checkBranch(input.branchId);
  const shift = await prisma.shift.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      startTime: toDbTime(start),
      endTime: toDbTime(end),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: shiftSelect,
  });
  return present(shift);
}

export async function deleteShift(id: number) {
  const prisma = getPrisma();
  const shift = await prisma.shift.findUnique({
    where: { id },
    select: { _count: { select: { shiftAssignments: true } } },
  });
  if (!shift) throw notFound("Ca làm việc", id);
  if (shift._count.shiftAssignments > 0) {
    throw bizoneError(
      "CONFLICT",
      `Ca đã được phân cho ${shift._count.shiftAssignments} lượt — hãy ngừng sử dụng ca thay vì xoá`,
    );
  }
  await prisma.shift.delete({ where: { id } });
  return { id };
}

export async function assignShift(input: AssignShiftInput) {
  const prisma = getPrisma();
  const shift = await prisma.shift.findUnique({ where: { id: input.shiftId } });
  if (!shift) throw notFound("Ca làm việc", input.shiftId);
  if (!shift.isActive) throw bizoneError("CONFLICT", "Ca làm việc đã ngừng sử dụng");
  const userIds = [...new Set(input.userIds)];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, isActive: true, fullName: true },
  });
  if (users.length !== userIds.length)
    throw bizoneError("VALIDATION_ERROR", "Nhân viên không tồn tại");
  const inactive = users.find((u) => !u.isActive);
  if (inactive)
    throw bizoneError("CONFLICT", `${inactive.fullName} đã nghỉ việc — không phân ca được`);

  const dates = [...new Set(input.dates)];
  const result = await prisma.shiftAssignment.createMany({
    data: userIds.flatMap((userId) =>
      dates.map((d) => ({
        shiftId: input.shiftId,
        userId,
        date: dbDate(d),
        notes: input.notes ?? null,
      })),
    ),
    skipDuplicates: true,
  });
  return {
    shiftId: input.shiftId,
    created: result.count,
    skipped: userIds.length * dates.length - result.count,
  };
}

export async function unassignShift(id: number) {
  const prisma = getPrisma();
  const row = await prisma.shiftAssignment.findUnique({ where: { id } });
  if (!row) throw notFound("Lượt phân ca", id);
  await prisma.shiftAssignment.delete({ where: { id } });
  return { id, shiftId: row.shiftId, userId: row.userId };
}

export async function shiftCalendar(input: { from: string; to: string; branchId?: number }) {
  const days = dateKeysBetween(input.from, input.to);
  if (days.length === 0) throw bizoneError("VALIDATION_ERROR", "Khoảng ngày không hợp lệ");
  if (days.length > 62) throw bizoneError("VALIDATION_ERROR", "Tối đa 62 ngày mỗi lần xem");
  const prisma = getPrisma();
  const branchFilter = input.branchId
    ? { OR: [{ branchId: input.branchId }, { branchId: null }] }
    : {};
  const [assignments, shifts, staff] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { date: { gte: dbDate(input.from), lte: dbDate(input.to) }, shift: branchFilter },
      select: {
        id: true,
        date: true,
        notes: true,
        userId: true,
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
      orderBy: [{ date: "asc" }, { shift: { startTime: "asc" } }],
    }),
    listShifts(),
    prisma.user.findMany({
      where: {
        isActive: true,
        ...(input.branchId ? { userBranches: { some: { branchId: input.branchId } } } : {}),
      },
      select: { id: true, fullName: true, username: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return {
    days,
    shifts: input.branchId
      ? shifts.filter((s) => s.branchId === null || s.branchId === input.branchId)
      : shifts,
    staff,
    assignments: assignments.map((a) => ({
      id: a.id,
      date: a.date.toISOString().slice(0, 10),
      userId: a.userId,
      notes: a.notes,
      shift: present(a.shift),
    })),
  };
}
