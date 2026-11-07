import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { vnDateKey, vnDayRange, vnDayStart } from "@/lib/vn-time";
import { parseProductImport } from "@/lib/excel/product";
import { computeOrderTotals } from "@/server/services/order.service";
import { dashboardCacheKey, netPaymentsByMethod } from "@/server/services/dashboard.service";
import { entityIdOf, isAudited, summarizeInput } from "@/server/middleware/auditLog";

// Regression tests for the QA-2 review findings (#39, #40, #45, #47)

describe("VN business day (#39)", () => {
  it("cuts days at 00:00 UTC+7, not at the server's midnight", () => {
    // 2026-11-07 18:30 UTC = 2026-11-08 01:30 in Vietnam
    const now = new Date("2026-11-07T18:30:00Z");
    expect(vnDayStart(0, now).toISOString()).toBe("2026-11-07T17:00:00.000Z");
    expect(vnDayStart(1, now).toISOString()).toBe("2026-11-06T17:00:00.000Z");
    const { start, end } = vnDayRange(0, now);
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
    expect(vnDateKey(now)).toBe("2026-11-08");
    expect(vnDateKey(new Date("2026-11-07T16:59:59Z"))).toBe("2026-11-07");
  });

  it("scopes dashboard cache keys by tenant", () => {
    expect(dashboardCacheKey("tenant_a", "today")).not.toBe(dashboardCacheKey("tenant_b", "today"));
    expect(dashboardCacheKey("tenant_a", "today")).toBe("dashboard:tenant_a:today");
  });
});

describe("dashboard payment breakdown", () => {
  it("subtracts change (given in cash) from the cash handed over", () => {
    expect(
      netPaymentsByMethod(
        [
          { paymentMethod: "cash", amount: 100_000 },
          { paymentMethod: "transfer", amount: 30_000 },
        ],
        55_000,
      ),
    ).toEqual([
      { method: "cash", label: "Tiền mặt", amount: 45_000 },
      { method: "transfer", label: "Chuyển khoản", amount: 30_000 },
    ]);
  });
});

describe("order totals (#45)", () => {
  const item = { productId: 1, quantity: 2, unitPrice: 10_000, discountAmount: 0 };

  it("computes subtotal and total", () => {
    expect(
      computeOrderTotals({ items: [item], shippingFee: 20_000, discountAmount: 5_000 }),
    ).toEqual({ subtotal: 20_000, totalAmount: 35_000 });
  });

  it("rejects an order discount larger than subtotal + shipping", () => {
    expect(() =>
      computeOrderTotals({ items: [item], shippingFee: 0, discountAmount: 50_000 }),
    ).toThrow(/VALIDATION_ERROR/);
  });

  it("rejects a line discount larger than the line amount", () => {
    expect(() =>
      computeOrderTotals({
        items: [{ ...item, discountAmount: 30_000 }],
        shippingFee: 0,
        discountAmount: 0,
      }),
    ).toThrow(/Dòng 1/);
  });
});

describe("audit middleware helpers (#40)", () => {
  it("audits business mutations but not invoices (logged by invoice.service)", () => {
    expect(isAudited("inventory.confirmTransaction")).toBe(true);
    expect(isAudited("customer.payDebt")).toBe(true);
    expect(isAudited("pos.createInvoice")).toBe(false);
    expect(isAudited("product.list")).toBe(false);
  });

  it("summarizes input without blobs or long arrays", () => {
    expect(
      summarizeInput({ fileBase64: "AAAA", items: [1, 2, 3], data: { status: "confirmed" } }),
    ).toEqual({ fileBase64: "[omitted]", items: { count: 3 }, data: { status: "confirmed" } });
  });

  it("takes the entity id from the result, else from the input", () => {
    expect(entityIdOf({ id: 7 }, { id: 1 })).toBe(7);
    expect(entityIdOf({ success: true }, { stockTakeId: 4 })).toBe(4);
    expect(entityIdOf(undefined, { keepId: 9, mergeId: 3 })).toBe(9);
    expect(entityIdOf(null, {})).toBeNull();
  });
});

describe("product import (#47)", () => {
  async function workbook(rows: unknown[][]): Promise<ArrayBuffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sản phẩm");
    ws.addRow([
      "Tên",
      "SKU",
      "Mã vạch",
      "Danh mục",
      "Mô tả",
      "Giá vốn",
      "Giá bán",
      "ĐVT",
      "Tồn",
      "TT",
    ]);
    rows.forEach((r) => ws.addRow(r));
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  }

  it("keeps sheet row numbers and reports errors in Vietnamese", async () => {
    const result = await parseProductImport(
      await workbook([
        ["Áo", "A-1", "", "", "", 1, 2, "cái", 0, "active"], // row 2 ok
        ["", "A-2", "", "", "", 1, 2, "cái", 0, "active"], // row 3 missing name
        ["Quần", "A-3", "", "", "", 1, -5, "cái", 0, "active"], // row 4 negative price
        ["Áo lặp", "A-1", "", "", "", 1, 2, "cái", 0, "active"], // row 5 dup SKU in file
        ["Mũ", 1001, "", "", "", 1, 2, "cái", 0, "sold"], // row 6 numeric SKU ok, bad status
        ["Nón", "A-6", "", "", "", 1, 2, "cái", 0, "active"], // row 7 ok
      ]),
    );
    expect(result.success.map((r) => [r.rowNumber, r.sku])).toEqual([
      [2, "A-1"],
      [7, "A-6"],
    ]);
    expect(result.errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(result.errors[0].errors).toEqual(["Tên sản phẩm: bắt buộc"]);
    expect(result.errors[1].errors).toEqual(["Giá bán: phải ≥ 0"]);
    expect(result.errors[2].errors).toEqual(["SKU trùng với dòng 2 trong file"]);
    expect(result.errors[3].sku).toBe("1001");
    expect(result.errors[3].errors[0]).toMatch(/^Trạng thái: giá trị không hợp lệ/);
  });
});
