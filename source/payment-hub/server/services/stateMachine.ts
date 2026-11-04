/**
 * Payment Hub Transaction State Machine
 *
 * Valid transitions:
 *   Created   → Pending | Expired
 *   Pending   → Success | Failed | Expired
 *   Success   → Refunded | PartiallyRefunded
 *   PartiallyRefunded → Refunded
 *   Failed    → (terminal)
 *   Expired   → (terminal)
 *   Refunded  → (terminal)
 */

export type TxnStatus =
  "Created" | "Pending" | "Success" | "Failed" | "Expired" | "Refunded" | "PartiallyRefunded";

const VALID_TRANSITIONS: Record<TxnStatus, TxnStatus[]> = {
  Created: ["Pending", "Expired"],
  Pending: ["Success", "Failed", "Expired"],
  Success: ["Refunded", "PartiallyRefunded"],
  PartiallyRefunded: ["Refunded"],
  Failed: [],
  Expired: [],
  Refunded: [],
};

export function isTxnStatus(value: string): value is TxnStatus {
  return Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, value);
}

export class InvalidTransitionError extends Error {
  constructor(from: TxnStatus, to: TxnStatus) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: TxnStatus, to: TxnStatus): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function canTransition(from: TxnStatus, to: TxnStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminal(status: TxnStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0;
}

export function isPaid(status: TxnStatus): boolean {
  return status === "Success" || status === "PartiallyRefunded" || status === "Refunded";
}
