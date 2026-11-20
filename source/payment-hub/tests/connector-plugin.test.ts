import { generateKeyPairSync } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { embedHost, pack } from "../scripts/connector-plugin.mjs";
import { SANDBOX_HOST_SOURCE } from "@/services/connectors/sandbox-host-source";
import {
  compareSemver,
  hostAllowed,
  parseManifest,
  satisfies,
  ManifestError,
} from "@/services/connectors/manifest";
import {
  PackageError,
  parseTrustedKeys,
  safeEntryPath,
  verifyPackage,
  type TrustedKey,
} from "@/services/connectors/package";
import { PluginSandbox, SandboxError } from "@/services/connectors/sandbox";
import { PluginConnector, PluginOutputError } from "@/services/connectors/plugin-connector";
import type { ConnectorConfig } from "@/services/connectors/types";

const DEMO_DIR = path.join(process.cwd(), "examples/connector-plugins/demopay/plugin");
const demoManifest = () => JSON.parse(readFileSync(path.join(DEMO_DIR, "manifest.json"), "utf8"));

function keyPair(keyId: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  return { pem, entry: `${keyId}=${spki}`, keyId };
}

const tmp: string[] = [];
function tempDir(prefix: string): string {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  tmp.push(d);
  return d;
}

/** A plugin directory = demo plugin with some files replaced. */
function pluginDir(overrides: Record<string, string> = {}): string {
  const dir = tempDir("plugin-");
  for (const f of ["manifest.json", "index.mjs"]) {
    writeFileSync(path.join(dir, f), readFileSync(path.join(DEMO_DIR, f)));
  }
  for (const [name, content] of Object.entries(overrides)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

afterAll(() => {
  for (const d of tmp) rmSync(d, { recursive: true, force: true });
});

describe("sandbox host source", () => {
  it("embedded copy is identical to services/connectors/sandbox-host.mjs (run embed-host)", () => {
    const src = readFileSync(
      path.join(process.cwd(), "services/connectors/sandbox-host.mjs"),
      "utf8",
    );
    expect(SANDBOX_HOST_SOURCE).toBe(src);
    expect(
      readFileSync(path.join(process.cwd(), "services/connectors/sandbox-host-source.ts"), "utf8"),
    ).toBe(embedHost(src));
  });
});

describe("semver", () => {
  it("compares and matches ranges", () => {
    expect(compareSemver("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(satisfies("1.0.0", "^1.0.0")).toBe(true);
    expect(satisfies("1.4.2", "^1.0.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.0.0")).toBe(false);
    expect(satisfies("0.3.1", "^0.3.0")).toBe(true);
    expect(satisfies("0.4.0", "^0.3.0")).toBe(false);
    expect(satisfies("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfies("1.5.0", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfies("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(satisfies("1.0.0", "1.0.0")).toBe(true);
    expect(satisfies("1.0.0", "latest")).toBe(false);
  });
});

describe("manifest", () => {
  it("accepts the DemoPay reference manifest", () => {
    const m = parseManifest(JSON.stringify(demoManifest()));
    expect(m.code).toBe("demopay");
    expect(m.paymentMethods[0]!.method).toBe("demopay_wallet");
    expect(m.capabilities.refund?.partial).toBe(true);
  });

  it("rejects missing changelog entry, duplicate methods, bad codes, incompatible core", () => {
    const issuesOf = (patch: (m: Record<string, unknown>) => void) => {
      const m = demoManifest();
      patch(m);
      try {
        parseManifest(JSON.stringify(m));
        return [];
      } catch (e) {
        return (e as ManifestError).issues;
      }
    };
    expect(issuesOf((m) => (m.version = "1.1.0")).join()).toContain("changelog");
    expect(
      issuesOf((m) => {
        const pms = m.paymentMethods as unknown[];
        pms.push(pms[0]);
      }).join(),
    ).toContain("Trùng phương thức");
    expect(issuesOf((m) => (m.code = "Demo-Pay")).length).toBeGreaterThan(0);
    expect(issuesOf((m) => (m.entry = "../evil.mjs")).length).toBeGreaterThan(0);
    expect(issuesOf((m) => (m.coreCompatibility = "^2.0.0")).join()).toContain("coreCompatibility");
    expect(
      issuesOf(
        (m) =>
          (m.config = {
            ...(m.config as object),
            merchantCode: { label: "x", secret: false, pattern: "(" },
          }),
      ).length,
    ).toBeGreaterThan(0);
    expect(() => parseManifest("{nope")).toThrow(ManifestError);
  });

  it("matches allowed hosts", () => {
    expect(hostAllowed("api.demopay.example", ["api.demopay.example"])).toBe(true);
    expect(hostAllowed("x.psp.vn", ["*.psp.vn"])).toBe(true);
    expect(hostAllowed("psp.vn", ["*.psp.vn"])).toBe(false);
    expect(hostAllowed("evilpsp.vn", ["*.psp.vn"])).toBe(false);
    expect(hostAllowed("example.com", ["api.demopay.example"])).toBe(false);
  });
});

describe("package signature", () => {
  const pub = keyPair("pub-test");
  const other = keyPair("other");
  let keys: TrustedKey[];
  beforeAll(() => {
    keys = parseTrustedKeys(pub.entry);
  });

  it("parses trusted keys and skips invalid entries", () => {
    expect(parseTrustedKeys(`${pub.entry}, bad entry ,x=notakey`).map((k) => k.keyId)).toEqual([
      "pub-test",
    ]);
  });

  it("verifies a package packed by scripts/connector-plugin.mjs", () => {
    const zip = pack(pluginDir(), pub.pem, pub.keyId);
    const v = verifyPackage(zip, keys);
    expect(v.keyId).toBe("pub-test");
    expect(v.manifest.code).toBe("demopay");
    expect([...v.files.keys()].sort()).toEqual(["SIGNATURE.json", "index.mjs", "manifest.json"]);
    expect(v.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses unsigned, tampered, untrusted and malformed packages", () => {
    const signed = pack(pluginDir(), pub.pem, pub.keyId);
    const code = (buf: Uint8Array, k = keys) => {
      try {
        verifyPackage(buf, k);
        return "ok";
      } catch (e) {
        return e instanceof PackageError ? e.code : (e as Error).name;
      }
    };
    // tampered: same signature file, one file changed
    const files = unzipSync(signed);
    files["index.mjs"] = new TextEncoder().encode("export function createConnector(){}\n");
    expect(code(zipSync(files))).toBe("INVALID_SIGNATURE");
    // file added after signing
    const added = unzipSync(signed);
    added["extra.mjs"] = new TextEncoder().encode("1");
    expect(code(zipSync(added))).toBe("INVALID_SIGNATURE");
    // unsigned
    const unsigned = unzipSync(signed);
    delete unsigned["SIGNATURE.json"];
    expect(code(zipSync(unsigned))).toBe("INVALID_SIGNATURE");
    // signed by a key that is not trusted
    expect(code(pack(pluginDir(), other.pem, other.keyId))).toBe("UNTRUSTED_KEY");
    // trusted key id but another private key
    expect(code(pack(pluginDir(), other.pem, pub.keyId))).toBe("INVALID_SIGNATURE");
    // not a zip / path traversal
    expect(code(new TextEncoder().encode("hello"))).toBe("INVALID_PACKAGE");
    expect(code(zipSync({ "../evil.mjs": new Uint8Array([1]) }))).toBe("INVALID_PACKAGE");
    // manifest invalid but correctly signed
    const bad = pluginDir({ "manifest.json": JSON.stringify({ ...demoManifest(), version: "x" }) });
    expect(code(pack(bad, pub.pem, pub.keyId))).toBe("ManifestError");
  });

  it("checks entry paths", () => {
    expect(safeEntryPath("index.mjs")).toBe(true);
    expect(safeEntryPath("lib/util.mjs")).toBe(true);
    for (const p of ["../x", "/etc/passwd", "a/../b", "a\\b", ".hidden", "a//b", "c:x"]) {
      expect(safeEntryPath(p)).toBe(false);
    }
  });

  it("refuses zip bombs by declared size", () => {
    // 21 MB of zeros compresses to a few KB
    const bomb = zipSync({ "manifest.json": new Uint8Array(21 * 1024 * 1024) }, { level: 9 });
    expect(bomb.byteLength).toBeLessThan(100_000);
    const issues = (() => {
      try {
        verifyPackage(bomb, keys);
        return [];
      } catch (e) {
        return (e as PackageError).issues;
      }
    })();
    expect(issues.join()).toMatch(/giải nén/);
  });
});

// ─── Sandbox (real child processes) ──────────────────────────────────────────

describe("sandbox", () => {
  let server: Server;
  let port = 0;
  const calls: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      calls.push(`${req.method} ${req.url}`);
      res.setHeader("content-type", "application/json");
      if (req.url === "/health") return res.end(JSON.stringify({ status: "ok" }));
      if (req.url === "/orders") {
        return res.end(JSON.stringify({ code: "00", pay_url: "http://127.0.0.1/pay/x", qr: "QR" }));
      }
      res.end("{}");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => {
    server.close();
  });

  const config = (over: Partial<ConnectorConfig> = {}): ConnectorConfig => ({
    partnerConfigId: 1,
    connectorType: "DemoPay",
    merchantCode: "DEMO001",
    apiKey: "api-key-123",
    secretKey: "top-secret-value",
    endpoint: `http://127.0.0.1:${port}`,
    environment: "Sandbox",
    timeoutMs: 3000,
    ...over,
  });

  function sandboxFor(files: Record<string, string>, allowedHosts: string[] = []) {
    const dir = tempDir("sbx-");
    for (const [name, content] of Object.entries(files))
      writeFileSync(path.join(dir, name), content);
    return new PluginSandbox({ code: "testplug", dir, entry: "index.mjs", allowedHosts });
  }

  const handle = (sandbox: PluginSandbox) => ({
    code: "demopay",
    version: "1.0.0",
    manifest: parseManifest(JSON.stringify(demoManifest())),
    sandbox,
  });

  it("runs the DemoPay plugin: probe, createTransaction, healthCheck, signature", async () => {
    const sandbox = sandboxFor({
      "index.mjs": readFileSync(path.join(DEMO_DIR, "index.mjs"), "utf8"),
    });
    try {
      const info = await sandbox.call<{ code: string; callbackKeys: boolean }>("probe", {
        config: config(),
      });
      expect(info).toMatchObject({ code: "demopay", callbackKeys: true });
      const c = new PluginConnector(handle(sandbox), config());
      const created = await c.createTransaction({
        txnCode: "TXN-1",
        amount: 50_000,
        currency: "VND",
        description: "test",
        paymentMethod: "demopay_wallet",
        returnUrl: "http://localhost:4000/pay/plugin/demopay/return",
        ipAddress: "127.0.0.1",
        createdAt: new Date(),
        attempt: 2,
      });
      expect(created.paymentUrl).toBe("http://127.0.0.1/pay/x");
      expect(created.partnerRequest.orderId).toBe("TXN-1_2");
      expect(created.partnerQr?.content).toBe("QR");
      expect((await c.healthCheck()).healthy).toBe(true);
      expect(calls).toContain("POST /orders");
      // processResult / verifySignature go through the proxy (async)
      const r = await c.processResult({
        order_id: "TXN-1_2",
        txn_id: "DP1",
        amount: "50000",
        status: "PAID",
        paid_at: "2026-11-20T03:00:00Z",
      });
      expect(r).toMatchObject({ txnCode: "TXN-1", outcome: "Success", amount: 50_000 });
      expect(r.paidAt).toBeInstanceOf(Date);
      expect(await c.verifySignature({ order_id: "TXN-1" }, "bad")).toBe(false);
    } finally {
      sandbox.dispose(0);
    }
  });

  it("blocks fs / child_process / network outside the allowed hosts / eval", async () => {
    const sandbox = sandboxFor({
      "index.mjs": `
        export function createConnector(config) {
          const base = { code: "testplug", version: "1.0.0", processResult() {}, verifySignature() { return true; },
            refund() {}, getStatus() {}, getConfigSchema() { return []; } };
          return { ...base,
            async createTransaction(req) {
              switch (req.txnCode) {
                case "fs": { const fs = await import("node:fs"); return fs.readFileSync("/etc/hosts", "utf8"); }
                case "child": { await import("node:child_process"); return 1; }
                case "net": { await import("node:net"); return 1; }
                case "fetch": return (await fetch("https://example.com")).status;
                case "eval": return eval("1 + 1");
                case "env": return Object.keys(process.env).join(",");
                case "binding": return typeof process.binding("fs");
              }
            },
            async healthCheck() { return { healthy: true, latencyMs: 0, message: "ok" }; },
          };
        }`,
    });
    try {
      const invoke = (txnCode: string) =>
        sandbox
          .call("invoke", { config: config(), method: "createTransaction", args: [{ txnCode }] })
          .then((v) => `ok:${String(v)}`)
          .catch((e: Error) => `err:${e.message}`);
      expect(await invoke("fs")).toMatch(/err:.*node:fs/);
      expect(await invoke("child")).toMatch(/err:.*child_process/);
      expect(await invoke("net")).toMatch(/err:.*node:net/);
      expect(await invoke("fetch")).toMatch(/err:.*example\.com/);
      expect(await invoke("eval")).toMatch(/err:.*Code generation/);
      expect(await invoke("binding")).toMatch(/^err:/);
      const env = await invoke("env");
      expect(env).not.toMatch(/DATABASE_URL|PARTNER_ENCRYPTION_KEY|REDIS/);
      // a method outside IConnector cannot be called
      await expect(
        sandbox.call("invoke", { config: config(), method: "constructor", args: [] }),
      ).rejects.toThrow(/không hợp lệ/);
    } finally {
      sandbox.dispose(0);
    }
  });

  it("isolates hangs and crashes: timeout kills the process, the next call starts a fresh one", async () => {
    const sandbox = sandboxFor({
      "index.mjs": `
        export function createConnector() {
          return { code: "testplug", version: "1.0.0", processResult() {}, verifySignature() { return true; },
            refund() {}, getStatus() {}, getConfigSchema() { return []; },
            async createTransaction(req) {
              if (req.txnCode === "loop") for (;;) {}
              if (req.txnCode === "crash") setTimeout(() => { throw new Error("boom"); }, 0);
              return { paymentUrl: "https://psp.example/pay", partnerRequest: {} };
            },
            async healthCheck() { return { healthy: true, latencyMs: 1, message: "ok" }; } };
        }`,
    });
    try {
      const call = (txnCode: string, timeoutMs = 1000) =>
        sandbox.call<{ paymentUrl: string }>("invoke", {
          config: config(),
          method: "createTransaction",
          args: [{ txnCode }],
          timeoutMs,
        });
      await expect(call("loop")).rejects.toMatchObject({ kind: "timeout" });
      expect((await call("ok")).paymentUrl).toBe("https://psp.example/pay");
      await call("crash");
      await new Promise((r) => setTimeout(r, 300));
      expect((await call("ok")).paymentUrl).toBe("https://psp.example/pay");
    } finally {
      sandbox.dispose(0);
    }
  }, 20_000);

  it("validates what a plugin returns", async () => {
    const sandbox = sandboxFor({
      "index.mjs": `
        export function createConnector() {
          return { code: "demopay", version: "1.0.0", verifySignature() { return "yes"; },
            refund() {}, getStatus() {}, getConfigSchema() { return []; },
            processResult() { return { txnCode: "T", outcome: "Paid", amount: -1, partnerRaw: {} }; },
            async createTransaction() { return { paymentUrl: "javascript:alert(1)", partnerRequest: {} }; },
            async healthCheck() { return { healthy: true, latencyMs: 1, message: "ok" }; } };
        }`,
    });
    try {
      const c = new PluginConnector(handle(sandbox), config());
      await expect(
        c.createTransaction({
          txnCode: "T",
          amount: 1000,
          currency: "VND",
          description: "",
          paymentMethod: "demopay_wallet",
          returnUrl: "",
          ipAddress: "",
          createdAt: new Date(),
        }),
      ).rejects.toBeInstanceOf(PluginOutputError);
      await expect(c.processResult({})).rejects.toBeInstanceOf(PluginOutputError);
      // anything but `true` is "invalid signature"
      expect(await c.verifySignature({}, "x")).toBe(false);
    } finally {
      sandbox.dispose(0);
    }
  });

  it("propagates business error codes thrown by the plugin (no fallback)", async () => {
    const sandbox = sandboxFor({
      "index.mjs": `
        export function createConnector() {
          return { code: "x", version: "1", processResult() {}, verifySignature() {}, refund() {}, getStatus() {},
            getConfigSchema() { return []; }, async healthCheck() {},
            async createTransaction() { const e = new Error("amount too small"); e.code = "VALIDATION_ERROR"; throw e; } };
        }`,
    });
    try {
      const err = await sandbox
        .call("invoke", { config: config(), method: "createTransaction", args: [{}] })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SandboxError);
      expect((err as SandboxError).code).toBe("VALIDATION_ERROR");
    } finally {
      sandbox.dispose(0);
    }
  });
});
