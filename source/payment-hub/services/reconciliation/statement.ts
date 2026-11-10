import ExcelJS from "exceljs";
import { extractTxnCode, type PartnerRecord, type PartnerStatus } from "./engine";

/**
 * Partner / bank statement import (P5.4, SRS-PH-RECON-01-02/06): CSV or Excel → PartnerRecord[].
 *
 * Columns are recognised by header name (case, accents, spaces and `_` ignored), so the files the
 * PSP portals / banks export work without a fixed template. Required: an amount column and a
 * reference column (Payment Hub txn_code, PSP order id or a transfer note containing it) or the
 * partner transaction id. Rows without a status column count as successful payments (bank
 * statement credits).
 */

export class StatementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementError";
  }
}

export const STATEMENT_MAX_BYTES = 10 * 1024 * 1024;
export const STATEMENT_MAX_ROWS = 50_000;

type Field = "ref" | "partnerTxnId" | "amount" | "status" | "time";

/** Header aliases (normalised: lowercase, no accents, letters/digits only). */
const ALIASES: Record<Field, string[]> = {
  ref: [
    "txncode",
    "magdpaymenthub",
    "merchantref",
    "orderid",
    "madonhang",
    "vnptxnref",
    "txnref",
    "apptransid",
    "merchanttxnid",
    "noidung",
    "noidungck",
    "noidungchuyenkhoan",
    "description",
    "content",
    "remark",
    "remarks",
    "diengiai",
    "orderinfo",
    "ref",
  ],
  partnerTxnId: [
    "partnertxnid",
    "transactionno",
    "vnptransactionno",
    "transid",
    "zptransid",
    "magiaodich",
    "magd",
    "magddoitac",
    "reference",
    "sothamchieu",
    "bankref",
    "refno",
    "transactionid",
  ],
  amount: [
    "amount",
    "sotien",
    "credit",
    "ghico",
    "sotienghico",
    "vnpamount",
    "paidamount",
    "money",
  ],
  status: [
    "status",
    "trangthai",
    "result",
    "resultcode",
    "transactionstatus",
    "vnptransactionstatus",
    "returncode",
  ],
  time: [
    "time",
    "date",
    "ngay",
    "thoigian",
    "paidat",
    "paydate",
    "vnppaydate",
    "transactiondate",
    "ngaygiaodich",
    "servertime",
    "responsetime",
    "ngayhachtoan",
  ],
};

export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function mapColumns(headers: string[]): Partial<Record<Field, number>> {
  const norm = headers.map(normalizeHeader);
  const out: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    for (const alias of ALIASES[field]) {
      const i = norm.indexOf(alias);
      if (i >= 0 && !Object.values(out).includes(i)) {
        out[field] = i;
        break;
      }
    }
  }
  return out;
}

/** "1.500.000", "1,500,000", "1500000.00", "1 500 000 ₫" → 1500000 */
export function parseAmount(raw: unknown, vnpayHundredths = false): number | null {
  if (typeof raw === "number")
    return Number.isFinite(raw) ? Math.round(vnpayHundredths ? raw / 100 : raw) : null;
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let digits = s.replace(/[^\d.,-]/g, "");
  // a trailing ".00" / ",00" is a decimal part; other separators group thousands
  digits = digits.replace(/[.,]\d{2}$/, "").replace(/[.,]/g, "");
  const n = Number(digits);
  if (!Number.isFinite(n) || digits === "" || digits === "-") return null;
  return Math.round(vnpayHundredths ? n / 100 : n);
}

const SUCCESS = new Set([
  "success",
  "successful",
  "thanhcong",
  "completed",
  "paid",
  "00",
  "0",
  "1",
  "ok",
  "dathanhtoan",
]);
const PENDING = new Set([
  "pending",
  "processing",
  "dangxuly",
  "choxuly",
  "01",
  "3",
  "7000",
  "1000",
]);

export function parseStatus(raw: unknown): PartnerStatus {
  const s = normalizeHeader(String(raw ?? ""));
  if (!s) return "Success";
  if (SUCCESS.has(s)) return "Success";
  if (PENDING.has(s)) return "Pending";
  return "Failed";
}

/** dd/MM/yyyy[ HH:mm[:ss]], yyyy-MM-dd…, yyyyMMddHHmmss (VNPay) — local times are Vietnam time. */
export function parseTime(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (m) return vn(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return vn(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return vn(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function vn(y: number, mo: number, d: number, h: number, mi: number, se: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h - 7, mi, se));
}

/** RFC 4180-ish CSV (quotes, "" escapes, CRLF), delimiter `,` `;` or tab detected from the header. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  // Delimiter: the one splitting some of the first lines the most (bank exports start with titles)
  const head = clean.split(/\r?\n/).slice(0, 15);
  const score = (d: string) => Math.max(0, ...head.map((l) => l.split(d).length - 1));
  const delim = [",", ";", "\t"].reduce((best, d) => (score(d) > score(best) ? d : best));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row); // blank lines kept: row index = file line
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

async function readXlsx(buf: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new StatementError("File Excel không có sheet nào");
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    while (rows.length < r.number - 1) rows.push([]); // keep row index = sheet row
    const values = (r.values as unknown[]).slice(1).map((v) => {
      if (v && typeof v === "object" && "text" in (v as object))
        return (v as { text: unknown }).text;
      if (v && typeof v === "object" && "result" in (v as object))
        return (v as { result: unknown }).result;
      return v;
    });
    rows.push(values);
  });
  return rows;
}

export interface ParsedStatement {
  records: PartnerRecord[];
  rows: number;
  skipped: { row: number; reason: string }[];
  columns: Partial<Record<Field, string>>;
}

export async function parseStatement(fileName: string, buf: Buffer): Promise<ParsedStatement> {
  if (buf.length === 0) throw new StatementError("File rỗng");
  if (buf.length > STATEMENT_MAX_BYTES) throw new StatementError("File vượt quá 10 MB");
  const lower = fileName.toLowerCase();
  let table: unknown[][];
  if (lower.endsWith(".xlsx")) table = await readXlsx(buf);
  else if (lower.endsWith(".csv") || lower.endsWith(".txt")) table = parseCsv(buf.toString("utf8"));
  else throw new StatementError("Chỉ nhận file .csv hoặc .xlsx");

  // Header = first row naming an amount column (bank exports often start with title lines)
  const headerIdx = table.slice(0, 20).findIndex((r) => {
    const cols = mapColumns(r.map((v) => String(v ?? "")));
    return cols.amount !== undefined && (cols.ref !== undefined || cols.partnerTxnId !== undefined);
  });
  if (headerIdx < 0) {
    throw new StatementError(
      "Không tìm thấy dòng tiêu đề có cột số tiền (amount / số tiền) và cột tham chiếu (txn_code / order_id / nội dung / partner_txn_id)",
    );
  }
  const headers = table[headerIdx]!.map((v) => String(v ?? ""));
  const cols = mapColumns(headers);
  const body = table.slice(headerIdx + 1);
  if (body.length > STATEMENT_MAX_ROWS) {
    throw new StatementError(`File có ${body.length} dòng — tối đa ${STATEMENT_MAX_ROWS}`);
  }
  const vnpAmount =
    cols.amount !== undefined && normalizeHeader(headers[cols.amount]!) === "vnpamount";

  const records: PartnerRecord[] = [];
  const skipped: ParsedStatement["skipped"] = [];
  body.forEach((r, i) => {
    const line = headerIdx + i + 2;
    if (r.every((v) => v === null || v === undefined || String(v).trim() === "")) return;
    const get = (f: Field) => (cols[f] !== undefined ? r[cols[f]!] : undefined);
    const amount = parseAmount(get("amount"), vnpAmount);
    const ref = get("ref") !== undefined ? String(get("ref") ?? "").trim() || null : null;
    const partnerTxnId =
      get("partnerTxnId") !== undefined ? String(get("partnerTxnId") ?? "").trim() || null : null;
    if (amount === null) {
      skipped.push({ row: line, reason: "Thiếu / sai số tiền" });
      return;
    }
    if (amount <= 0) {
      skipped.push({ row: line, reason: "Số tiền ≤ 0 (ghi nợ / hoàn tiền)" });
      return;
    }
    if (!ref && !partnerTxnId) {
      skipped.push({ row: line, reason: "Thiếu tham chiếu giao dịch" });
      return;
    }
    const statusRaw = get("status");
    records.push({
      ref,
      txnCode: extractTxnCode(ref) ?? extractTxnCode(partnerTxnId),
      partnerTxnId,
      amount,
      status: statusRaw === undefined ? "Success" : parseStatus(statusRaw),
      statusText: statusRaw === undefined ? null : String(statusRaw ?? "").slice(0, 50) || null,
      time: parseTime(get("time")),
    });
  });

  const columns: ParsedStatement["columns"] = {};
  for (const [f, i] of Object.entries(cols)) columns[f as Field] = headers[i as number];
  return { records, rows: body.length, skipped, columns };
}
