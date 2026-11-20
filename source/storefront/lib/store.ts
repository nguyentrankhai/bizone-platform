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
  /**
   * Public origin of this store (QA-5 #156): `{slug}.{root}` when the request came in on the
   * store's sub-domain (scheme / port of `STOREFRONT_URL`), else `STOREFRONT_URL` itself. Payment
   * Hub sends the customer back here, and BizOne only accepts a return URL on the "Địa chỉ
   * website" configured for the channel.
   */
  baseUrl: string;
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

/** Sub-domain of `host` under the root domain (or `.localhost`) and that root, else null */
export function matchHost(
  host: string | null,
  rootDomain: string,
): { slug: string; root: string } | null {
  if (!host) return null;
  const name = host.split(":")[0].toLowerCase();
  for (const root of [rootDomain.toLowerCase(), "localhost"]) {
    if (root && name.endsWith(`.${root}`)) {
      const sub = name.slice(0, -root.length - 1);
      if (/^[a-z0-9-]{1,40}$/.test(sub)) return { slug: sub, root };
    }
  }
  return null;
}

/** Sub-domain of `host` under the root domain (or `.localhost`), else null */
export function slugFromHost(host: string | null, rootDomain: string): string | null {
  return matchHost(host, rootDomain)?.slug ?? null;
}

/** Public origin of a store: its sub-domain, or the configured site URL (default store) */
export function storeBaseUrl(
  match: { slug: string; root: string } | null,
  configured: string | undefined,
): string {
  const base = new URL(configured || "http://localhost:3100");
  if (!match) return base.origin;
  return `${base.protocol}//${match.slug}.${match.root}${base.port ? `:${base.port}` : ""}`;
}

export async function currentStore(): Promise<StoreRef> {
  const keys = parseStoreKeys(process.env.STORE_KEYS);
  const h = await headers();
  // QA-5 #156: a server action's redirect is rendered by Next through an internal request to its
  // own origin (`localhost:{port}`), which keeps the visitor's host only in X-Forwarded-Host —
  // without it every redirect on `{slug}.…` would show the default store (or 404). The header
  // only picks which (public) store is shown, so a forged value gains nothing.
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  const match = matchHost(host, process.env.STORE_ROOT_DOMAIN ?? "bizone.vn");
  const slug = match?.slug ?? process.env.DEFAULT_STORE ?? "";
  const key = keys.get(slug);
  if (!key) notFound();
  return { slug, key, baseUrl: storeBaseUrl(match, process.env.STOREFRONT_URL) };
}
