import { vnDateKey, vnMonthKey } from "@/lib/vn-time";

const DAY_MS = 86_400_000;

/** Period to send today for a frequency, or null when today is not a sending day */
export function scheduledPeriod(frequency: string, now: Date): { from: string; to: string } | null {
  const today = vnDateKey(now);
  const yesterday = vnDateKey(new Date(now.getTime() - DAY_MS));
  if (frequency === "daily") return { from: yesterday, to: yesterday };
  if (frequency === "weekly") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 1 = Monday (VN date)
    if (weekday !== 1) return null;
    return { from: vnDateKey(new Date(now.getTime() - 7 * DAY_MS)), to: yesterday };
  }
  if (frequency === "monthly") {
    if (!today.endsWith("-01")) return null;
    const month = vnMonthKey(new Date(now.getTime() - DAY_MS));
    return { from: `${month}-01`, to: yesterday };
  }
  return null;
}
