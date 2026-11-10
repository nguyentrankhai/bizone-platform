/**
 * Notification templates: plain text with `{{variable}}` placeholders (notification_templates).
 * Pure helpers shared by the server (sending) and the template form (preview).
 */
export type TemplateVars = Record<string, string | number | null | undefined>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Replace `{{name}}`; unknown variables become an empty string */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(PLACEHOLDER, (_m, name: string) => {
    const v = vars[name];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** Variable names used by a template text (in order, unique) */
export function templateVariables(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Email body: the rendered plain text, escaped, URLs linked, line breaks kept — wrapped in a
 * simple branded layout. Templates never carry raw HTML (store staff edit them).
 */
export function emailHtml(text: string, storeName: string): string {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563EB">$1</a>')
    .replace(/\n/g, "<br>");
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
<div style="background:#2563EB;color:#fff;padding:14px 20px;font-weight:600">${escapeHtml(storeName)}</div>
<div style="padding:20px;font-size:14px;line-height:1.6">${body}</div>
<div style="padding:12px 20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">Gửi từ BizOne</div>
</div></body></html>`;
}

/** SMS text: one line, optional accent stripping (unaccented SMS cost one segment per 160 chars) */
export function smsText(text: string, unicode: boolean): string {
  const oneLine = text.replace(/\s*\n+\s*/g, " ").trim();
  if (unicode) return oneLine;
  // GSM-7 only: one non-ASCII character would switch the whole SMS to UCS-2 (70 chars/segment)
  return oneLine
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/₫/g, "d")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();
}

/** Vietnamese mobile number: 0xxxxxxxxx or +84 / 84 prefix (9 digits after the prefix) */
export const VN_PHONE = /^(?:\+?84|0)(?:3|5|7|8|9)\d{8}$/;

export function normalizePhone(phone: string): string {
  const p = phone.replace(/[\s.-]/g, "");
  if (p.startsWith("+84")) return "0" + p.slice(3);
  if (p.startsWith("84") && p.length === 11) return "0" + p.slice(2);
  return p;
}

export const fmtVnd = (n: number | string | null | undefined) =>
  `${Math.round(Number(n ?? 0)).toLocaleString("vi-VN")}₫`;

/** Comma / newline separated list → trimmed unique values */
export function splitList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
