import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isPaid,
  isTerminal,
  isTxnStatus,
} from "@/server/services/stateMachine";

describe("transaction state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("Created", "Pending")).toBe(true);
    expect(canTransition("Pending", "Success")).toBe(true);
    expect(canTransition("Success", "PartiallyRefunded")).toBe(true);
    expect(canTransition("PartiallyRefunded", "Refunded")).toBe(true);
  });

  it("never lets a paid transaction expire or fail", () => {
    expect(() => assertTransition("Success", "Expired")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("Success", "Failed")).toThrow(InvalidTransitionError);
  });

  it("treats Failed/Expired/Refunded as terminal", () => {
    for (const s of ["Failed", "Expired", "Refunded"] as const) expect(isTerminal(s)).toBe(true);
    expect(isTerminal("Pending")).toBe(false);
  });

  it("knows which statuses mean money was received", () => {
    expect(isPaid("Success")).toBe(true);
    expect(isPaid("Refunded")).toBe(true);
    expect(isPaid("Pending")).toBe(false);
  });

  it("validates status strings from query params", () => {
    expect(isTxnStatus("Pending")).toBe(true);
    expect(isTxnStatus("pending")).toBe(false);
    expect(isTxnStatus("constructor")).toBe(false);
  });
});
