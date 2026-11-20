import { ensureCatalog } from "@/services/connectors/loader";
import { PAYMENT_METHOD_CODE } from "@/services/connectors/manifest";
import { ROUTE_MAP, type RouteMethod } from "./routeMap";

/**
 * Server-side routing table (P7.1): the built-in methods of ROUTE_MAP + the methods declared by
 * installed connector plugins (manifest.paymentMethods), read from the hot-plug catalog. A plugin
 * whose package failed to load keeps its methods in the table (the Route Engine reports them as
 * "connector_not_implemented"); a removed plugin's methods disappear.
 *
 * Built-in method names win: an upload declaring one of them is refused (connector.service), so a
 * clash can only come from a DB edited by hand — the built-in entry is kept.
 */

export type RouteTable = Record<string, RouteMethod>;

export async function getRouteTable(): Promise<RouteTable> {
  const table: RouteTable = { ...ROUTE_MAP };
  for (const entry of (await ensureCatalog()).values()) {
    for (const pm of entry.manifest?.paymentMethods ?? []) {
      if (table[pm.method]) continue;
      table[pm.method] = {
        connectorType: entry.connectorType,
        connectorCode: entry.code,
        kind: "redirect",
        label: pm.label,
        minAmount: pm.minAmount,
        maxAmount: pm.maxAmount,
        minExpiryMinutes: pm.minExpiryMinutes,
        plugin: true,
      };
    }
  }
  return table;
}

export async function getRoute(method: string): Promise<RouteMethod | undefined> {
  if (!PAYMENT_METHOD_CODE.test(method) && !Object.hasOwn(ROUTE_MAP, method)) return undefined;
  const table = await getRouteTable();
  return Object.hasOwn(table, method) ? table[method] : undefined;
}

/** Label of a method for display (plugin methods included); unknown → the code itself. */
export async function methodLabels(): Promise<Record<string, string>> {
  const table = await getRouteTable();
  return Object.fromEntries(Object.entries(table).map(([m, r]) => [m, r.label]));
}
