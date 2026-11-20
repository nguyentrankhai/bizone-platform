/**
 * P6.6 — upload validation: size limits (images 10 MB, Excel 50 MB), file type from the content
 * (magic bytes — the client's name / Content-Type are never trusted), zip-bomb guard for .xlsx,
 * and a body reader that stops as soon as the limit is passed (no buffering of oversized bodies).
 */

const MB = 1024 * 1024;

export const UPLOAD_LIMITS = {
  image: 10 * MB,
  excel: 50 * MB,
} as const;

export type UploadKind = keyof typeof UPLOAD_LIMITS;

/** .xlsx is a zip of XML: total inflated size allowed before exceljs expands it in memory */
export const XLSX_MAX_UNCOMPRESSED_BYTES = 250 * MB;

/** Accepted types per kind (SVG is never accepted as an image: it can carry script) */
export const UPLOAD_TYPES: Record<UploadKind, Record<string, string>> = {
  image: {
    jpg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  },
  excel: {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
};

export type UploadErrorCode = "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_FILE_TYPE" | "VALIDATION_ERROR";

export class UploadError extends Error {
  constructor(
    public readonly code: UploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UploadError";
  }

  get status(): number {
    return this.code === "PAYLOAD_TOO_LARGE"
      ? 413
      : this.code === "UNSUPPORTED_FILE_TYPE"
        ? 415
        : 400;
  }
}

const formatMb = (bytes: number) => `${Math.round(bytes / MB)} MB`;

function startsWith(buf: Uint8Array, ...bytes: number[]): boolean {
  return bytes.every((b, i) => buf[i] === b);
}

function ascii(buf: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...buf.subarray(from, to));
}

/** File type sniffed from the first bytes; `null` = not a type we know. */
export function sniffFileType(buf: Uint8Array): string | null {
  if (startsWith(buf, 0xff, 0xd8, 0xff)) return "jpg";
  if (startsWith(buf, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(ascii(buf, 0, 6))) return "gif";
  if (buf.length >= 12 && ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP")
    return "webp";
  if (startsWith(buf, 0x50, 0x4b, 0x03, 0x04)) return "zip";
  return null;
}

interface ZipEntry {
  name: string;
  uncompressedSize: number;
}

/**
 * Entries of a zip from its central directory (nothing is inflated), or `null` when the buffer
 * is not a readable zip. Zip64 sizes (0xFFFFFFFF) are reported as Infinity.
 */
export function zipEntries(buf: Uint8Array): ZipEntry[] | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length < 22) return null;
  const min = Math.max(0, buf.length - 0xffff - 22);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || view.getUint32(p, true) !== 0x02014b50) return null;
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    if (p + 46 + nameLen > buf.length) return null;
    entries.push({
      name: ascii(buf, p + 46, p + 46 + nameLen),
      uncompressedSize: size === 0xffffffff ? Number.POSITIVE_INFINITY : size,
    });
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return entries;
}

export interface ValidUpload {
  /** extension of the detected type */
  type: string;
  contentType: string;
  size: number;
}

/**
 * Check an uploaded file against the rules of its kind. Throws `UploadError`:
 * PAYLOAD_TOO_LARGE (413), UNSUPPORTED_FILE_TYPE (415), VALIDATION_ERROR (400 — empty / broken).
 */
export function validateUpload(buf: Uint8Array, kind: UploadKind): ValidUpload {
  const limit = UPLOAD_LIMITS[kind];
  if (buf.length === 0) throw new UploadError("VALIDATION_ERROR", "Tệp rỗng");
  if (buf.length > limit)
    throw new UploadError("PAYLOAD_TOO_LARGE", `Tệp vượt quá ${formatMb(limit)}`);

  const accepted = UPLOAD_TYPES[kind];
  const sniffed = sniffFileType(buf);

  if (kind === "excel") {
    if (sniffed !== "zip")
      throw new UploadError("UNSUPPORTED_FILE_TYPE", "Chỉ nhận tệp Excel .xlsx");
    const entries = zipEntries(buf);
    if (!entries) throw new UploadError("VALIDATION_ERROR", "Tệp Excel bị hỏng");
    if (!entries.some((e) => e.name === "xl/workbook.xml"))
      throw new UploadError("UNSUPPORTED_FILE_TYPE", "Chỉ nhận tệp Excel .xlsx");
    const inflated = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
    if (inflated > XLSX_MAX_UNCOMPRESSED_BYTES)
      throw new UploadError(
        "PAYLOAD_TOO_LARGE",
        `Nội dung tệp Excel khi giải nén vượt quá ${formatMb(XLSX_MAX_UNCOMPRESSED_BYTES)}`,
      );
    return { type: "xlsx", contentType: accepted.xlsx, size: buf.length };
  }

  if (!sniffed || !accepted[sniffed])
    throw new UploadError(
      "UNSUPPORTED_FILE_TYPE",
      `Chỉ nhận ảnh ${Object.keys(accepted).join(", ").toUpperCase()}`,
    );
  return { type: sniffed, contentType: accepted[sniffed], size: buf.length };
}

/**
 * Read a request body, refusing it as soon as it passes `maxBytes` — a declared
 * `Content-Length` over the limit is refused before reading anything.
 */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes)
    throw new UploadError("PAYLOAD_TOO_LARGE", `Tệp vượt quá ${formatMb(maxBytes)}`);
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new UploadError("PAYLOAD_TOO_LARGE", `Tệp vượt quá ${formatMb(maxBytes)}`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
