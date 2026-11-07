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
