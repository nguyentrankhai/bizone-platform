/**
 * Client IP (QA-4 #125, same rule as BizOne QA-3 #97).
 *
 * `X-Forwarded-For` is written by the client unless a reverse proxy rewrites it, so it is only
 * trusted when the app runs behind one (`TRUST_PROXY=true`): then `X-Real-IP`, else the last
 * `X-Forwarded-For` hop — the address the proxy itself saw (nginx `proxy_add_x_forwarded_for`
 * appends it after whatever the client sent). Without a trusted proxy the IP is unknown:
 * logs / partner requests get `undefined` (callers fall back), rate limits share one bucket.
 */
export const UNTRUSTED_CLIENT = "untrusted";

type HeaderSource = { get(name: string): string | null };

export function clientIp(
  headers: HeaderSource,
  trustProxy = process.env.TRUST_PROXY === "true",
): string | undefined {
  if (!trustProxy) return undefined;
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return hops.at(-1);
}

/** Rate-limit bucket for a request: the trusted IP, or one shared bucket. */
export function rateLimitClient(headers: HeaderSource): string {
  return clientIp(headers) ?? UNTRUSTED_CLIENT;
}
