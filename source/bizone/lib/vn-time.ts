/**
 * Business days follow Vietnam time (UTC+7, no DST) regardless of the server's TZ —
 * containers run in UTC, so `Date#setHours` would cut days at 07:00 VN time.
 * The database stores UTC instants.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC instant of 00:00 VN time, `daysAgo` days before the VN day containing `now` */
export function vnDayStart(daysAgo = 0, now: Date = new Date()): Date {
  const vnMidnight = Math.floor((now.getTime() + VN_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(vnMidnight - VN_OFFSET_MS - daysAgo * DAY_MS);
}

/** [start, end) of a VN business day */
export function vnDayRange(daysAgo = 0, now: Date = new Date()): { start: Date; end: Date } {
  const start = vnDayStart(daysAgo, now);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** VN calendar date (YYYY-MM-DD) of an instant */
export function vnDateKey(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of `HH:MM` VN wall-clock time on VN date `YYYY-MM-DD` (minutes may exceed a day) */
export function vnWallTime(dateKey: string, minutesOfDay: number): Date {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) - VN_OFFSET_MS + minutesOfDay * 60_000);
}

/** [start, end) instants covering VN dates `from`..`to` inclusive */
export function vnDateKeyRange(from: string, to: string): { start: Date; end: Date } {
  return { start: vnWallTime(from, 0), end: vnWallTime(to, 24 * 60) };
}

/** [start, end) instants of VN month `YYYY-MM` */
export function vnMonthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: vnWallTime(`${month}-01`, 0), end: vnWallTime(`${next}-01`, 0) };
}

/** VN month key (YYYY-MM) of an instant */
export function vnMonthKey(d: Date): string {
  return vnDateKey(d).slice(0, 7);
}

/** Value for a DATE column holding VN calendar date `YYYY-MM-DD` (Prisma maps DATE to UTC midnight) */
export function dbDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

/** Every date key from `from` to `to` inclusive (empty when from > to) */
export function dateKeysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
