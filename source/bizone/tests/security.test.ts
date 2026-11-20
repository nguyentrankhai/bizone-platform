import { randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncrypted } from "@/lib/crypto";
import { isPushServiceEndpoint } from "@/lib/notifications/push-endpoint";
import { grantRefusal, manageRefusal, roleEditRefusal, type RoleInfo } from "@/lib/staff/privilege";
import {
  readBodyLimited,
  sniffFileType,
  UPLOAD_LIMITS,
  UploadError,
  validateUpload,
  zipEntries,
} from "@/lib/upload";
import { createProductSchema } from "@/lib/validators/product";
import type { Permission } from "@/types/auth";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script>');

async function xlsx(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("A").addRow(["x"]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function uploadError(fn: () => unknown): UploadError {
  try {
    fn();
  } catch (e) {
    if (e instanceof UploadError) return e;
    throw e;
  }
  throw new Error("expected UploadError");
}

describe("P6.6 upload validation", () => {
  it("sniffs types from content", () => {
    expect(sniffFileType(PNG)).toBe("png");
    expect(sniffFileType(JPG)).toBe("jpg");
    expect(sniffFileType(new TextEncoder().encode("GIF89a...."))).toBe("gif");
    expect(sniffFileType(SVG)).toBeNull();
  });

  it("accepts images up to 10 MB, never SVG", () => {
    expect(validateUpload(PNG, "image")).toMatchObject({ type: "png", contentType: "image/png" });
    expect(uploadError(() => validateUpload(SVG, "image")).status).toBe(415);
    const big = new Uint8Array(UPLOAD_LIMITS.image + 1);
    big.set(PNG);
    expect(uploadError(() => validateUpload(big, "image"))).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      status: 413,
    });
    expect(uploadError(() => validateUpload(new Uint8Array(0), "image")).status).toBe(400);
  });

  it("accepts a real .xlsx up to 50 MB, refuses other files renamed .xlsx", async () => {
    const file = await xlsx();
    expect(zipEntries(file)?.some((e) => e.name === "xl/workbook.xml")).toBe(true);
    expect(validateUpload(file, "excel").type).toBe("xlsx");
    expect(uploadError(() => validateUpload(PNG, "excel")).code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(
      uploadError(() => validateUpload(new TextEncoder().encode("a,b\n1,2"), "excel")).status,
    ).toBe(415);
    expect(UPLOAD_LIMITS.excel).toBe(50 * 1024 * 1024);
  });

  it("refuses a zip bomb before inflating it", async () => {
    const file = await xlsx();
    const bomb = Uint8Array.from(file);
    const view = new DataView(bomb.buffer);
    // patch the first central-directory entry's uncompressed size to 4 GB − 1
    for (let i = 0; i < bomb.length - 4; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 0xfffffffe, true);
        break;
      }
    expect(uploadError(() => validateUpload(bomb, "excel")).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("stops reading a body as soon as it passes the limit", async () => {
    const declared = new Request("http://x/", {
      method: "POST",
      body: "x".repeat(20),
      headers: { "content-length": "20" },
    });
    await expect(readBodyLimited(declared, 10)).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });

    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(8));
        if (pulled > 100) c.close();
      },
    });
    const chunked = new Request("http://x/", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expect(readBodyLimited(chunked, 20)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(pulled).toBeLessThan(10);

    const ok = new Request("http://x/", { method: "POST", body: "hello" });
    expect(new TextDecoder().decode(await readBodyLimited(ok, 10))).toBe("hello");
  });
});

describe("P6.6 privilege escalation (#98)", () => {
  const caps = (...c: string[]) => new Set(c as Permission[]);
  const role = (code: string, isSystem: boolean, ...c: string[]): RoleInfo => ({
    code,
    name: code,
    isSystem,
    capabilities: caps(...c),
  });
  const hr = { isAdmin: false, capabilities: caps("staff:write", "staff:read", "pos:write") };
  const admin = { isAdmin: true, capabilities: caps("admin:*") };

  it("only admins grant admin / manager", () => {
    expect(grantRefusal(hr, role("admin", true, "admin:*"))).toMatch(/Chỉ Quản trị viên/);
    expect(grantRefusal(hr, role("manager", true, "report:read"))).toMatch(/Chỉ Quản trị viên/);
    expect(grantRefusal(admin, role("admin", true, "admin:*"))).toBeNull();
  });

  it("nobody grants a role with a capability they lack", () => {
    expect(grantRefusal(hr, role("custom_x", false, "pos:write"))).toBeNull();
    expect(grantRefusal(hr, role("custom_y", false, "pos:write", "accounting:fund"))).toMatch(
      /accounting:fund/,
    );
  });

  it("nobody manages a staff member more powerful than themselves", () => {
    expect(manageRefusal(hr, [role("admin", true, "admin:*")])).toMatch(/Chỉ Quản trị viên/);
    expect(manageRefusal(hr, [role("custom", false, "report:read")])).toMatch(/report:read/);
    expect(manageRefusal(hr, [role("seller", true, "pos:write")])).toBeNull();
    expect(manageRefusal(hr, [])).toBeNull();
    expect(manageRefusal(admin, [role("admin", true, "admin:*")])).toBeNull();
  });

  it("custom roles can't carry capabilities the editor lacks", () => {
    expect(roleEditRefusal(hr, caps("pos:write"))).toBeNull();
    expect(roleEditRefusal(hr, caps("pos:write", "staff:view_audit_log"))).toMatch(
      /staff:view_audit_log/,
    );
  });
});

describe("P6.6 secrets at rest (AES-256-GCM)", () => {
  const prev = { d: process.env.DATA_ENCRYPTION_KEY, o: process.env.OMNI_TOKEN_KEY };
  beforeAll(() => {
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });
  afterAll(() => {
    process.env.DATA_ENCRYPTION_KEY = prev.d;
    process.env.OMNI_TOKEN_KEY = prev.o;
  });

  it("round-trips, randomises and detects tampering", () => {
    const a = encryptSecret("shop-token");
    const b = encryptSecret("shop-token");
    expect(isEncrypted(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("shop-token");
    const parts = a.split(":");
    const data = Buffer.from(parts[4], "base64");
    data[0] ^= 1;
    parts[4] = data.toString("base64");
    expect(decryptSecret(parts.join(":"))).toBeNull();
    expect(decryptSecret("plain")).toBeNull();
  });

  it("falls back to OMNI_TOKEN_KEY so P6.2 tokens still decrypt", () => {
    const key = randomBytes(32).toString("base64");
    process.env.DATA_ENCRYPTION_KEY = "";
    process.env.OMNI_TOKEN_KEY = key;
    const stored = encryptSecret("x");
    process.env.DATA_ENCRYPTION_KEY = key;
    expect(decryptSecret(stored)).toBe("x");
  });
});

describe("P6.6 XSS / SSRF input rules", () => {
  it("product images must be http(s) links", () => {
    const base = { name: "A", sku: "SKU-1", sellingPrice: 1000, unit: "cái" };
    expect(
      createProductSchema.safeParse({ ...base, images: ["javascript:alert(1)"] }).success,
    ).toBe(false);
    expect(createProductSchema.safeParse({ ...base, image: "data:text/html,<b>" }).success).toBe(
      false,
    );
    expect(
      createProductSchema.safeParse({ ...base, images: ["https://cdn.example.com/a.png"] }).success,
    ).toBe(true);
  });

  it("push endpoints must be a known push service", () => {
    expect(isPushServiceEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushServiceEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(
      true,
    );
    expect(isPushServiceEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushServiceEndpoint("https://10.0.0.5/admin")).toBe(false);
    expect(isPushServiceEndpoint("https://fcm.googleapis.com.evil.vn/x")).toBe(false);
    expect(isPushServiceEndpoint("https://evilpush.apple.com/x")).toBe(false);
    expect(isPushServiceEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushServiceEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
  });
});
