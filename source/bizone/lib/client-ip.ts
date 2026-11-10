/**
 * Client IP for rate limiting (QA-3 #97).
 *
 * `X-Forwarded-For` is written by the client unless a reverse proxy rewrites it, so it is only
 * trusted when the app runs behind one (`TRUST_PROXY=true`): then `X-Real-IP`, else the last
 * `X-Forwarded-For` hop — the address the proxy itself saw (nginx `proxy_add_x_forwarded_for`
 * appends it after whatever the client sent). Without a trusted proxy every request shares one
 * bucket, so per-IP limits can't be dodged by inventing headers.
 */
export const UNTRUSTED_CLIENT = "untrusted";

export function clientIp(
  headers: { get(name: string): string | null },
  trustProxy = process.env.TRUST_PROXY === "true",
): string {
  if (!trustProxy) return UNTRUSTED_CLIENT;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return hops.at(-1) ?? UNTRUSTED_CLIENT;
}
