import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getPrisma } from "@/lib/prisma";
import type { Connector, ConnectorHealthStatus } from "@/generated/prisma/client";
import { bumpCatalogVersion, ensureCatalog, type PluginEntry } from "@/services/connectors/loader";
import {
  ManifestError,
  compareSemver,
  type ConnectorManifest,
} from "@/services/connectors/manifest";
import { PackageError, verifyPackage, type VerifiedPackage } from "@/services/connectors/package";
import {
  builtinDefinitions,
  connectorFromPartnerConfig,
  pluginDefinition,
} from "@/services/connectors/registry";
import { PluginSandbox, SandboxError, pluginBaseDir } from "@/services/connectors/sandbox";
import { ROUTE_MAP } from "@/services/routing/routeMap";
import { holdCircuitsOpen, releaseHealthCircuits } from "@/services/routing/routeEngine";
import { PARTNER_TYPES } from "@/lib/partner-types";
import { getSetting, notify } from "@/services/notification/sender";

/**
 * Connector Manager (P7.1, SRS §3.3.4–3.3.5 / SRS-PH-PARTNER-02) — lifecycle of connectors:
 *   install / update  signed plugin package → compatibility check (manifest + a trial load in a
 *                     sandbox) → stored in connector_packages → every process reloads (hot-plug)
 *   activate / deactivate  connectors.is_active — the Route Engine skips a disabled connector on
 *                     the next request; callbacks of transactions already started still work
 *   remove            plugin only, once inactive with no active partner config and no pending
 *                     transaction left
 *   health            connector.healthCheck() with an Active partner config (worker every
 *                     CONNECTOR_HEALTH_INTERVAL_S + "check now"), stored on the row + history
 * Built-in connectors (VNPay, MoMo, ZaloPay, VietQR) can be activated / deactivated / checked but
 * not uploaded over or removed.
 */

export class ConnectorAdminError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT",
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ConnectorAdminError";
  }
}

export interface Actor {
  username: string;
}

const HEALTH_TIMEOUT_MS = 15_000;
const DEGRADED_LATENCY_MS = Number(process.env.CONNECTOR_DEGRADED_LATENCY_MS ?? 5000);
const HEALTH_LOG_DAYS = 30;

// ─── Views ────────────────────────────────────────────────────────────────────

export interface ConnectorView {
  code: string;
  name: string;
  source: "builtin" | "plugin";
  connectorType: string | null;
  version: string;
  description: string | null;
  /** Installed / Not Installed / Error (package not loadable) */
  status: string;
  isActive: boolean;
  loadError: string | null;
  paymentMethods: { method: string; label: string }[];
  capabilities: { refund: boolean; partialRefund: boolean; statusSync: boolean; qr: boolean };
  publisher: string | null;
  publisherKey: string | null;
  coreCompatibility: string | null;
  pspApiVersion: string | null;
  protocols: string[];
  allowedHosts: string[];
  changelog: ConnectorManifest["changelog"];
  partners: { total: number; active: number };
  health: {
    status: ConnectorHealthStatus | null;
    message: string | null;
    latencyMs: number | null;
    checkedAt: string | null;
  };
  activatedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

/** Connector type served by a connectors row (built-ins: from code, plugins: column). */
function typeOfRow(row: Connector): string | null {
  if (row.source === "plugin") return row.connectorType;
  const def = builtinDefinitions().find((d) => d.code === row.code);
  if (def) return def.connectorType;
  return row.code === "vietqr" ? "VietQR" : null;
}

function builtinMethods(code: string) {
  return Object.entries(ROUTE_MAP)
    .filter(([, r]) => r.connectorCode === code)
    .map(([method, r]) => ({ method, label: r.label as string }));
}

function toView(
  row: Connector,
  entry: PluginEntry | undefined,
  counts: Map<string, { total: number; active: number }>,
): ConnectorView {
  const type = typeOfRow(row);
  const manifest = entry?.manifest ?? null;
  const builtin = builtinDefinitions().find((d) => d.code === row.code);
  const refund = manifest ? manifest.capabilities.refund : (builtin?.refund ?? null);
  return {
    code: row.code,
    name: row.name,
    source: row.source,
    connectorType: type,
    version: manifest?.version ?? row.version,
    description: row.description,
    status: row.source === "plugin" && entry?.loadError ? "Error" : row.status,
    isActive: row.isActive,
    loadError: row.source === "plugin" ? (entry?.loadError ?? row.lastError) : null,
    paymentMethods: manifest
      ? manifest.paymentMethods.map((m) => ({ method: m.method, label: m.label }))
      : builtinMethods(row.code),
    capabilities: {
      refund: !!refund,
      partialRefund: !!refund?.partial,
      statusSync: manifest ? manifest.capabilities.statusSync : !!builtin?.statusSync,
      qr: row.code === "vietqr" || row.code === "momo" || row.code === "zalopay",
    },
    publisher: manifest?.publisher ?? (row.source === "builtin" ? "BizOne Payment Hub" : null),
    publisherKey: entry?.publisherKey ?? null,
    coreCompatibility: manifest?.coreCompatibility ?? null,
    pspApiVersion: manifest?.pspApiVersion ?? null,
    protocols: manifest?.protocols ?? ["REST"],
    allowedHosts: manifest?.network.allowedHosts ?? [],
    changelog: manifest?.changelog ?? [],
    partners: (type && counts.get(type)) || { total: 0, active: 0 },
    health: {
      status: row.healthStatus,
      message: row.healthMessage,
      latencyMs: row.healthLatencyMs,
      checkedAt: row.healthCheckedAt?.toISOString() ?? null,
    },
    activatedAt: row.activatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

async function partnerCounts(): Promise<Map<string, { total: number; active: number }>> {
  const rows = await getPrisma().partnerConfig.groupBy({
    by: ["connectorType", "status"],
    _count: { _all: true },
  });
  const out = new Map<string, { total: number; active: number }>();
  for (const r of rows) {
    const c = out.get(r.connectorType) ?? { total: 0, active: 0 };
    c.total += r._count._all;
    if (r.status === "Active") c.active += r._count._all;
    out.set(r.connectorType, c);
  }
  return out;
}

export async function listConnectors(): Promise<ConnectorView[]> {
  const [rows, catalog, counts] = await Promise.all([
    getPrisma().connector.findMany({ orderBy: [{ source: "asc" }, { id: "asc" }] }),
    ensureCatalog(),
    partnerCounts(),
  ]);
  return rows.map((r) => toView(r, catalog.get(r.code), counts));
}

export interface ConnectorDetail extends ConnectorView {
  packages: {
    id: number;
    version: string;
    sha256: string;
    size: number;
    publisherKey: string;
    uploadedBy: string | null;
    createdAt: string;
    current: boolean;
  }[];
  healthLogs: {
    status: ConnectorHealthStatus;
    latencyMs: number | null;
    message: string | null;
    partnerConfigId: number | null;
    checkedBy: string | null;
    checkedAt: string;
  }[];
}

export async function getConnector(code: string): Promise<ConnectorDetail | null> {
  const prisma = getPrisma();
  const row = await prisma.connector.findUnique({ where: { code } });
  if (!row) return null;
  const [catalog, counts, packages, logs] = await Promise.all([
    ensureCatalog(),
    partnerCounts(),
    prisma.connectorPackage.findMany({
      where: { connectorCode: code },
      select: {
        id: true,
        version: true,
        sha256: true,
        size: true,
        publisherKey: true,
        uploadedBy: true,
        createdAt: true,
      },
      orderBy: { id: "desc" },
      take: 20,
    }),
    prisma.connectorHealthLog.findMany({
      where: { connectorCode: code },
      orderBy: { id: "desc" },
      take: 20,
    }),
  ]);
  return {
    ...toView(row, catalog.get(code), counts),
    packages: packages.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      current: p.id === row.currentPackageId,
    })),
    healthLogs: logs.map((l) => ({
      status: l.status,
      latencyMs: l.latencyMs,
      message: l.message,
      partnerConfigId: l.partnerConfigId,
      checkedBy: l.checkedBy,
      checkedAt: l.checkedAt.toISOString(),
    })),
  };
}

// ─── Install / update ─────────────────────────────────────────────────────────

/**
 * Trial load in a throw-away sandbox: the module must export createConnector(), the instance must
 * implement IConnector (and what the manifest promises: callbackKeys for callbacks, queryRefund
 * for asynchronous refunds) and report the manifest's code / version.
 */
async function probe(pkg: VerifiedPackage): Promise<void> {
  const dir = mkdtempSync(path.join(pluginBaseDir(), `${process.pid}-probe-`));
  const sandbox = new PluginSandbox({
    code: pkg.manifest.code,
    dir,
    entry: pkg.manifest.entry,
    allowedHosts: [],
  });
  try {
    for (const [name, data] of pkg.files) {
      const target = path.join(dir, name);
      mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, data, { mode: 0o600 });
    }
    const m = pkg.manifest;
    const info = await sandbox.call<{
      code: string;
      version: string;
      optional: string[];
      callbackKeys: boolean;
    }>("probe", {
      timeoutMs: 10_000,
      config: {
        partnerConfigId: 0,
        connectorType: m.connectorType,
        merchantCode: "probe",
        apiKey: "",
        secretKey: "",
        endpoint: m.config.defaultEndpointSandbox ?? "https://example.invalid/",
        environment: "Sandbox",
        timeoutMs: 5000,
      },
    });
    const issues: string[] = [];
    if (info.code !== m.code)
      issues.push(`connector.code = "${info.code}", manifest = "${m.code}"`);
    if (info.version !== m.version) {
      issues.push(`connector.version = "${info.version}", manifest = "${m.version}"`);
    }
    if (m.callback && !info.callbackKeys) {
      issues.push("manifest có callback nhưng module không export callbackKeys(raw)");
    }
    if (m.capabilities.refund?.async && !info.optional.includes("queryRefund")) {
      issues.push("hoàn tiền bất đồng bộ cần phương thức queryRefund()");
    }
    if (issues.length) {
      throw new ConnectorAdminError("VALIDATION_ERROR", "Plugin không tương thích", issues);
    }
  } catch (e) {
    if (e instanceof ConnectorAdminError) throw e;
    throw new ConnectorAdminError(
      "VALIDATION_ERROR",
      `Không tải được plugin: ${e instanceof Error ? e.message : e}`,
    );
  } finally {
    sandbox.dispose(0);
    setTimeout(() => rmSync(dir, { recursive: true, force: true }), 1000).unref();
  }
}

/** Names already used by built-ins / other plugins (codes, connector types, payment methods). */
async function checkClashes(m: ConnectorManifest): Promise<string[]> {
  const issues: string[] = [];
  const builtinCodes = new Set(["vnpay", "momo", "zalopay", "vietqr"]);
  if (builtinCodes.has(m.code)) issues.push(`code "${m.code}" là connector tích hợp sẵn`);
  if (Object.keys(PARTNER_TYPES).some((t) => t.toLowerCase() === m.connectorType.toLowerCase())) {
    issues.push(`connectorType "${m.connectorType}" là connector tích hợp sẵn`);
  }
  for (const pm of m.paymentMethods) {
    if (Object.hasOwn(ROUTE_MAP, pm.method)) {
      issues.push(`phương thức "${pm.method}" thuộc connector tích hợp sẵn`);
    }
  }
  const others = (await getPrisma().connector.findMany({ where: { source: "plugin" } })).filter(
    (r) => r.code !== m.code,
  );
  const catalog = await ensureCatalog();
  for (const r of others) {
    if (r.connectorType?.toLowerCase() === m.connectorType.toLowerCase()) {
      issues.push(`connectorType "${m.connectorType}" đã dùng bởi plugin ${r.code}`);
    }
    const methods = new Set(catalog.get(r.code)?.manifest?.paymentMethods.map((p) => p.method));
    for (const pm of m.paymentMethods) {
      if (methods.has(pm.method)) {
        issues.push(`phương thức "${pm.method}" đã dùng bởi plugin ${r.code}`);
      }
    }
  }
  return issues;
}

export interface InstallResult {
  connector: ConnectorView;
  /** true = new version of an installed plugin, false = new plugin */
  updated: boolean;
  previousVersion: string | null;
}

export async function installPackage(buf: Uint8Array, actor: Actor): Promise<InstallResult> {
  let pkg: VerifiedPackage;
  try {
    pkg = verifyPackage(buf);
  } catch (e) {
    if (e instanceof PackageError) {
      throw new ConnectorAdminError(
        "VALIDATION_ERROR",
        e.message,
        e.issues.length ? e.issues : undefined,
      );
    }
    if (e instanceof ManifestError) {
      throw new ConnectorAdminError("VALIDATION_ERROR", "manifest.json không hợp lệ", e.issues);
    }
    throw e;
  }
  const m = pkg.manifest;
  const clashes = await checkClashes(m);
  if (clashes.length)
    throw new ConnectorAdminError("CONFLICT", "Trùng tên với connector khác", clashes);

  const prisma = getPrisma();
  const existing = await prisma.connector.findUnique({ where: { code: m.code } });
  let previous: { version: string; publisherKey: string } | null = null;
  if (existing) {
    if (existing.source !== "plugin") {
      throw new ConnectorAdminError("CONFLICT", `"${m.code}" là connector tích hợp sẵn`);
    }
    if (existing.connectorType !== m.connectorType) {
      throw new ConnectorAdminError(
        "CONFLICT",
        `Bản nâng cấp phải giữ connectorType "${existing.connectorType}" (cấu hình đối tác đang dùng)`,
      );
    }
    const current = existing.currentPackageId
      ? await prisma.connectorPackage.findUnique({
          where: { id: existing.currentPackageId },
          select: { version: true, publisherKey: true },
        })
      : null;
    if (current) {
      previous = current;
      if (compareSemver(m.version, current.version) <= 0) {
        throw new ConnectorAdminError(
          "CONFLICT",
          `Phiên bản ${m.version} không mới hơn bản đang cài ${current.version}`,
        );
      }
      if (current.publisherKey !== pkg.keyId) {
        throw new ConnectorAdminError(
          "CONFLICT",
          `Bản nâng cấp phải được ký bởi cùng nhà phát hành (khoá "${current.publisherKey}")`,
        );
      }
    }
  }

  await probe(pkg);

  const row = await prisma.$transaction(async (tx) => {
    const stored = await tx.connectorPackage.create({
      data: {
        connectorCode: m.code,
        version: m.version,
        sha256: pkg.sha256,
        size: pkg.size,
        manifest: m as object,
        package: Buffer.from(buf),
        publisherKey: pkg.keyId,
        uploadedBy: actor.username,
      },
    });
    const common = {
      name: m.name,
      version: m.version,
      description: m.description ?? null,
      configSchema: m.config as object,
      currentPackageId: stored.id,
      status: "Installed" as const,
      lastError: null,
      updatedBy: actor.username,
    };
    return existing
      ? tx.connector.update({ where: { id: existing.id }, data: common })
      : tx.connector.create({
          data: {
            ...common,
            code: m.code,
            source: "plugin",
            connectorType: m.connectorType,
            isActive: false,
          },
        });
  });
  console.log(
    `[connectors] ${existing ? "updated" : "installed"} plugin ${m.code} ${m.version} (key ${pkg.keyId}) by ${actor.username}`,
  );
  await bumpCatalogVersion();
  const catalog = await ensureCatalog();
  return {
    connector: toView(row, catalog.get(m.code), await partnerCounts()),
    updated: !!existing,
    previousVersion: previous?.version ?? null,
  };
}

// ─── Activate / deactivate / remove ───────────────────────────────────────────

export async function setConnectorActive(
  code: string,
  active: boolean,
  actor: Actor,
): Promise<ConnectorView> {
  const prisma = getPrisma();
  const row = await prisma.connector.findUnique({ where: { code } });
  if (!row) throw new ConnectorAdminError("NOT_FOUND", "Không tìm thấy connector");
  if (row.isActive === active) {
    return toView(row, (await ensureCatalog()).get(code), await partnerCounts());
  }
  if (active && row.source === "plugin") {
    const entry = (await ensureCatalog()).get(code);
    if (!entry || !pluginDefinition(entry)) {
      throw new ConnectorAdminError(
        "CONFLICT",
        `Plugin chưa tải được nên không kích hoạt được: ${entry?.loadError ?? "chưa có gói"}`,
      );
    }
  }
  const { count } = await prisma.connector.updateMany({
    where: { id: row.id, isActive: row.isActive },
    data: {
      isActive: active,
      ...(active ? { activatedAt: new Date() } : {}),
      updatedBy: actor.username,
    },
  });
  if (count === 0)
    throw new ConnectorAdminError("CONFLICT", "Connector vừa bị thay đổi, hãy tải lại");
  console.log(`[connectors] ${code} ${active ? "activated" : "deactivated"} by ${actor.username}`);
  await bumpCatalogVersion();
  const fresh = (await prisma.connector.findUnique({ where: { id: row.id } }))!;
  return toView(fresh, (await ensureCatalog()).get(code), await partnerCounts());
}

export async function removeConnector(code: string, actor: Actor): Promise<void> {
  const prisma = getPrisma();
  const row = await prisma.connector.findUnique({ where: { code } });
  if (!row) throw new ConnectorAdminError("NOT_FOUND", "Không tìm thấy connector");
  if (row.source !== "plugin") {
    throw new ConnectorAdminError("CONFLICT", "Không gỡ được connector tích hợp sẵn");
  }
  if (row.isActive) {
    throw new ConnectorAdminError("CONFLICT", "Vô hiệu hoá connector trước khi gỡ");
  }
  const type = row.connectorType ?? "";
  const [activePartners, pending] = await Promise.all([
    prisma.partnerConfig.count({ where: { connectorType: type, status: "Active" } }),
    prisma.transaction.count({
      where: { status: "Pending", partnerConfig: { connectorType: type } },
    }),
  ]);
  const issues: string[] = [];
  if (activePartners) issues.push(`${activePartners} cấu hình đối tác ${type} đang hoạt động`);
  if (pending) issues.push(`${pending} giao dịch đang chờ kết quả qua connector này`);
  if (issues.length) {
    throw new ConnectorAdminError("CONFLICT", "Chưa gỡ được connector", issues);
  }
  await prisma.$transaction([
    prisma.connectorPackage.deleteMany({ where: { connectorCode: code } }),
    prisma.connector.delete({ where: { id: row.id } }),
  ]);
  console.log(`[connectors] removed plugin ${code} by ${actor.username}`);
  await bumpCatalogVersion();
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthOutcome {
  status: ConnectorHealthStatus;
  latencyMs: number;
  message: string;
  partnerConfigId: number | null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`không phản hồi sau ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function runHealth(row: Connector): Promise<HealthOutcome | null> {
  const type = typeOfRow(row);
  if (!type || type === "VietQR") return null; // rendered by the Hub itself — nothing to call
  const prisma = getPrisma();
  const pc =
    (await prisma.partnerConfig.findFirst({
      where: { connectorType: type, status: "Active" },
      orderBy: { id: "asc" },
    })) ??
    (await prisma.partnerConfig.findFirst({
      where: { connectorType: type },
      orderBy: { id: "asc" },
    }));
  const started = Date.now();
  if (!pc) {
    if (row.source !== "plugin") return null;
    // No partner config yet: check that the plugin itself loads and answers.
    const entry = (await ensureCatalog()).get(row.code);
    if (!entry || !pluginDefinition(entry)) {
      return {
        status: "Unhealthy",
        latencyMs: 0,
        message: `Plugin không tải được: ${entry?.loadError ?? "chưa có gói"}`,
        partnerConfigId: null,
      };
    }
    return {
      status: "Healthy",
      latencyMs: Date.now() - started,
      message: "Plugin tải được; chưa có cấu hình đối tác để kiểm tra kết nối PSP",
      partnerConfigId: null,
    };
  }
  try {
    const { connector } = await connectorFromPartnerConfig(pc);
    const r = await withTimeout(connector.healthCheck(), HEALTH_TIMEOUT_MS);
    return {
      status: !r.healthy
        ? "Unhealthy"
        : r.latencyMs >= DEGRADED_LATENCY_MS
          ? "Degraded"
          : "Healthy",
      latencyMs: Math.round(r.latencyMs),
      message: r.message.slice(0, 500),
      partnerConfigId: pc.id,
    };
  } catch (e) {
    return {
      status: "Unhealthy",
      latencyMs: Date.now() - started,
      message: (e instanceof SandboxError || e instanceof Error ? e.message : String(e)).slice(
        0,
        500,
      ),
      partnerConfigId: pc.id,
    };
  }
}

async function recordHealth(row: Connector, h: HealthOutcome, by: string): Promise<void> {
  const prisma = getPrisma();
  const now = new Date();
  await prisma.$transaction([
    prisma.connector.update({
      where: { id: row.id },
      data: {
        healthStatus: h.status,
        healthMessage: h.message,
        healthLatencyMs: h.latencyMs,
        healthCheckedAt: now,
      },
    }),
    prisma.connectorHealthLog.create({
      data: {
        connectorCode: row.code,
        partnerConfigId: h.partnerConfigId,
        status: h.status,
        latencyMs: h.latencyMs,
        message: h.message,
        checkedBy: by,
        checkedAt: now,
      },
    }),
  ]);
  if (row.healthStatus && row.healthStatus !== h.status) {
    console.warn(`[connectors] ${row.code} health ${row.healthStatus} → ${h.status}: ${h.message}`);
  }
  if (h.status === "Unhealthy") await alertIfDown(row, h);
  await tripOrRecover(row, h);
}

/** Consecutive Unhealthy checks of a connector, newest first (capped at `cap`). */
async function unhealthyStreak(code: string, cap: number) {
  const last = await getPrisma().connectorHealthLog.findMany({
    where: { connectorCode: code },
    orderBy: { id: "desc" },
    take: cap,
    select: { id: true, status: true },
  });
  const streak = last.findIndex((l) => l.status !== "Unhealthy");
  return { last, consecutive: streak === -1 ? last.length : streak };
}

/** Health checks failed in a row before routing skips the connector (0 = never). */
export function healthTripThreshold(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.CONNECTOR_HEALTH_TRIP_AFTER);
  return Number.isInteger(n) && n >= 0 ? n : 3;
}

/**
 * P7.5: `CONNECTOR_HEALTH_TRIP_AFTER` (3) consecutive Unhealthy checks → circuits of the
 * connector's Active partner configs held open (Route Engine skips them, fallback partners
 * serve); first Healthy / Degraded check → released. Manual checks count too.
 */
async function tripOrRecover(row: Connector, h: HealthOutcome): Promise<void> {
  const n = healthTripThreshold();
  if (n === 0) return;
  const type = typeOfRow(row);
  if (!type) return;
  const partners = await getPrisma().partnerConfig.findMany({
    where: { connectorType: type, status: "Active" },
    select: { id: true },
  });
  const ids = partners.map((p) => p.id);
  if (h.status !== "Unhealthy") {
    const released = await releaseHealthCircuits(ids);
    if (released.length)
      console.warn(
        `[connectors] ${row.code} healthy again — circuit closed for #${released.join(", #")}`,
      );
    return;
  }
  const { consecutive } = await unhealthyStreak(row.code, n);
  if (consecutive < n) return;
  // open until the next check confirms (interval + margin); a healthy check releases earlier
  const intervalMs = (Number(process.env.CONNECTOR_HEALTH_INTERVAL_S) || 300) * 1000;
  await holdCircuitsOpen(ids, intervalMs * 2 + 60_000);
  console.warn(
    `[connectors] ${row.code} unhealthy ${consecutive}× — routing skips partner config #${ids.join(", #")}`,
  );
}

/** P7.3: `threshold` consecutive Unhealthy checks → "Kết nối đối tác lỗi" (once per outage). */
async function alertIfDown(row: Connector, h: HealthOutcome): Promise<void> {
  const setting = await getSetting("connector.down");
  const n = setting.threshold ?? 3;
  const { last, consecutive } = await unhealthyStreak(row.code, n + 1);
  if (consecutive !== n) return; // exactly the n-th failure of this outage
  await notify("connector.down", {
    title: `Kết nối ${row.name} lỗi ${n} lần liên tiếp`,
    message: h.message,
    link: "/connectors",
    referenceType: "connector",
    referenceId: row.code,
    data: { code: row.code, latencyMs: h.latencyMs, partnerConfigId: h.partnerConfigId },
    dedupeKey: `connector-down:${row.code}:${last[n - 1]?.id ?? Date.now()}`,
  });
}

export async function checkConnectorHealth(code: string, actor: Actor): Promise<HealthOutcome> {
  const row = await getPrisma().connector.findUnique({ where: { code } });
  if (!row) throw new ConnectorAdminError("NOT_FOUND", "Không tìm thấy connector");
  const h = await runHealth(row);
  if (!h) {
    throw new ConnectorAdminError(
      "VALIDATION_ERROR",
      row.code === "vietqr"
        ? "VietQR do Payment Hub tự sinh — kiểm tra bằng nút Test ở trang Đối tác"
        : "Chưa có cấu hình đối tác để kiểm tra",
    );
  }
  await recordHealth(row, h, actor.username);
  return h;
}

/**
 * Health Monitor (worker): every active connector that has an Active partner config (plugins:
 * also without one — the sandbox must load). Old history is purged.
 */
export async function runHealthMonitor(): Promise<{ checked: number; unhealthy: string[] }> {
  const prisma = getPrisma();
  const rows = await prisma.connector.findMany({ where: { isActive: true } });
  const counts = await partnerCounts();
  const unhealthy: string[] = [];
  let checked = 0;
  for (const row of rows) {
    const type = typeOfRow(row);
    if (row.source !== "plugin" && !(type && counts.get(type)?.active)) continue;
    const h = await runHealth(row);
    if (!h) continue;
    checked++;
    if (h.status === "Unhealthy") unhealthy.push(row.code);
    await recordHealth(row, h, "system:health-monitor");
  }
  await prisma.connectorHealthLog.deleteMany({
    where: { checkedAt: { lt: new Date(Date.now() - HEALTH_LOG_DAYS * 86_400_000) } },
  });
  return { checked, unhealthy };
}
