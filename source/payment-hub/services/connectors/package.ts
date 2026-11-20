import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";
import { unzipSync } from "fflate";
import { parseManifest, type ConnectorManifest } from "./manifest";

/**
 * Connector plugin package (P7.1): a zip with
 *   manifest.json   — see ./manifest.ts
 *   <entry>.mjs     — a self-contained ES module (bundle; no node_modules, no bare imports)
 *   SIGNATURE.json  — { algorithm: "ed25519", keyId, signature } over the package listing
 *   (anything else: README.md, CHANGELOG.md, assets read by the entry …)
 *
 * The signed message is the listing of every other file — "path\nsha256hex\n" sorted by path, after
 * the line "payhub-connector-v1" — so adding, removing or changing any file breaks the signature.
 * Only keys listed in CONNECTOR_TRUSTED_KEYS are accepted: an admin account alone cannot install
 * code; the publisher's private key is needed too (decision P7.1). The check runs at upload and
 * again every time a process loads the package (a key removed from the env revokes its plugins).
 */

export const MAX_PACKAGE_BYTES = 5 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 100;
export const SIGNATURE_FILE = "SIGNATURE.json";
export const MANIFEST_FILE = "manifest.json";
const SIGNED_PREFIX = "payhub-connector-v1\n";

export class PackageError extends Error {
  constructor(
    public readonly code: "INVALID_PACKAGE" | "INVALID_SIGNATURE" | "UNTRUSTED_KEY",
    message: string,
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "PackageError";
  }
}

// ─── Trusted publisher keys ───────────────────────────────────────────────────

export interface TrustedKey {
  keyId: string;
  key: KeyObject;
}

const KEY_ID = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * CONNECTOR_TRUSTED_KEYS="keyId=<base64 SPKI DER of an Ed25519 public key>,keyId2=…"
 * (scripts/connector-plugin.mjs keygen prints the value). Invalid entries are skipped with a log.
 */
export function parseTrustedKeys(raw: string | undefined): TrustedKey[] {
  const out: TrustedKey[] = [];
  for (const entry of (raw ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const keyId = trimmed.slice(0, eq).trim();
    const b64 = trimmed.slice(eq + 1).trim();
    if (eq <= 0 || !KEY_ID.test(keyId)) {
      console.error(
        `[connectors] CONNECTOR_TRUSTED_KEYS: invalid entry "${trimmed.slice(0, 20)}…"`,
      );
      continue;
    }
    try {
      const key = createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" });
      if (key.asymmetricKeyType !== "ed25519") throw new Error("not an Ed25519 key");
      out.push({ keyId, key });
    } catch (e) {
      console.error(
        `[connectors] CONNECTOR_TRUSTED_KEYS: key "${keyId}" unusable: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
  return out;
}

let keysCache: { raw: string | undefined; keys: TrustedKey[] } | null = null;

export function trustedKeys(): TrustedKey[] {
  const raw = process.env.CONNECTOR_TRUSTED_KEYS;
  if (!keysCache || keysCache.raw !== raw) keysCache = { raw, keys: parseTrustedKeys(raw) };
  return keysCache.keys;
}

// ─── Reading the zip ──────────────────────────────────────────────────────────

const SAFE_PATH = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/;

/** Path inside the package that is safe to extract (relative, no "..", plain characters). */
export function safeEntryPath(name: string): boolean {
  return (
    name.length <= 200 &&
    SAFE_PATH.test(name) &&
    !name.split("/").some((seg) => seg === "." || seg === "..")
  );
}

/** Unpack a package zip: file path → content. Throws PackageError on anything suspicious. */
export function unpack(buf: Uint8Array): Map<string, Uint8Array> {
  if (buf.byteLength > MAX_PACKAGE_BYTES) {
    throw new PackageError("INVALID_PACKAGE", `Gói vượt quá ${MAX_PACKAGE_BYTES / 1024 / 1024} MB`);
  }
  if (!(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
    throw new PackageError("INVALID_PACKAGE", "Tệp không phải zip");
  }
  const issues: string[] = [];
  let declared = 0;
  let count = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buf, {
      filter(file) {
        if (file.name.endsWith("/")) return false; // directory entry
        count++;
        if (!safeEntryPath(file.name)) issues.push(`đường dẫn không hợp lệ: ${file.name}`);
        if (file.compression !== 0 && file.compression !== 8) {
          issues.push(`kiểu nén không hỗ trợ: ${file.name}`);
        }
        // Declared sizes bound what fflate inflates (it never grows the output past them).
        declared += file.originalSize;
        return issues.length === 0 && count <= MAX_FILES && declared <= MAX_UNPACKED_BYTES;
      },
    });
  } catch (e) {
    throw new PackageError(
      "INVALID_PACKAGE",
      `Không đọc được zip: ${e instanceof Error ? e.message : e}`,
    );
  }
  if (count > MAX_FILES) issues.push(`quá ${MAX_FILES} tệp`);
  if (declared > MAX_UNPACKED_BYTES) {
    issues.push(`dung lượng giải nén vượt ${MAX_UNPACKED_BYTES / 1024 / 1024} MB`);
  }
  if (issues.length) throw new PackageError("INVALID_PACKAGE", "Gói không hợp lệ", issues);
  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (files.has(name.toLowerCase())) issues.push(`trùng tên tệp: ${name}`);
    files.set(name, data);
  }
  if (issues.length) throw new PackageError("INVALID_PACKAGE", "Gói không hợp lệ", issues);
  return files;
}

// ─── Signature ────────────────────────────────────────────────────────────────

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** The message the publisher signs (every file except SIGNATURE.json). */
export function signedMessage(files: Map<string, Uint8Array>): Buffer {
  const lines = [...files.keys()]
    .filter((p) => p !== SIGNATURE_FILE)
    .sort()
    .map((p) => `${p}\n${sha256(files.get(p)!)}\n`);
  return Buffer.from(SIGNED_PREFIX + lines.join(""), "utf8");
}

interface SignatureFile {
  algorithm: string;
  keyId: string;
  signature: string;
}

function readSignature(files: Map<string, Uint8Array>): SignatureFile {
  const raw = files.get(SIGNATURE_FILE);
  if (!raw) throw new PackageError("INVALID_SIGNATURE", `Gói chưa ký (thiếu ${SIGNATURE_FILE})`);
  try {
    const sig = JSON.parse(Buffer.from(raw).toString("utf8")) as Partial<SignatureFile>;
    if (
      sig.algorithm !== "ed25519" ||
      typeof sig.keyId !== "string" ||
      typeof sig.signature !== "string"
    ) {
      throw new Error("shape");
    }
    return sig as SignatureFile;
  } catch {
    throw new PackageError("INVALID_SIGNATURE", `${SIGNATURE_FILE} không hợp lệ`);
  }
}

/** Verify the package signature against the trusted keys → the key id that signed it. */
export function verifySignature(
  files: Map<string, Uint8Array>,
  keys: TrustedKey[] = trustedKeys(),
): string {
  const sig = readSignature(files);
  const trusted = keys.find((k) => k.keyId === sig.keyId);
  if (!trusted) {
    throw new PackageError(
      "UNTRUSTED_KEY",
      `Khoá ký "${sig.keyId.slice(0, 64)}" không nằm trong danh sách nhà phát hành tin cậy (CONNECTOR_TRUSTED_KEYS)`,
    );
  }
  const ok = verify(null, signedMessage(files), trusted.key, Buffer.from(sig.signature, "base64"));
  if (!ok) {
    throw new PackageError(
      "INVALID_SIGNATURE",
      "Chữ ký không khớp nội dung gói (gói bị sửa sau khi ký?)",
    );
  }
  return trusted.keyId;
}

// ─── Whole package ────────────────────────────────────────────────────────────

export interface VerifiedPackage {
  manifest: ConnectorManifest;
  files: Map<string, Uint8Array>;
  sha256: string;
  keyId: string;
  size: number;
}

/** Unpack, verify the signature, validate the manifest and the entry file. */
export function verifyPackage(
  buf: Uint8Array,
  keys: TrustedKey[] = trustedKeys(),
): VerifiedPackage {
  const files = unpack(buf);
  const keyId = verifySignature(files, keys);
  const manifestRaw = files.get(MANIFEST_FILE);
  if (!manifestRaw) throw new PackageError("INVALID_PACKAGE", `Thiếu ${MANIFEST_FILE}`);
  const manifest = parseManifest(Buffer.from(manifestRaw).toString("utf8"));
  if (!files.has(manifest.entry)) {
    throw new PackageError("INVALID_PACKAGE", `Thiếu tệp entry ${manifest.entry}`);
  }
  return { manifest, files, sha256: sha256(buf), keyId, size: buf.byteLength };
}
