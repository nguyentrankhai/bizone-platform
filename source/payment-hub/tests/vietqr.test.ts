import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import {
  buildVietQrPayload,
  crc16,
  noteForTxnCode,
  normalizeNote,
  parseTlv,
  parseVietQrPayload,
  renderQrPng,
  VietQrError,
} from "@/services/qr/vietqr";

const account = { bin: "970436", accountNo: "0011001234567", accountName: "CONG TY BIZONE DEMO" };

describe("VietQR payload (EMVCo)", () => {
  it("uses CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("encodes bank, account, amount, note and a valid CRC", () => {
    const payload = buildVietQrPayload({ account, amount: 150000, note: "TXN20261104ABC123" });
    const top = parseTlv(payload);
    expect(top["00"]).toBe("01");
    expect(top["01"]).toBe("12");
    expect(top["53"]).toBe("704");
    expect(top["58"]).toBe("VN");
    expect(top["38"]).toBe(
      "0010A000000727" + "0127" + "0006970436" + "01130011001234567" + "0208QRIBFTTA",
    );
    const parsed = parseVietQrPayload(payload);
    expect(parsed).toEqual({
      bin: "970436",
      accountNo: "0011001234567",
      amount: 150000,
      note: "TXN20261104ABC123",
      dynamic: true,
      crcValid: true,
    });
    expect(payload.endsWith(crc16(payload.slice(0, -4)))).toBe(true);
  });

  it("detects a tampered payload through the CRC", () => {
    const payload = buildVietQrPayload({ account, amount: 150000, note: "A" });
    const tampered = payload.replace("5406150000", "5406950000");
    expect(parseVietQrPayload(tampered).crcValid).toBe(false);
  });

  it("normalises the transfer note for bank apps", () => {
    expect(normalizeNote("Thanh toán đơn #12 – Cửa hàng")).toBe("Thanh toan don 12 Cua han"); // 25-char limit;
    expect(normalizeNote("x".repeat(40))).toHaveLength(25);
    expect(noteForTxnCode("TXN-20261104-A1B2C3")).toBe("TXN20261104A1B2C3");
  });

  it("rejects invalid input", () => {
    expect(() => buildVietQrPayload({ account, amount: 0, note: "" })).toThrow(VietQrError);
    expect(() => buildVietQrPayload({ account, amount: 1.5, note: "" })).toThrow(VietQrError);
    expect(() =>
      buildVietQrPayload({ account: { ...account, bin: "97043" }, amount: 1000, note: "" }),
    ).toThrow(/BIN/);
    expect(() =>
      buildVietQrPayload({ account: { ...account, accountNo: "12-34" }, amount: 1000, note: "" }),
    ).toThrow(/Account/);
  });
});

describe("VietQR image", () => {
  it.each([200, 300, 500] as const)(
    "renders a %ipx PNG that decodes back to the payload",
    async (size) => {
      const payload = buildVietQrPayload({ account, amount: 1500000, note: "TXN20261104A1B2C3" });
      const png = PNG.sync.read(await renderQrPng(payload, size));
      expect(png.width).toBe(size);
      expect(png.height).toBe(size);
      const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      expect(decoded?.data).toBe(payload);
    },
  );
});
