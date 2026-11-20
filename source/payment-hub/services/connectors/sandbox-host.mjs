// Connector plugin sandbox host (P7.1) — runs ONE plugin in its own Node process.
//
// Started by services/connectors/sandbox.ts with:
//   node --permission --allow-fs-read=<this file> --allow-fs-read=<plugin dir>
//        --max-old-space-size=… --disallow-code-generation-from-strings sandbox-host.mjs
// and a minimal environment (no DATABASE_URL, no keys of the Hub). The permission model blocks
// file writes, child processes, worker threads, native addons and reads outside the plugin
// directory. On top of it this host:
//   - only lets the plugin import a few side-effect-free built-ins (crypto, buffer, url…) and
//     files of its own package — not node:net / http / tls / child_process / fs / vm / module…
//   - replaces fetch with one that only reaches the hosts of the manifest (network.allowedHosts)
//     plus the endpoints of the partner config of the current call, and removes WebSocket /
//     EventSource
//   - runs every call inside an AsyncLocalStorage scope carrying that call's allowed hosts.
// Plain JavaScript on purpose: it is executed as-is (never bundled by Next / esbuild).

import { AsyncLocalStorage } from "node:async_hooks";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ALLOWED_BUILTINS = new Set([
  "crypto",
  "buffer",
  "url",
  "querystring",
  "util",
  "events",
  "string_decoder",
  "zlib",
  "timers",
  "timers/promises",
  "assert",
]);

const scope = new AsyncLocalStorage();
let pluginDir = "";
let manifestHosts = [];
let mod = null;

function hostAllowed(host, patterns) {
  const h = String(host).toLowerCase().replace(/\.$/, "");
  return patterns.some((p) =>
    p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p,
  );
}

function installImportGuard() {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const bare = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
      if (ALLOWED_BUILTINS.has(bare)) return nextResolve(`node:${bare}`, context);
      if (specifier.startsWith("node:")) {
        throw new Error(`Plugin không được import ${specifier}`);
      }
      const resolved = nextResolve(specifier, context);
      if (resolved.url.startsWith("node:")) {
        throw new Error(`Plugin không được import ${specifier}`);
      }
      if (!resolved.url.startsWith("file:")) {
        throw new Error(`Plugin chỉ được import tệp trong gói (${specifier})`);
      }
      const file = fileURLToPath(resolved.url);
      if (file !== pluginDir && !file.startsWith(pluginDir + path.sep)) {
        throw new Error(`Plugin chỉ được import tệp trong gói (${specifier})`);
      }
      return resolved;
    },
  });
}

function installNetworkGuard() {
  const realFetch = globalThis.fetch;
  const guarded = async function fetch(input, init) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`fetch: giao thức ${url.protocol} không được phép`);
    }
    const callHosts = scope.getStore()?.hosts ?? [];
    if (!hostAllowed(url.hostname, [...manifestHosts, ...callHosts])) {
      throw new Error(
        `fetch: host ${url.hostname} không nằm trong network.allowedHosts / endpoint của cấu hình`,
      );
    }
    // No automatic redirects to hosts outside the list.
    const res = await realFetch(input, { ...init, redirect: "manual" });
    return res;
  };
  Object.defineProperty(globalThis, "fetch", { value: guarded, writable: false });
  for (const name of ["WebSocket", "EventSource"]) {
    try {
      Object.defineProperty(globalThis, name, { value: undefined, writable: false });
    } catch {
      // not defined in this Node version
    }
  }
}

function hostsOfConfig(config) {
  const out = [];
  for (const u of [config?.endpoint, config?.apiEndpoint]) {
    if (!u) continue;
    try {
      out.push(new URL(u).hostname.toLowerCase());
    } catch {
      // ignored: an invalid endpoint simply adds no host
    }
  }
  return out;
}

function serializeError(e) {
  if (e && typeof e === "object") {
    return {
      name: String(e.name ?? "Error").slice(0, 100),
      message: String(e.message ?? e).slice(0, 2000),
      code: typeof e.code === "string" ? e.code.slice(0, 50) : undefined,
    };
  }
  return { name: "Error", message: String(e).slice(0, 2000) };
}

/** Methods a connector instance must have (IConnector) */
const REQUIRED = [
  "createTransaction",
  "processResult",
  "verifySignature",
  "refund",
  "getStatus",
  "getConfigSchema",
  "healthCheck",
];
const OPTIONAL = ["queryRefund", "generateQR", "submitDispute", "queryDispute"];
const CALLABLE = new Set([...REQUIRED, ...OPTIONAL]);

async function handle(msg) {
  switch (msg.op) {
    case "probe": {
      if (typeof mod.createConnector !== "function") {
        throw new Error("Module không export hàm createConnector(config)");
      }
      const instance = mod.createConnector(msg.config);
      const missing = REQUIRED.filter((m) => typeof instance?.[m] !== "function");
      if (missing.length) throw new Error(`Connector thiếu phương thức: ${missing.join(", ")}`);
      return {
        code: String(instance.code ?? ""),
        version: String(instance.version ?? ""),
        optional: OPTIONAL.filter((m) => typeof instance[m] === "function"),
        callbackKeys: typeof mod.callbackKeys === "function",
        configSchema: await instance.getConfigSchema(),
      };
    }
    case "invoke": {
      if (!CALLABLE.has(msg.method)) throw new Error(`Phương thức không hợp lệ: ${msg.method}`);
      const instance = mod.createConnector(msg.config);
      const fn = instance?.[msg.method];
      if (typeof fn !== "function") throw new Error(`Connector không có ${msg.method}`);
      return await fn.apply(instance, msg.args ?? []);
    }
    case "callbackKeys": {
      if (typeof mod.callbackKeys !== "function") throw new Error("Plugin không có callbackKeys");
      return await mod.callbackKeys(...(msg.args ?? []));
    }
    default:
      throw new Error(`op không hợp lệ: ${msg.op}`);
  }
}

process.on("message", (msg) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "init") {
    pluginDir = path.resolve(msg.dir);
    manifestHosts = Array.isArray(msg.allowedHosts) ? msg.allowedHosts.map(String) : [];
    installImportGuard();
    installNetworkGuard();
    import(pathToFileURL(path.join(pluginDir, msg.entry)).href).then(
      (m) => {
        mod = m;
        process.send({ type: "ready" });
      },
      (e) => {
        process.send({ type: "fatal", error: serializeError(e) }, () => process.exit(1));
      },
    );
    return;
  }
  if (msg.type !== "call" || !mod) return;
  const hosts = hostsOfConfig(msg.config);
  scope.run({ hosts }, () => {
    Promise.resolve()
      .then(() => handle(msg))
      .then(
        (value) => process.send({ type: "result", id: msg.id, ok: true, value }),
        (e) => process.send({ type: "result", id: msg.id, ok: false, error: serializeError(e) }),
      )
      .catch((e) => {
        // the value could not be serialized
        process.send({ type: "result", id: msg.id, ok: false, error: serializeError(e) });
      });
  });
});

process.on("uncaughtException", (e) => {
  try {
    process.send({ type: "fatal", error: serializeError(e) }, () => process.exit(1));
  } catch {
    process.exit(1);
  }
});
process.on("unhandledRejection", (e) => {
  console.error(`[plugin] unhandled rejection: ${serializeError(e).message}`);
});
process.on("disconnect", () => process.exit(0));
