/**
 * P6.6 — the worker POSTs to whatever endpoint a browser subscription carries, so only real push
 * services are accepted (otherwise a signed-in user could make the server call internal hosts —
 * SSRF). Extra hosts: env `PUSH_ENDPOINT_HOSTS` (comma list, `*.example.com` for sub-domains).
 */
const DEFAULT_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge (Chromium), Android
  "updates.push.services.mozilla.com", // Firefox
  "*.push.services.mozilla.com",
  "web.push.apple.com", // Safari / iOS PWA
  "*.push.apple.com",
  "*.notify.windows.com", // legacy Edge (WNS)
];

function allowedHosts(): string[] {
  const extra = (process.env.PUSH_ENDPOINT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_HOSTS, ...extra];
}

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return allowedHosts().some((h) =>
    h.startsWith("*.") ? host.endsWith(h.slice(1)) && host.length > h.length - 1 : host === h,
  );
}
