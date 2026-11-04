import QRCode from "qrcode";

/**
 * VietQR — NAPAS 247 bank-transfer QR in EMVCo merchant-presented format (SRS-PH-TXN-02-03).
 *
 * The payload carries the beneficiary bank (BIN), account number, amount and transfer note;
 * any Vietnamese banking app that supports NAPAS 247 reads it and pre-fills the transfer.
 * EMVCo/VietQR has no expiry field: expiry is enforced by Payment Hub (qr_codes.expires_at).
 */

export const QR_SIZES = [200, 300, 500] as const;
export type QrSize = (typeof QR_SIZES)[number];

export interface VietQrAccount {
  /** NAPAS bank BIN, 6 digits — e.g. 970436 (Vietcombank) */
  bin: string;
  accountNo: string;
  accountName?: string;
}

export interface VietQrInput {
  account: VietQrAccount;
  /** VND, integer > 0 */
  amount: number;
  /** Transfer note — normalised to what bank apps accept (A–Z, 0–9, space; ≤ 25 chars) */
  note: string;
}

/** NAPAS AID for VietQR + service code "transfer to account" */
const NAPAS_AID = "A000000727";
const SERVICE_TO_ACCOUNT = "QRIBFTTA";

const BIN_RE = /^\d{6}$/;
const ACCOUNT_RE = /^[0-9A-Za-z]{1,19}$/;

export class VietQrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VietQrError";
  }
}

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new VietQrError(`EMVCo field ${id} is too long`);
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as required by EMVCo tag 63 */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Bank apps only accept unaccented A–Z, 0–9 and spaces in the transfer note. */
export function normalizeNote(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 25)
    .trim();
}

/** Transfer note for a Payment Hub transaction: the txn code without separators (reconciliation key). */
export function noteForTxnCode(txnCode: string): string {
  return txnCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function validateAccount(account: VietQrAccount): void {
  if (!BIN_RE.test(account.bin)) throw new VietQrError("Bank BIN must be 6 digits");
  if (!ACCOUNT_RE.test(account.accountNo)) {
    throw new VietQrError("Account number must be 1–19 letters/digits");
  }
}

/** Build the EMVCo/VietQR payload string (dynamic QR: one amount, one payment). */
export function buildVietQrPayload({ account, amount, note }: VietQrInput): string {
  validateAccount(account);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new VietQrError("Amount must be a positive integer (VND)");
  }
  if (String(amount).length > 13) throw new VietQrError("Amount is too large");

  const beneficiary = tlv("00", account.bin) + tlv("01", account.accountNo);
  const merchantInfo = tlv(
    "38",
    tlv("00", NAPAS_AID) + tlv("01", beneficiary) + tlv("02", SERVICE_TO_ACCOUNT),
  );
  const cleanNote = normalizeNote(note);

  const body =
    tlv("00", "01") + // payload format indicator
    tlv("01", "12") + // point of initiation: 12 = dynamic
    merchantInfo +
    tlv("53", "704") + // currency VND
    tlv("54", String(amount)) +
    tlv("58", "VN") +
    (cleanNote ? tlv("62", tlv("08", cleanNote)) : "") +
    "6304";
  return body + crc16(body);
}

/** Parse a flat EMVCo TLV string into { id: value } (one level). */
export function parseTlv(data: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < data.length) {
    const id = data.slice(i, i + 2);
    const len = Number(data.slice(i + 2, i + 4));
    if (id.length < 2 || !Number.isInteger(len)) throw new VietQrError("Malformed TLV");
    const value = data.slice(i + 4, i + 4 + len);
    if (value.length !== len) throw new VietQrError("Malformed TLV (truncated)");
    out[id] = value;
    i += 4 + len;
  }
  return out;
}

export interface ParsedVietQr {
  bin: string;
  accountNo: string;
  amount: number | null;
  note: string | null;
  dynamic: boolean;
  crcValid: boolean;
}

/** Decode a VietQR payload (used by tests and to double-check what we hand out). */
export function parseVietQrPayload(payload: string): ParsedVietQr {
  const top = parseTlv(payload);
  const merchant = parseTlv(top["38"] ?? "");
  if (merchant["00"] !== NAPAS_AID) throw new VietQrError("Not a NAPAS VietQR payload");
  const beneficiary = parseTlv(merchant["01"] ?? "");
  const additional = top["62"] ? parseTlv(top["62"]) : {};
  const crcValid = top["63"] === crc16(payload.slice(0, payload.length - 4));
  return {
    bin: beneficiary["00"] ?? "",
    accountNo: beneficiary["01"] ?? "",
    amount: top["54"] ? Number(top["54"]) : null,
    note: additional["08"] ?? null,
    dynamic: top["01"] === "12",
    crcValid,
  };
}

/** Render the payload as a PNG of exactly `size`×`size` pixels. */
export async function renderQrPng(payload: string, size: QrSize): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: "png",
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
