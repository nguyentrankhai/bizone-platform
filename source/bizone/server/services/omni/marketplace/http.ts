import {
  BlockedUrlError,
  safeFetch,
  TooLargeError,
  type SafeFetchResult,
} from "@/lib/security/ssrf";
import { MarketplaceError } from "./types";

/** Shared HTTP helper of the connectors: timeout, network / HTTP errors → MarketplaceError */

const TIMEOUT_MS = 20_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export async function callJson(
  url: string,
  init: RequestInit & { label: string },
): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new MarketplaceError("network", `${init.label}: không kết nối được (${msg})`);
  }
  const text = await res.text();
  if (res.status === 429)
    throw new MarketplaceError("rate_limit", `${init.label}: vượt giới hạn gọi API`);
  if (res.status >= 500)
    throw new MarketplaceError("network", `${init.label}: máy chủ sàn lỗi HTTP ${res.status}`);
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new MarketplaceError(
      res.status === 401 || res.status === 403 ? "auth" : "api",
      `${init.label}: phản hồi không hợp lệ (HTTP ${res.status})`,
    );
  }
  return { status: res.status, body };
}

/**
 * Image bytes of a product photo (http/https only, ≤ 5 MB). QA-5 #155: photo URLs are typed by
 * staff, so the download goes through `safeFetch` — no internal-network addresses (except BizOne's
 * own hosts), redirects re-checked, size cut while reading.
 */
export async function fetchImage(url: string): Promise<{ data: Buffer; contentType: string }> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  let href: string;
  try {
    href = new URL(url, base).href;
  } catch {
    throw new MarketplaceError("invalid", `Ảnh "${url}" không phải URL hợp lệ`);
  }
  let res: SafeFetchResult;
  try {
    res = await safeFetch(href, { maxBytes: IMAGE_MAX_BYTES, timeoutMs: TIMEOUT_MS });
  } catch (e) {
    if (e instanceof BlockedUrlError)
      throw new MarketplaceError("invalid", `Ảnh ${href} không được phép: ${e.message}`);
    if (e instanceof TooLargeError)
      throw new MarketplaceError("invalid", `Ảnh ${href} ${e.message}`);
    throw new MarketplaceError("network", `Không tải được ảnh ${href}`);
  }
  if (res.status < 200 || res.status >= 300)
    throw new MarketplaceError("invalid", `Không tải được ảnh ${href} (HTTP ${res.status})`);
  if (!/^image\/(jpeg|png|webp)$/.test(res.contentType))
    throw new MarketplaceError("invalid", `Ảnh ${href} phải là JPG / PNG / WEBP`);
  return { data: res.data, contentType: res.contentType };
}

/** "390,000.00" / 390000 → 390000 */
export function money(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );
