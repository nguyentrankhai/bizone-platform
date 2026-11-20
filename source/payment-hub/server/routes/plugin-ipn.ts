import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { ensureCatalog } from "@/services/connectors/loader";
import type { ConnectorManifest } from "@/services/connectors/manifest";
import {
  ConnectorUnavailableError,
  pluginDefinition,
  resolveConnectorByCode,
  type ConnectorDefinition,
} from "@/services/connectors/registry";
import { applyPaymentResult } from "@/server/services/payment.service";
import { handleWalletRedirect } from "@/server/routes/wallet-redirect";
import { renderPayPage } from "@/server/routes/pay-page";

/**
 * IPN / callback and return URL of connector plugins (P7.1):
 *   GET|POST /api/ipn/plugin/{code}     → handlePluginIpn
 *   GET      /pay/plugin/{code}/return → handlePluginReturn
 *
 * The payload (query string + JSON / form body, flattened to strings) goes through the plugin:
 *   callbackKeys(raw)        → transaction code + signature (static export of the plugin module)
 *   verifySignature(raw, s)  → with the secrets of the transaction's own partner config
 *   processResult(raw)       → core PaymentResult (validated by the proxy)
 * and is applied exactly like a built-in IPN (applyPaymentResult: idempotent, amount checked).
 * The HTTP answer the PSP expects per outcome comes from manifest.callback.responses — no plugin
 * code decides what the core does with a payment. A deactivated connector still processes
 * callbacks of transactions it already started (deactivation only stops new routing).
 */

const MAX_BODY_BYTES = 64 * 1024;

type Outcome = keyof NonNullable<ConnectorManifest["callback"]>["responses"];

function flatten(obj: Record<string, unknown>, out: Record<string, string>): void {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    out[k.slice(0, 100)] = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}

async function readPayload(req: NextRequest): Promise<Record<string, string> | null> {
  const raw: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams.entries());
  if (req.method !== "POST") return raw;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY_BYTES) return null;
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return null;
  if (!text) return raw;
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded")) {
    flatten(Object.fromEntries(new URLSearchParams(text)), raw);
  } else {
    try {
      const json = JSON.parse(text) as unknown;
      if (json && typeof json === "object" && !Array.isArray(json)) {
        flatten(json as Record<string, unknown>, raw);
      } else return null;
    } catch {
      return null;
    }
  }
  return raw;
}

async function pluginDef(code: string): Promise<ConnectorDefinition | null> {
  const entry = (await ensureCatalog()).get(code);
  return entry ? pluginDefinition(entry) : null;
}

function respond(def: ConnectorDefinition, outcome: Outcome): Response {
  const r = def.manifest?.callback?.responses[outcome];
  if (!r) return Response.json({ outcome }, { status: outcome === "error" ? 500 : 200 });
  return typeof r.body === "string"
    ? new Response(r.body, {
        status: r.status,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    : Response.json(r.body, { status: r.status });
}

export async function handlePluginIpn(req: NextRequest, code: string): Promise<Response> {
  const def = await pluginDef(code);
  if (!def?.manifest?.callback || !def.callbackKeys) {
    return Response.json(
      { success: false, error: { code: "NOT_FOUND", message: "Unknown connector" } },
      { status: 404 },
    );
  }
  const started = Date.now();
  try {
    const raw = await readPayload(req);
    if (!raw) return respond(def, "invalid_signature");
    const keys = await def.callbackKeys(raw);
    if (!keys) return respond(def, "invalid_signature");

    const txn = await getPrisma().transaction.findUnique({
      where: { txnCode: keys.txnCode },
      select: { partnerConfigId: true, partnerConfig: { select: { connectorType: true } } },
    });
    // A transaction routed through another PSP is never verified with this plugin's secrets.
    if (txn?.partnerConfig && txn.partnerConfig.connectorType !== def.connectorType) {
      return respond(def, "not_found");
    }
    const { connector } = await resolveConnectorByCode(code, txn?.partnerConfigId);
    if (!(await connector.verifySignature(raw, keys.signature))) {
      console.warn(`[plugin-ipn:${code}] invalid signature txn=${keys.txnCode}`);
      return respond(def, "invalid_signature");
    }
    if (!txn) return respond(def, "not_found");

    const result = await connector.processResult(raw);
    if (result.txnCode !== keys.txnCode) return respond(def, "invalid_signature");
    const applied = await applyPaymentResult(result, {
      endpoint: `/api/ipn/plugin/${code}`,
      createdBy: `partner:${code}-ipn`,
    });
    const ms = Date.now() - started;
    switch (applied.kind) {
      case "not_found":
        return respond(def, "not_found");
      case "amount_mismatch":
        console.warn(`[plugin-ipn:${code}] amount mismatch txn=${keys.txnCode} (${ms}ms)`);
        return respond(def, "amount_mismatch");
      case "applied":
        console.log(`[plugin-ipn:${code}] txn=${keys.txnCode} → ${applied.status} (${ms}ms)`);
        return respond(def, "ok");
      default: // already_final / pending: recorded, nothing more to do
        return respond(def, "ok");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[plugin-ipn:${code}] ${e instanceof ConnectorUnavailableError ? "" : "error: "}${msg}`,
    );
    return respond(def, "error");
  }
}

export async function handlePluginReturn(req: NextRequest, code: string): Promise<Response> {
  const def = await pluginDef(code);
  if (!def?.callbackKeys) {
    return renderPayPage({ title: "Liên kết không hợp lệ", tone: "error" }, 404);
  }
  const keysOf = def.callbackKeys;
  return handleWalletRedirect(req, {
    code,
    label: def.name,
    path: `/pay/plugin/${code}/return`,
    keys: (params) => keysOf(params),
  });
}
