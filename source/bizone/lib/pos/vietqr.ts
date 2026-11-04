/**
 * VietQR (NAPAS 247, EMVCo merchant-presented) payload for bank-transfer payments.
 * The customer's banking app reads bank, account, amount and the note from it.
 * Payment Hub (P3.4) will generate QR for its own transactions; this one is the
 * shop's direct bank account shown at the counter.
 */

export interface BankAccount {
  /** NAPAS bank BIN, e.g. 970436 (Vietcombank) */
  bin: string;
  accountNo: string;
  accountName?: string;
  bankName?: string;
}

const field = (id: string, value: string) =>
  `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE as required by EMVCo tag 63 */
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Bank apps only accept unaccented A–Z, 0–9 and spaces in the note */
function plainNote(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 25);
}

export function vietQrPayload(account: BankAccount, amount: number, note: string): string {
  const merchant = field(
    "38",
    field("00", "A000000727") +
      field("01", field("00", account.bin) + field("01", account.accountNo)) +
      field("02", "QRIBFTTA"),
  );
  const body =
    field("00", "01") +
    field("01", "12") + // dynamic QR: one amount, one payment
    merchant +
    field("53", "704") + // VND
    field("54", String(Math.round(amount))) +
    field("58", "VN") +
    field("62", field("08", plainNote(note))) +
    "6304";
  return body + crc16(body);
}
