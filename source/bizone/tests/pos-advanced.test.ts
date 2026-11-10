import { afterEach, describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { HeldCartError, mergeLines, splitLines, type CartLine } from "@/lib/pos/held";
import { CMD, encodeReceipt, row, toAscii, wrap, type ReceiptData } from "@/lib/printing/escpos";
import { payhubConfig, signPayhubRequest } from "@/server/services/payment/paymentHubClient";
import { settlePayments } from "@/server/services/payment.service";
import { merchantTxnIdOf, parseMerchantTxnId } from "@/server/services/payhubPayment.service";
import {
  cancelPreorderSchema,
  createInvoiceSchema,
  createPreorderSchema,
  exchangeSchema,
  pairDisplaySchema,
} from "@/lib/validators/pos";

const line = (id: string, productId: number, quantity: number, variantId: number | null = null) =>
  ({ id, productId, variantId, quantity, discountPercent: 0 }) satisfies CartLine;

describe("split / merge bills (P4.5)", () => {
  const cart = [line("a", 1, 3), line("b", 2, 1), line("c", 3, 2, 9)];

  it("moves part of a line and a whole line into the new bill", () => {
    const { stay, moved } = splitLines(cart, [
      { itemId: "a", quantity: 1 },
      { itemId: "b", quantity: 1 },
    ]);
    expect(stay.map((l) => [l.id, l.quantity])).toEqual([
      ["a", 2],
      ["c", 2],
    ]);
    expect(moved.map((l) => [l.productId, l.quantity])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    // moved lines get fresh ids so both carts stay consistent
    expect(moved.every((m) => !["a", "b", "c"].includes(m.id))).toBe(true);
    // input untouched
    expect(cart[0].quantity).toBe(3);
  });

  it("rejects moving everything, too much, nothing, or an unknown line", () => {
    const all = cart.map((l) => ({ itemId: l.id, quantity: l.quantity }));
    expect(() => splitLines(cart, all)).toThrow(HeldCartError);
    expect(() => splitLines(cart, [{ itemId: "a", quantity: 4 }])).toThrow(/vượt/);
    expect(() => splitLines(cart, [{ itemId: "a", quantity: 0 }])).toThrow(/Chọn/);
    expect(() => splitLines(cart, [{ itemId: "zz", quantity: 1 }])).toThrow(/không còn/);
  });

  it("merges held bills: same product + variant summed, others appended", () => {
    const merged = mergeLines(
      [line("a", 1, 2)],
      [line("x", 1, 1), line("y", 3, 1, 9)],
      [line("z", 3, 2, 9), line("w", 3, 1, 8)],
    );
    expect(merged.map((l) => [l.productId, l.variantId, l.quantity])).toEqual([
      [1, null, 3],
      [3, 9, 3],
      [3, 8, 1],
    ]);
  });
});

describe("ESC/POS receipt (P4.5)", () => {
  const receipt: ReceiptData = {
    store: { name: "Cửa hàng Đông Á", address: "12 Lê Lợi, Quận 1", phone: "0281234567" },
    invoiceCode: "HD2611100001",
    createdAt: "2026-11-10T03:04:00Z",
    cashier: "Nguyễn Văn Tuấn",
    customer: { name: "Trần Thị Lan", phone: "0909000111" },
    items: [
      { name: "Bánh mì đặc biệt", quantity: 2, unitPrice: 25000, discountAmount: 0, total: 50000 },
      { name: "Cà phê sữa đá", quantity: 1, unitPrice: 30000, discountAmount: 5000, total: 25000 },
    ],
    subtotal: 80000,
    discountAmount: 5000,
    taxAmount: 0,
    total: 75000,
    payments: [
      { method: "cash", amount: 100000 },
      { method: "exchange", amount: 0 },
    ],
    paid: 100000,
    change: 25000,
  };

  it("folds Vietnamese to ASCII", () => {
    expect(toAscii("Bánh mì Đặc biệt — đỏ")).toBe("Banh mi Dac biet ? do");
  });

  it("lays out rows and wraps to the paper width", () => {
    expect(row("Tong", "75.000", 20)).toBe("Tong          75.000");
    expect(row("Mot ten rat dai khong vua", "75.000", 20)).toHaveLength(20);
    expect(wrap("Banh mi dac biet nhieu thit", 10)).toEqual(["Banh mi", "dac biet", "nhieu thit"]);
    expect(wrap("ABCDEFGHIJKLMNO", 6)).toEqual(["ABCDEF", "GHIJKL", "MNO"]);
  });

  it("encodes init … cut, ASCII only, lines within 48 / 32 columns", () => {
    for (const paper of [80, 58] as const) {
      const bytes = encodeReceipt(receipt, { paper });
      expect([...bytes.slice(0, 2)]).toEqual([...CMD.init]);
      expect([...bytes.slice(-4)]).toEqual([...CMD.cut]);
      // printable bytes are ASCII (control codes aside)
      const text = Buffer.from(bytes).toString("latin1");
      expect(text).toContain("HD2611100001");
      expect(text).toContain("Banh mi dac biet");
      expect(text).toContain("75.000");
      expect(text).toContain("Tien thua");
      const width = paper === 80 ? 48 : 32;
      let plain = text;
      for (const c of Object.values(CMD))
        plain = plain.split(Buffer.from(c).toString("latin1")).join("");
      const lines = plain.split("\n");
      expect(lines.some((l) => /^TONG CONG +75\.000$/.test(l))).toBe(true);
      expect(lines.every((l) => l.length <= width)).toBe(true);
    }
  });

  it("kicks the cash drawer only when asked", () => {
    const has = (b: Uint8Array) => Buffer.from(b).includes(Buffer.from(CMD.drawer));
    expect(has(encodeReceipt(receipt))).toBe(false);
    expect(has(encodeReceipt(receipt, { openDrawer: true }))).toBe(true);
  });
});

describe("Payment Hub client (P4.5)", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("signs like Payment Hub lib/hmac.ts (METHOD\\nPATH\\nTS\\nsha256(body))", () => {
    const body = '{"amount":10000}';
    const expected = createHmac("sha256", "sec")
      .update(
        `POST\n/api/v1/transactions\n1762240000\n${createHash("sha256").update(body).digest("hex")}`,
      )
      .digest("hex");
    expect(signPayhubRequest("sec", "post", "/api/v1/transactions", "1762240000", body)).toBe(
      expected,
    );
  });

  it("treats missing / placeholder credentials as not configured", () => {
    process.env.PAYHUB_API_URL = "http://localhost:4000/api/";
    process.env.PAYHUB_API_KEY = "dev-payhub-key";
    process.env.PAYHUB_API_SECRET = "s";
    expect(payhubConfig()).toBeNull();
    process.env.PAYHUB_API_KEY = "pk_live";
    expect(payhubConfig()).toEqual({
      baseUrl: "http://localhost:4000/api",
      apiKey: "pk_live",
      apiSecret: "s",
    });
    delete process.env.PAYHUB_API_SECRET;
    expect(payhubConfig()).toBeNull();
  });

  it("maps merchant_txn_id ↔ tenant + intent", () => {
    const id = merchantTxnIdOf("tenant_demo-2", 42);
    expect(id).toBe("BZ-tenant_demo-2-42");
    expect(parseMerchantTxnId(id)).toEqual({ tenantId: "tenant_demo-2", intentId: 42 });
    expect(parseMerchantTxnId("ORDER-1")).toBeNull();
    expect(parseMerchantTxnId(null)).toBeNull();
  });
});

describe("credit lines & validators (P4.5)", () => {
  it("exchange / deposit credit counts as non-cash payment", () => {
    expect(settlePayments(100_000, [{ method: "exchange", amount: 100_000 }])).toMatchObject({
      paid: 100_000,
      change: 0,
    });
    expect(
      settlePayments(100_000, [
        { method: "deposit", amount: 60_000 },
        { method: "cash", amount: 50_000 },
      ]),
    ).toMatchObject({ change: 10_000, netCash: 40_000 });
    expect(() => settlePayments(100_000, [{ method: "deposit", amount: 60_000 }])).toThrow(/thiếu/);
  });

  it("clients can't send credit methods", () => {
    const base = {
      cashSessionId: 1,
      items: [{ productId: 1, quantity: 1 }],
      idempotencyKey: "12345678",
    };
    expect(
      createInvoiceSchema.safeParse({ ...base, payments: [{ method: "exchange", amount: 1 }] })
        .success,
    ).toBe(false);
    expect(
      createInvoiceSchema.safeParse({
        ...base,
        payments: [{ method: "qr", amount: 1, intentId: 5 }],
      }).success,
    ).toBe(true);
  });

  it("pre-order needs a customer, a deposit and a valid due date", () => {
    const ok = {
      cashSessionId: 1,
      customerId: 3,
      items: [{ productId: 1, quantity: 2 }],
      dueDate: "2026-11-12",
      deposit: { method: "cash", amount: 50_000 },
      idempotencyKey: "12345678",
    };
    expect(createPreorderSchema.safeParse(ok).success).toBe(true);
    expect(createPreorderSchema.safeParse({ ...ok, customerId: undefined }).success).toBe(false);
    expect(createPreorderSchema.safeParse({ ...ok, dueDate: "12/11/2026" }).success).toBe(false);
    expect(
      createPreorderSchema.safeParse({ ...ok, deposit: { method: "cash", amount: 0 } }).success,
    ).toBe(false);
    expect(cancelPreorderSchema.parse({ id: 1 })).toMatchObject({ refundMethod: "cash" });
  });

  it("exchange needs goods back and new goods; PIN is 6 digits", () => {
    const ex = {
      invoiceId: 1,
      returnItems: [{ invoiceItemId: 1, quantity: 1 }],
      newItems: [{ productId: 2, quantity: 1 }],
      idempotencyKey: "12345678",
    };
    expect(exchangeSchema.safeParse(ex).success).toBe(true);
    expect(exchangeSchema.safeParse({ ...ex, newItems: [] }).success).toBe(false);
    expect(exchangeSchema.safeParse({ ...ex, returnItems: [] }).success).toBe(false);
    expect(pairDisplaySchema.safeParse({ pin: "012345" }).success).toBe(true);
    expect(pairDisplaySchema.safeParse({ pin: "12345" }).success).toBe(false);
    expect(pairDisplaySchema.safeParse({ pin: "12a456" }).success).toBe(false);
  });
});
