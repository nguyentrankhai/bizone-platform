import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { isFreshTimestamp, verifyPayhubSignature } from "@/lib/payhub/webhook";

describe("Payment Hub webhook verification", () => {
  const body = '{"event":"payment.success","transaction_id":"TXN-1"}';
  const sig = createHmac("sha256", "whsec_test").update(`1762240000.${body}`).digest("hex");

  it("accepts the Payment Hub signature", () => {
    expect(verifyPayhubSignature("whsec_test", "1762240000", body, sig)).toBe(true);
  });

  it("rejects a wrong secret, timestamp, body or malformed signature", () => {
    expect(verifyPayhubSignature("whsec_other", "1762240000", body, sig)).toBe(false);
    expect(verifyPayhubSignature("whsec_test", "1762240001", body, sig)).toBe(false);
    expect(verifyPayhubSignature("whsec_test", "1762240000", body.replace("1", "2"), sig)).toBe(
      false,
    );
    expect(verifyPayhubSignature("whsec_test", "1762240000", body, "zz")).toBe(false);
  });

  it("only accepts timestamps within 5 minutes", () => {
    const now = 1762240000_000;
    expect(isFreshTimestamp("1762240000", now)).toBe(true);
    expect(isFreshTimestamp("1762239700", now)).toBe(true);
    expect(isFreshTimestamp("1762239699", now)).toBe(false);
    expect(isFreshTimestamp("1762240000000", now)).toBe(false);
    expect(isFreshTimestamp("", now)).toBe(false);
  });
});
