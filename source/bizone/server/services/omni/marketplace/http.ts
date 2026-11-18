import { MarketplaceError } from "./types";

/** Shared HTTP helper of the connectors: timeout, network / HTTP errors → MarketplaceError */

const TIMEOUT_MS = 20_000;

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

/** Image bytes of a product photo (http/https only, ≤ 5 MB) */
export async function fetchImage(url: string): Promise<{ data: Buffer; contentType: string }> {
  let u: URL;
  try {
    u = new URL(url, process.env.APP_URL ?? "http://localhost:3000");
  } catch {
    throw new MarketplaceError("invalid", `Ảnh "${url}" không phải URL hợp lệ`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new MarketplaceError("invalid", `Ảnh "${url}" phải là http/https`);
  let res: Response;
  try {
    res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
  } catch {
    throw new MarketplaceError("network", `Không tải được ảnh ${u.href}`);
  }
  if (!res.ok)
    throw new MarketplaceError("invalid", `Không tải được ảnh ${u.href} (HTTP ${res.status})`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(type))
    throw new MarketplaceError("invalid", `Ảnh ${u.href} phải là JPG / PNG / WEBP`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > 5 * 1024 * 1024)
    throw new MarketplaceError("invalid", `Ảnh ${u.href} lớn hơn 5 MB`);
  return { data, contentType: type };
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
