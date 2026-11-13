/**
 * Dispute (tra soát) rules shared by the service, the API, the admin UI and tests (P5.6,
 * SRS-PH-RECON-02, UC-RECON-02). Pure — no DB / network.
 *
 * Status flow (disputes.status):
 *   Pending     "Đang xử lý" — recorded, not yet sent to the partner
 *   Processing  "Đang xử lý" — sent to the partner (API / e-mail / manually), waiting for an answer
 *   Resolved    "Đã giải quyết" — final, with a resolution
 *   Rejected    "Từ chối" — final (invalid request / partner refused), with a resolution
 * A final dispute is never reopened: a transaction may carry several disputes (SRS-PH-RECON-02-06),
 * so a new complaint is a new dispute.
 */

export const DISPUTE_STATUSES = ["Pending", "Processing", "Resolved", "Rejected"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];
export const OPEN_DISPUTE_STATUSES: DisputeStatus[] = ["Pending", "Processing"];
export const FINAL_DISPUTE_STATUSES: DisputeStatus[] = ["Resolved", "Rejected"];

export type DisputeSubmitChannel = "Api" | "Email" | "Manual";

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  Pending: "Đang xử lý · chưa gửi đối tác",
  Processing: "Đang xử lý · chờ đối tác",
  Resolved: "Đã giải quyết",
  Rejected: "Từ chối",
};

export const DISPUTE_CHANNEL_LABELS: Record<DisputeSubmitChannel, string> = {
  Api: "API đối tác",
  Email: "Email",
  Manual: "Thủ công",
};

/** Reasons offered by the form; free text is always allowed ("Khác"). */
export const DISPUTE_REASONS = [
  "Khách hàng đã bị trừ tiền nhưng giao dịch thất bại / hết hạn",
  "Khách hàng đã thanh toán nhưng chưa nhận được xác nhận (IPN)",
  "Số tiền đối tác ghi nhận khác số tiền giao dịch",
  "Khách hàng khiếu nại không thực hiện giao dịch",
  "Hoàn tiền chưa về tài khoản khách hàng",
  "Lệch đối soát với đối tác",
] as const;

export const DISPUTE_REASON_MIN = 5;
export const DISPUTE_REASON_MAX = 500;
export const DISPUTE_DESCRIPTION_MAX = 5000;
export const DISPUTE_RESOLUTION_MIN = 5;
export const DISPUTE_NOTE_MAX = 2000;
export const DISPUTE_PARTNER_REF_MAX = 255;
/** Guard against runaway creation on one transaction (several disputes are allowed). */
export const MAX_DISPUTES_PER_TXN = 20;

// ─── Attachments ──────────────────────────────────────────────────────────────

/** 5 MB per file (one file per upload request — under the 10 MB proxy body buffer). */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENTS_PER_DISPUTE = 10;
/** Attachments sent with the partner e-mail: total size cap (mail servers often refuse > 20 MB). */
export const EMAIL_ATTACHMENTS_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Allowed evidence files: extension → content type served on download. The type sent by the client
 * is ignored (never trusted); downloads always use `Content-Disposition: attachment` + nosniff.
 */
export const ATTACHMENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  eml: "message/rfc822",
};
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : "";
}

/** Keeps letters (incl. Vietnamese), digits, space, dot, dash, underscore, parentheses. */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").normalize("NFC");
  const cleaned = base
    .replace(/[^\p{L}\p{N} ._()-]+/gu, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();
  const ext = fileExtension(cleaned);
  const stem = ext ? cleaned.slice(0, -(ext.length + 1)) : cleaned;
  const shortStem = stem.slice(0, 120) || "tep-dinh-kem";
  return ext ? `${shortStem}.${ext}` : shortStem;
}

/** Magic bytes of binary formats — a renamed executable is refused. Text formats are not checked. */
function signatureMatches(ext: string, head: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (ext) {
    case "png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "jpg":
    case "jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "gif":
      return starts(0x47, 0x49, 0x46, 0x38);
    case "webp":
      return starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45;
    case "pdf":
      return starts(0x25, 0x50, 0x44, 0x46);
    case "xlsx":
    case "docx":
      return starts(0x50, 0x4b, 0x03, 0x04);
    case "xls":
    case "doc":
      return starts(0xd0, 0xcf, 0x11, 0xe0);
    default:
      return true;
  }
}

export type AttachmentCheck =
  { ok: true; fileName: string; ext: string; contentType: string } | { ok: false; message: string };

export function checkAttachment(name: string, size: number, head: Uint8Array): AttachmentCheck {
  const fileName = sanitizeFileName(name);
  const ext = fileExtension(fileName);
  const contentType = ATTACHMENT_TYPES[ext];
  if (!contentType) {
    return {
      ok: false,
      message: `Không nhận tệp .${ext || "?"} — chỉ nhận ảnh, PDF, Excel, Word, CSV, TXT, EML`,
    };
  }
  if (size <= 0) return { ok: false, message: "Tệp rỗng" };
  if (size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, message: `Tệp vượt quá ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB` };
  }
  if (!signatureMatches(ext, head)) {
    return { ok: false, message: `Nội dung tệp không đúng định dạng .${ext}` };
  }
  return { ok: true, fileName, ext, contentType };
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Codes, eligibility, transitions ──────────────────────────────────────────

/** DSP-YYYYMMDD-XXXXXX, date in Vietnam time (API-Design §6.8). */
export function formatDisputeCode(now: Date, suffix: string): string {
  const vn = new Date(now.getTime() + 7 * 3600_000);
  const ymd =
    vn.getUTCFullYear().toString() +
    String(vn.getUTCMonth() + 1).padStart(2, "0") +
    String(vn.getUTCDate()).padStart(2, "0");
  return `DSP-${ymd}-${suffix}`;
}

/** Transaction statuses shown with the prominent "Tra soát" button (SRS: "khi trạng thái lỗi"). */
export const DISPUTE_HIGHLIGHT_TXN_STATUSES = ["Failed", "Expired", "Pending"];

export interface DisputeEligibility {
  allowed: boolean;
  /** Error state → the button is highlighted */
  highlight: boolean;
  reason: string | null;
}

/**
 * Any transaction that reached a partner can be disputed (failed / expired / stuck pending, but
 * also a paid one the customer complains about — API-Design §6.8 example). `Created` never left the
 * Hub: nothing to ask a partner about.
 */
export function disputeEligibility(txnStatus: string, disputeCount: number): DisputeEligibility {
  const highlight = DISPUTE_HIGHLIGHT_TXN_STATUSES.includes(txnStatus);
  if (txnStatus === "Created") {
    return {
      allowed: false,
      highlight,
      reason: "Giao dịch chưa gửi tới đối tác (Created) — không có gì để tra soát",
    };
  }
  if (disputeCount >= MAX_DISPUTES_PER_TXN) {
    return {
      allowed: false,
      highlight,
      reason: `Giao dịch đã có ${MAX_DISPUTES_PER_TXN} yêu cầu tra soát`,
    };
  }
  return { allowed: true, highlight, reason: null };
}

export const DISPUTE_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  Pending: ["Processing", "Resolved", "Rejected"],
  Processing: ["Processing", "Resolved", "Rejected"],
  Resolved: [],
  Rejected: [],
};

export function canTransition(from: DisputeStatus, to: DisputeStatus): boolean {
  return DISPUTE_TRANSITIONS[from].includes(to);
}

export function isOpen(status: DisputeStatus): boolean {
  return OPEN_DISPUTE_STATUSES.includes(status);
}

/** Comma / semicolon separated e-mail list → normalized addresses (invalid ones dropped). */
export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    const e = part.trim().toLowerCase();
    if (e && EMAIL_RE.test(e)) seen.add(e);
  }
  return [...seen];
}

export const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** Validates a partner dispute e-mail field: up to 5 addresses. Returns an error message or null. */
export function checkEmailList(raw: string): string | null {
  const parts = raw
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length > 5) return "Tối đa 5 địa chỉ email";
  const bad = parts.find((p) => !EMAIL_RE.test(p));
  return bad ? `Email không hợp lệ: ${bad}` : null;
}

// ─── DTOs (admin API, camelCase like the other /api/internal views) ───────────

export interface DisputeAttachmentView {
  id: number;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  uploadedBy: string | null;
  uploadedAt: string;
}

export interface DisputeLogView {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  data: unknown;
  createdBy: string | null;
  createdAt: string;
}

export interface DisputeView {
  id: number;
  disputeCode: string;
  transactionId: number;
  txnCode: string;
  txnStatus: string;
  amount: number;
  currency: string;
  merchant: { id: number; code: string; name: string } | null;
  partner: { id: number; name: string; connectorType: string } | null;
  reason: string;
  description: string | null;
  status: DisputeStatus;
  resolution: string | null;
  submittedToPartner: boolean;
  submitChannel: DisputeSubmitChannel | null;
  submittedAt: string | null;
  partnerRef: string | null;
  partnerResponse: unknown;
  createdBy: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachmentCount: number;
}

export interface DisputeDetail extends DisputeView {
  attachments: DisputeAttachmentView[];
  logs: DisputeLogView[];
}

/** How a dispute of this partner can be sent: connector API, e-mail, or only recorded manually. */
export interface DisputeSubmitOptions {
  api: boolean;
  email: string[];
  /** SMTP not configured → e-mails are only logged by the server (dev) */
  emailLogOnly: boolean;
}

export interface TxnDisputeOverview {
  eligibility: DisputeEligibility;
  submit: DisputeSubmitOptions;
  disputes: DisputeDetail[];
}

export type DisputeErrorCode = "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "PARTNER_ERROR";

export const DISPUTE_ERROR_STATUS: Record<DisputeErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  PARTNER_ERROR: 502,
};

export const DISPUTE_LOG_LABELS: Record<string, string> = {
  created: "Tạo yêu cầu tra soát",
  submitted: "Gửi đối tác",
  submit_failed: "Gửi đối tác thất bại",
  partner_response: "Phản hồi của đối tác",
  status_changed: "Cập nhật trạng thái",
  note: "Ghi chú",
  attachment_added: "Đính kèm tệp",
  attachment_removed: "Xoá tệp đính kèm",
  notified: "Đã gửi thông báo kết quả",
  notify_failed: "Gửi thông báo thất bại",
};

// ─── Partner answers → dispute state (pure, used by the service + tests) ──────

export interface PartnerAnswer {
  /** submit: accepted / refused; query: always true */
  accepted: boolean;
  status?: "Processing" | "Resolved" | "Rejected";
  resolution?: string;
  message?: string;
}

export type AnswerEffect =
  | { kind: "refused"; message: string }
  | { kind: "processing"; message: string | null }
  | { kind: "final"; status: "Resolved" | "Rejected"; resolution: string };

/** What a partner answer does to a dispute: refused (stays as is), waiting, or a final result. */
export function answerEffect(a: PartnerAnswer): AnswerEffect {
  if (!a.accepted) return { kind: "refused", message: a.message || "Đối tác từ chối yêu cầu" };
  if (a.status === "Resolved" || a.status === "Rejected") {
    return {
      kind: "final",
      status: a.status,
      resolution:
        a.resolution?.trim() ||
        a.message?.trim() ||
        (a.status === "Resolved" ? "Đối tác xác nhận đã giải quyết" : "Đối tác từ chối tra soát"),
    };
  }
  return { kind: "processing", message: a.message ?? null };
}
