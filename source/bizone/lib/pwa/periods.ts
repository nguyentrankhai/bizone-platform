/**
 * Report periods of the mobile app (P6.4), as VN calendar dates (UTC+7, no DST) — the same
 * `YYYY-MM-DD` keys the reports API takes.
 */
export type MobilePeriod = "today" | "7d" | "30d" | "month";

export const MOBILE_PERIODS: { value: MobilePeriod; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "month", label: "Tháng này" },
];

const DAY = 24 * 60 * 60 * 1000;
const VN_OFFSET = 7 * 60 * 60 * 1000;

/** VN date key of an instant, `daysAgo` days before it */
export function vnKey(now: Date, daysAgo = 0): string {
  return new Date(now.getTime() + VN_OFFSET - daysAgo * DAY).toISOString().slice(0, 10);
}

export function periodRange(period: MobilePeriod, now = new Date()): { from: string; to: string } {
  const to = vnKey(now);
  switch (period) {
    case "today":
      return { from: to, to };
    case "7d":
      return { from: vnKey(now, 6), to };
    case "30d":
      return { from: vnKey(now, 29), to };
    case "month":
      return { from: `${to.slice(0, 8)}01`, to };
  }
}
