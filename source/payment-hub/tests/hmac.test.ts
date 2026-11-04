import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildSigningString,
  isTimestampFresh,
  signRequest,
  verifyRequestSignature,
} from "@/lib/hmac";

const secret = "s3cret";
const body = '{"amount":150000}';
const ts = "1718200000";

describe("merchant HMAC signature (OpenAPI MerchantHMAC)", () => {
  it("signs METHOD\\nPATH\\nTIMESTAMP\\nSHA256(body)", () => {
    const bodyHash = createHash("sha256").update(body).digest("hex");
    expect(buildSigningString("post", "/api/v1/transactions", ts, body)).toBe(
      `POST\n/api/v1/transactions\n${ts}\n${bodyHash}`,
    );
    const expected = createHmac("sha256", secret)
      .update(`POST\n/api/v1/transactions\n${ts}\n${bodyHash}`)
      .digest("hex");
    expect(signRequest(secret, "POST", "/api/v1/transactions", ts, body)).toBe(expected);
  });

  it("accepts a valid signature", () => {
    const sig = signRequest(secret, "POST", "/api/v1/transactions", ts, body);
    expect(verifyRequestSignature(secret, "POST", "/api/v1/transactions", ts, body, sig)).toBe(
      true,
    );
  });

  it("rejects a signature replayed on another endpoint or method", () => {
    const sig = signRequest(secret, "GET", "/api/v1/transactions/1", ts, "");
    expect(verifyRequestSignature(secret, "GET", "/api/v1/transactions/2", ts, "", sig)).toBe(
      false,
    );
    expect(verifyRequestSignature(secret, "DELETE", "/api/v1/transactions/1", ts, "", sig)).toBe(
      false,
    );
  });

  it("rejects a tampered body, wrong secret or malformed signature", () => {
    const sig = signRequest(secret, "POST", "/api/v1/transactions", ts, body);
    const path = "/api/v1/transactions";
    expect(verifyRequestSignature(secret, "POST", path, ts, '{"amount":1}', sig)).toBe(false);
    expect(verifyRequestSignature("other", "POST", path, ts, body, sig)).toBe(false);
    expect(verifyRequestSignature(secret, "POST", path, ts, body, "zz")).toBe(false);
    expect(verifyRequestSignature(secret, "POST", path, ts, body, sig.slice(0, 32))).toBe(false);
  });

  it("only accepts Unix-second timestamps within ±300 s", () => {
    const now = 1_718_200_000_000;
    expect(isTimestampFresh("1718200000", now)).toBe(true);
    expect(isTimestampFresh("1718200299", now)).toBe(true);
    expect(isTimestampFresh("1718200301", now)).toBe(false);
    expect(isTimestampFresh("1718200000000", now)).toBe(false); // milliseconds
    expect(isTimestampFresh("abc", now)).toBe(false);
  });
});
