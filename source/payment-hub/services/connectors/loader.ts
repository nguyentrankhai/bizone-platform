import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import type { ConnectorManifest } from "./manifest";
import { PackageError, verifyPackage } from "./package";
import { PluginSandbox, pluginBaseDir } from "./sandbox";

/**
 * Plugin loader (P7.1) — the in-process catalog of connector plugins, kept in sync with the
 * `connectors` / `connector_packages` tables so add / activate / deactivate / update / remove take
 * effect without restarting any process (hot-plug, SRS-PH-PARTNER-02-07, AC < 5 s):
 *
 *   - every change bumps the Redis counter `payhub:connectors:ver` (bumpCatalogVersion)
 *   - ensureCatalog() — awaited by the registry before any connector lookup — checks that counter
 *     at most once per CHECK_INTERVAL_MS and reloads the catalog when it moved (Redis down → reload
 *     from the DB every FALLBACK_RELOAD_MS)
 *   - reloading verifies each new package again (signature with the current trusted keys, manifest,
 *     core compatibility), extracts it to a private temp dir of this process and gives it a fresh
 *     sandbox; the previous version's sandbox finishes its in-flight calls, then stops (zero
 *     downtime update)
 *
 * Packages live in the DB, so the Next app, the worker and every instance load the same bytes —
 * no shared file system. Loading is lazy: the sandbox process starts on the first call.
 */

const VERSION_KEY = "payhub:connectors:ver";
const CHECK_INTERVAL_MS = 1000;
const FALLBACK_RELOAD_MS = 5000;

export interface PluginEntry {
  code: string;
  connectorType: string;
  name: string;
  version: string;
  packageId: number | null;
  publisherKey: string | null;
  manifest: ConnectorManifest | null;
  isActive: boolean;
  /** Why the package could not be loaded in this process (null = loaded) */
  loadError: string | null;
  sandbox: PluginSandbox | null;
  dir: string | null;
}

interface Catalog {
  version: string | null;
  loadedAt: number;
  byCode: Map<string, PluginEntry>;
}

let catalog: Catalog | null = null;
let lastCheck = 0;
let reloading: Promise<Catalog> | null = null;

// ─── Package directory (per process) ──────────────────────────────────────────

let processDir: string | null = null;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** This process's own directory; leftovers of dead processes are removed once. */
function ownDir(): string {
  if (processDir) return processDir;
  const base = pluginBaseDir();
  for (const name of readdirSync(base)) {
    const pid = Number(name.split("-")[0]);
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && !pidAlive(pid)) {
      rmSync(path.join(base, name), { recursive: true, force: true });
    }
  }
  processDir = mkdtempSync(path.join(base, `${process.pid}-`));
  return processDir;
}

function extract(code: string, files: Map<string, Uint8Array>): string {
  const dir = mkdtempSync(path.join(ownDir(), `${code}-`));
  for (const [name, data] of files) {
    const target = path.join(dir, name);
    // safeEntryPath() already refused "..", absolute paths and odd characters; belt and braces:
    if (!target.startsWith(dir + path.sep)) throw new Error(`unsafe path ${name}`);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, data, { mode: 0o600 });
  }
  return dir;
}

function retire(entry: PluginEntry): void {
  entry.sandbox?.dispose();
  const dir = entry.dir;
  if (dir) {
    // after the sandbox grace period
    setTimeout(() => rmSync(dir, { recursive: true, force: true }), 35_000).unref();
  }
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

async function readVersion(): Promise<string | null | undefined> {
  try {
    return await getRedis().get(VERSION_KEY);
  } catch {
    return undefined; // Redis unavailable
  }
}

async function load(version: string | null): Promise<Catalog> {
  const prisma = getPrisma();
  const rows = await prisma.connector.findMany({ where: { source: "plugin" } });
  const prev = catalog?.byCode ?? new Map<string, PluginEntry>();
  const next = new Map<string, PluginEntry>();

  for (const row of rows) {
    const old = prev.get(row.code);
    const base = {
      code: row.code,
      connectorType: row.connectorType ?? row.code,
      name: row.name,
      isActive: row.isActive,
    };
    if (old && old.packageId === row.currentPackageId && old.packageId !== null && !old.loadError) {
      next.set(row.code, { ...old, ...base });
      continue;
    }
    const entry: PluginEntry = {
      ...base,
      version: row.version,
      packageId: row.currentPackageId,
      publisherKey: null,
      manifest: null,
      loadError: null,
      sandbox: null,
      dir: null,
    };
    try {
      const pkg = row.currentPackageId
        ? await prisma.connectorPackage.findUnique({ where: { id: row.currentPackageId } })
        : null;
      if (!pkg) throw new Error("Chưa có gói cài đặt");
      const verified = verifyPackage(new Uint8Array(pkg.package));
      if (verified.manifest.code !== row.code) throw new Error("Gói không khớp mã connector");
      entry.manifest = verified.manifest;
      entry.version = verified.manifest.version;
      entry.publisherKey = verified.keyId;
      entry.dir = extract(row.code, verified.files);
      entry.sandbox = new PluginSandbox({
        code: row.code,
        dir: entry.dir,
        entry: verified.manifest.entry,
        allowedHosts: verified.manifest.network.allowedHosts,
      });
    } catch (e) {
      entry.loadError =
        e instanceof PackageError
          ? `${e.message}${e.issues.length ? ` (${e.issues.join("; ")})` : ""}`
          : e instanceof Error
            ? e.message
            : String(e);
      console.error(`[connectors] plugin ${row.code} not loaded: ${entry.loadError}`);
    }
    next.set(row.code, entry);
    if (old) retire(old);
  }
  for (const [code, old] of prev) if (!next.has(code)) retire(old);

  return { version, loadedAt: Date.now(), byCode: next };
}

function reload(version: string | null): Promise<Catalog> {
  if (!reloading) {
    reloading = load(version)
      .then((c) => {
        catalog = c;
        return c;
      })
      .finally(() => {
        reloading = null;
      });
  }
  return reloading;
}

/** Current plugin catalog, reloaded when another process / request changed connectors. */
export async function ensureCatalog(): Promise<Map<string, PluginEntry>> {
  const now = Date.now();
  if (catalog && now - lastCheck < CHECK_INTERVAL_MS) return catalog.byCode;
  lastCheck = now;
  const version = await readVersion();
  if (
    !catalog ||
    (version === undefined
      ? now - catalog.loadedAt > FALLBACK_RELOAD_MS
      : (version ?? null) !== catalog.version)
  ) {
    return (await reload(version ?? null)).byCode;
  }
  return catalog.byCode;
}

/** Snapshot without I/O (after ensureCatalog was awaited in this request). */
export function catalogSnapshot(): Map<string, PluginEntry> {
  return catalog?.byCode ?? new Map();
}

/** Signal every process that connectors changed, and reload this one now. */
export async function bumpCatalogVersion(): Promise<void> {
  let version: string | null = null;
  try {
    version = String(await getRedis().incr(VERSION_KEY));
  } catch (e) {
    console.error(
      `[connectors] could not publish catalog change (Redis): ${e instanceof Error ? e.message : e}`,
    );
  }
  lastCheck = Date.now();
  await reload(version);
}

/** Stop every sandbox of this process (tests / shutdown). */
export function disposeCatalog(): void {
  for (const entry of catalog?.byCode.values() ?? []) retire(entry);
  catalog = null;
  lastCheck = 0;
}
