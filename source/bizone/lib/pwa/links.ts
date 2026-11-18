/**
 * Link of a notification (desktop path, e.g. `/orders/12`) → the matching screen of the mobile
 * app (P6.4). Paths without a mobile screen stay as they are (desktop pages are responsive).
 * public/sw.js has a copy of these rules for notification clicks — keep both in sync.
 */
export function mobileLink(link: string): string {
  const [path, query = ""] = link.split("?");
  const q = query ? `?${query}` : "";
  const order = path.match(/^\/orders\/(\d+)\/?$/);
  if (order) return `/mobile/orders/${order[1]}`;
  if (/^\/orders\/?$/.test(path)) return `/mobile/orders${q}`;
  if (/^\/dashboard\/?$/.test(path)) return "/mobile/dashboard";
  if (/^\/reports(\/|$)/.test(path)) return "/mobile/reports";
  if (/^\/notifications\/?$/.test(path)) return "/mobile/notifications";
  return link;
}
