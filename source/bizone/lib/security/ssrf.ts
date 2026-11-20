import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

/**
 * Fetching URLs that users typed (QA-5 #155 — product photos uploaded to marketplaces).
 *
 * The server must not be usable to reach the internal network (Redis, MariaDB, Keycloak admin,
 * cloud metadata 169.254.169.254…). Every connection — the first one and each redirect — checks
 * the address it actually connects to (the DNS answer is checked inside the socket's `lookup`, so
 * a name that resolves to a public address for the check and a private one for the connection —
 * DNS rebinding — is caught too). Hosts of BizOne itself (`APP_URL`, MinIO) and
 * `OUTBOUND_TRUSTED_HOSTS` may be private: they serve our own files.
 */

export class BlockedUrlError extends Error {}

/** Loopback, private, link-local, CGNAT, multicast, reserved… — anything not on the internet */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return (
      /^(fc|fd|fe[89ab]|fe[c-f]|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8")
    );
  }
  if (isIP(ip) !== 4) return true;
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** `host:port` values allowed to be private (our own app / object storage) */
export function trustedHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const out = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const u = new URL(/^https?:\/\//.test(raw) ? raw : `http://${raw}`);
      out.add(u.host.toLowerCase());
    } catch {
      /* ignore */
    }
  };
  add(env.APP_URL ?? "http://localhost:3000");
  if (env.MINIO_ENDPOINT)
    add(
      `${env.MINIO_USE_SSL === "true" ? "https" : "http"}://${env.MINIO_ENDPOINT}${env.MINIO_PORT ? `:${env.MINIO_PORT}` : ""}`,
    );
  for (const h of (env.OUTBOUND_TRUSTED_HOSTS ?? "").split(",")) add(h.trim());
  return out;
}

const guardedLookup = (
  hostname: string,
  options: { all?: boolean; family?: number },
  cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void,
) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as LookupAddress[];
    if (!list.length) return cb(new Error(`Không phân giải được ${hostname}`), "");
    if (list.some((a) => isPrivateAddress(a.address)))
      return cb(new BlockedUrlError(`${hostname} trỏ vào mạng nội bộ`), "");
    if (options.all) cb(null, list);
    else cb(null, list[0]!.address, list[0]!.family);
  });
};

export interface SafeFetchResult {
  status: number;
  contentType: string;
  data: Buffer;
  url: string;
}

/**
 * GET `raw` (http/https) with: private addresses refused unless the host is trusted, at most
 * `maxRedirects` redirects (each checked again), the body cut at `maxBytes` while reading,
 * and an overall timeout.
 */
export async function safeFetch(
  raw: string,
  opts: { maxBytes: number; timeoutMs: number; maxRedirects?: number; base?: string },
): Promise<SafeFetchResult> {
  const trusted = trustedHosts();
  const signal = AbortSignal.timeout(opts.timeoutMs);
  let url = new URL(raw, opts.base);
  for (let hop = 0; ; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new BlockedUrlError(`${url.href}: chỉ nhận http / https`);
    const isTrusted = trusted.has(url.host.toLowerCase());
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (!isTrusted && isIP(literal) && isPrivateAddress(literal))
      throw new BlockedUrlError(`${url.href}: địa chỉ mạng nội bộ`);
    const res = await getOnce(url, isTrusted, opts.maxBytes, signal);
    const location = res.status >= 300 && res.status < 400 ? res.location : null;
    if (!location) return { ...res, url: url.href };
    if (hop >= (opts.maxRedirects ?? 3))
      throw new BlockedUrlError(`${raw}: chuyển hướng quá nhiều`);
    url = new URL(location, url);
  }
}

function getOnce(
  url: URL,
  trusted: boolean,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Omit<SafeFetchResult, "url"> & { location: string | null }> {
  const mod = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(
      url,
      {
        signal,
        headers: { "User-Agent": "BizOne/1.0", Accept: "image/*,*/*;q=0.5" },
        ...(trusted ? {} : { lookup: guardedLookup as never }),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "")
          .split(";")[0]!
          .trim()
          .toLowerCase();
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, contentType, data: Buffer.alloc(0), location });
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > maxBytes) {
          res.destroy();
          return reject(new TooLargeError(maxBytes));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new TooLargeError(maxBytes));
          } else chunks.push(c);
        });
        res.on("end", () =>
          resolve({ status, contentType, data: Buffer.concat(chunks), location: null }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
  });
}

export class TooLargeError extends Error {
  constructor(public maxBytes: number) {
    super(`lớn hơn ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }
}
