import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

/**
 * Which store a request is for (P6.1). The site is served at `{slug}.bizone.vn`
 * (`STORE_ROOT_DOMAIN`); in dev also `{slug}.localhost`. Unknown hosts (plain `localhost`, a
 * custom domain not mapped yet) fall back to `DEFAULT_STORE`.
 *
 * `STORE_KEYS="slug=bzs.{tenant}.{secret},…"` holds the BizOne store key of each store — the
 * key is created in BizOne (Omni Channel → Website) and never reaches the browser.
 */

export interface StoreRef {
  slug: string;
  key: string;
}

export function parseStoreKeys(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (raw ?? "").split(",")) {
    const i = entry.indexOf("=");
    if (i <= 0) continue;
    const slug = entry.slice(0, i).trim().toLowerCase();
    const key = entry.slice(i + 1).trim();
    if (/^[a-z0-9-]{1,40}$/.test(slug) && key) map.set(slug, key);
  }
  return map;
}

/** Sub-domain of `host` under the root domain (or `.localhost`), else null */
export function slugFromHost(host: string | null, rootDomain: string): string | null {
  if (!host) return null;
  const name = host.split(":")[0].toLowerCase();
  for (const root of [rootDomain.toLowerCase(), "localhost"]) {
    if (root && name.endsWith(`.${root}`)) {
      const sub = name.slice(0, -root.length - 1);
      if (/^[a-z0-9-]{1,40}$/.test(sub)) return sub;
    }
  }
  return null;
}

export async function currentStore(): Promise<StoreRef> {
  const keys = parseStoreKeys(process.env.STORE_KEYS);
  const host = (await headers()).get("host");
  const slug =
    slugFromHost(host, process.env.STORE_ROOT_DOMAIN ?? "bizone.vn") ??
    process.env.DEFAULT_STORE ??
    "";
  const key = keys.get(slug);
  if (!key) notFound();
  return { slug, key };
}

/** Public base URL of the site (Payment Hub sends the customer back here) */
export function storefrontUrl(): string {
  return (process.env.STOREFRONT_URL ?? "http://localhost:3100").replace(/\/+$/, "");
}
