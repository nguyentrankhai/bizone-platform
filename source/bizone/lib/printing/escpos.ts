/**
 * ESC/POS encoder for 58 / 80 mm thermal receipt printers (P4.5) — pure, no browser APIs, so it is
 * unit-tested and shared by the WebUSB / Web Bluetooth transports (lib/printing/printer.ts).
 *
 * Vietnamese: code pages for Vietnamese differ per printer model (and many cheap printers have
 * none), so text is folded to ASCII ("Bánh mì" → "Banh mi"). Printers that can do better use the
 * browser print path (window.print, 80 mm CSS receipt).
 */

export interface ReceiptData {
  store: { name: string; address?: string | null; phone?: string | null };
  invoiceCode: string;
  createdAt: string | Date;
  cashier?: string | null;
  customer?: { name: string; phone?: string | null } | null;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    total: number;
  }[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  payments: { method: string; amount: number }[];
  paid: number;
  change: number;
  status?: string;
}

export type PaperWidth = 58 | 80;
/** Characters per line in font A */
export const COLUMNS: Record<PaperWidth, number> = { 58: 32, 80: 48 };

const ESC = 0x1b;
const GS = 0x1d;

export const CMD = {
  init: [ESC, 0x40],
  alignLeft: [ESC, 0x61, 0],
  alignCenter: [ESC, 0x61, 1],
  alignRight: [ESC, 0x61, 2],
  boldOn: [ESC, 0x45, 1],
  boldOff: [ESC, 0x45, 0],
  /** GS ! — double width + height */
  sizeDouble: [GS, 0x21, 0x11],
  sizeNormal: [GS, 0x21, 0x00],
  /** Feed 4 lines then partial cut */
  cut: [GS, 0x56, 0x42, 0x04],
  /** Kick cash drawer on pin 2 */
  drawer: [ESC, 0x70, 0x00, 0x19, 0xfa],
} as const;

const METHOD: Record<string, string> = {
  cash: "Tien mat",
  transfer: "Chuyen khoan",
  card: "The",
  wallet: "Vi dien tu",
  qr: "QR",
  exchange: "Can tru doi hang",
  deposit: "Tien coc",
};

/** "Bánh mì Đặc biệt" → "Banh mi Dac biet"; anything else non-ASCII becomes "?" */
export function toAscii(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

export const money = (n: number) => Math.round(n).toLocaleString("en-US").replace(/,/g, ".");

/** `left ....... right` on one line (left truncated when both don't fit) */
export function row(left: string, right: string, width: number): string {
  const room = width - right.length - 1;
  const l = left.length > room ? left.slice(0, Math.max(0, room)) : left;
  return l + " ".repeat(Math.max(1, width - l.length - right.length)) + right;
}

/** Word wrap to `width` columns (long words are hard-split) */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > width) {
      if (line) {
        out.push(line);
        line = "";
      }
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += " " + w;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

class Builder {
  private bytes: number[] = [];
  cmd(c: readonly number[]) {
    this.bytes.push(...c);
    return this;
  }
  text(s: string) {
    for (const ch of toAscii(s)) this.bytes.push(ch.charCodeAt(0));
    return this;
  }
  line(s = "") {
    return this.text(s).cmd([0x0a]);
  }
  build() {
    return Uint8Array.from(this.bytes);
  }
}

function fmtDate(d: string | Date) {
  const x = typeof d === "string" ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

/** Receipt → ESC/POS bytes (init … cut). `openDrawer` kicks the cash drawer first. */
export function encodeReceipt(
  r: ReceiptData,
  opts: { paper?: PaperWidth; openDrawer?: boolean; copyLabel?: string } = {},
): Uint8Array {
  const width = COLUMNS[opts.paper ?? 80];
  const dash = "-".repeat(width);
  const b = new Builder().cmd(CMD.init);
  if (opts.openDrawer) b.cmd(CMD.drawer);

  b.cmd(CMD.alignCenter).cmd(CMD.boldOn).cmd(CMD.sizeDouble);
  for (const l of wrap(toAscii(r.store.name), Math.floor(width / 2))) b.line(l);
  b.cmd(CMD.sizeNormal).cmd(CMD.boldOff);
  if (r.store.address) for (const l of wrap(toAscii(r.store.address), width)) b.line(l);
  if (r.store.phone) b.line(`DT: ${r.store.phone}`);
  b.line(dash).cmd(CMD.boldOn).line("HOA DON BAN HANG").cmd(CMD.boldOff);
  if (opts.copyLabel) b.line(`(${opts.copyLabel})`);
  if (r.status === "cancelled") b.cmd(CMD.boldOn).line("*** DA HUY ***").cmd(CMD.boldOff);

  b.cmd(CMD.alignLeft);
  b.line(row("So HD:", r.invoiceCode, width));
  b.line(row("Ngay:", fmtDate(r.createdAt), width));
  if (r.cashier) b.line(row("Thu ngan:", toAscii(r.cashier), width));
  if (r.customer)
    b.line(
      row(
        "Khach:",
        toAscii(r.customer.name + (r.customer.phone ? ` ${r.customer.phone}` : "")),
        width,
      ),
    );
  b.line(dash);

  for (const it of r.items) {
    for (const l of wrap(toAscii(it.name), width)) b.line(l);
    b.line(row(`  ${it.quantity} x ${money(it.unitPrice)}`, money(it.total), width));
    if (it.discountAmount > 0) b.line(row("  Giam", `-${money(it.discountAmount)}`, width));
  }
  b.line(dash);
  b.line(row("Tam tinh", money(r.subtotal), width));
  if (r.discountAmount > 0) b.line(row("Giam gia", `-${money(r.discountAmount)}`, width));
  if (r.taxAmount > 0) b.line(row("VAT (da gom)", money(r.taxAmount), width));
  b.cmd(CMD.boldOn)
    .line(row("TONG CONG", money(r.total), width))
    .cmd(CMD.boldOff);
  for (const p of r.payments) b.line(row(METHOD[p.method] ?? p.method, money(p.amount), width));
  if (r.change > 0) b.line(row("Tien thua", money(r.change), width));
  b.line(dash).cmd(CMD.alignCenter).line("Cam on quy khach!").line("Hen gap lai");
  return b.cmd(CMD.cut).build();
}

/** Short test page for the printer settings dialog */
export function encodeTestPage(paper: PaperWidth = 80): Uint8Array {
  const width = COLUMNS[paper];
  return new Builder()
    .cmd(CMD.init)
    .cmd(CMD.alignCenter)
    .cmd(CMD.boldOn)
    .line("BizOne POS")
    .cmd(CMD.boldOff)
    .line(`In thu - kho ${paper}mm`)
    .line("-".repeat(width))
    .cmd(CMD.alignLeft)
    .line(row("Tieng Viet:", "Banh mi dac biet", width))
    .line("1234567890".repeat(Math.ceil(width / 10)).slice(0, width))
    .cmd(CMD.cut)
    .build();
}
