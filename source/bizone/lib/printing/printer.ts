"use client";

/**
 * Receipt printer transports for the POS (P4.5): WebUSB and Web Bluetooth send ESC/POS bytes from
 * lib/printing/escpos.ts straight to a thermal printer; "browser" keeps the 80 mm CSS receipt +
 * window.print() of P2.6. Chrome/Edge only (Safari/Firefox have neither API) and only on https or
 * localhost. Settings live in localStorage per device.
 */
import { encodeReceipt, encodeTestPage, type PaperWidth, type ReceiptData } from "./escpos";

export type PrinterKind = "browser" | "usb" | "bluetooth";

export interface PrinterSettings {
  kind: PrinterKind;
  paper: PaperWidth;
  openDrawer: boolean;
  /** Human label of the paired device */
  deviceName?: string;
  usb?: { vendorId: number; productId: number; serialNumber?: string };
}

const KEY = "bizone:pos:printer";
export const DEFAULT_PRINTER: PrinterSettings = { kind: "browser", paper: 80, openDrawer: false };

export function loadPrinterSettings(): PrinterSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PRINTER, ...(JSON.parse(raw) as PrinterSettings) } : DEFAULT_PRINTER;
  } catch {
    return DEFAULT_PRINTER;
  }
}

export function savePrinterSettings(s: PrinterSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings last for this page only */
  }
}

// ─── Minimal typings (not in lib.dom) ─────────────────────────────────────────

interface UsbEndpoint {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
}
interface UsbInterface {
  interfaceNumber: number;
  alternate: { endpoints: UsbEndpoint[] };
}
interface UsbDevice {
  vendorId: number;
  productId: number;
  serialNumber?: string;
  productName?: string;
  opened: boolean;
  configuration: { interfaces: UsbInterface[] } | null;
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<unknown>;
}
interface UsbApi {
  requestDevice(o: { filters: object[] }): Promise<UsbDevice>;
  getDevices(): Promise<UsbDevice[]>;
}
interface BtCharacteristic {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithoutResponse?(data: BufferSource): Promise<void>;
  writeValue(data: BufferSource): Promise<void>;
}
interface BtService {
  getCharacteristics(): Promise<BtCharacteristic[]>;
}
interface BtDevice {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryServices(): Promise<BtService[]> }>;
  };
}
interface BtApi {
  requestDevice(o: object): Promise<BtDevice>;
}

const nav = () =>
  (typeof navigator !== "undefined" ? navigator : {}) as { usb?: UsbApi; bluetooth?: BtApi };

export const printerSupport = () => ({ usb: !!nav().usb, bluetooth: !!nav().bluetooth });

/** Service UUIDs used by common BLE receipt printers (Xprinter, Goojprt, MTP, Rongta…) */
const BT_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
];

let btDevice: BtDevice | null = null;
let btChar: BtCharacteristic | null = null;

// ─── Pairing (needs a user gesture) ───────────────────────────────────────────

export async function pairUsbPrinter(): Promise<PrinterSettings["usb"] & { name: string }> {
  const usb = nav().usb;
  if (!usb) throw new Error("Trình duyệt không hỗ trợ WebUSB (dùng Chrome / Edge)");
  // Many printers report a vendor-specific class instead of 7 (printer) → don't filter
  const d = await usb.requestDevice({ filters: [] });
  return {
    vendorId: d.vendorId,
    productId: d.productId,
    serialNumber: d.serialNumber,
    name: d.productName ?? `USB ${d.vendorId.toString(16)}:${d.productId.toString(16)}`,
  };
}

export async function pairBluetoothPrinter(): Promise<{ name: string }> {
  const bt = nav().bluetooth;
  if (!bt) throw new Error("Trình duyệt không hỗ trợ Web Bluetooth (dùng Chrome / Edge)");
  btDevice = await bt.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
  btChar = null;
  return { name: btDevice.name ?? "Máy in Bluetooth" };
}

// ─── Sending ──────────────────────────────────────────────────────────────────

async function sendUsb(bytes: Uint8Array, s: PrinterSettings) {
  const usb = nav().usb;
  if (!usb) throw new Error("Trình duyệt không hỗ trợ WebUSB");
  const devices = await usb.getDevices();
  const d = devices.find(
    (x) =>
      x.vendorId === s.usb?.vendorId &&
      x.productId === s.usb?.productId &&
      (!s.usb?.serialNumber || x.serialNumber === s.usb.serialNumber),
  );
  if (!d) throw new Error("Chưa kết nối máy in USB — ghép lại trong Cài đặt máy in");
  if (!d.opened) await d.open();
  if (!d.configuration) await d.selectConfiguration(1);
  const iface = d.configuration!.interfaces.find((i) =>
    i.alternate.endpoints.some((e) => e.direction === "out" && e.type === "bulk"),
  );
  if (!iface) throw new Error("Thiết bị USB không có cổng ghi (không phải máy in?)");
  const ep = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk")!;
  try {
    await d.claimInterface(iface.interfaceNumber);
  } catch {
    /* already claimed by this page */
  }
  for (let i = 0; i < bytes.length; i += 4096) {
    await d.transferOut(ep.endpointNumber, bytes.slice(i, i + 4096));
  }
}

async function sendBluetooth(bytes: Uint8Array) {
  if (!btDevice?.gatt)
    throw new Error("Máy in Bluetooth chưa kết nối trong phiên này — bấm “Ghép máy in” lại");
  if (!btChar || !btDevice.gatt.connected) {
    const server = await btDevice.gatt.connect();
    btChar = null;
    for (const svc of await server.getPrimaryServices()) {
      const chars = await svc.getCharacteristics();
      btChar = chars.find((c) => c.properties.writeWithoutResponse || c.properties.write) ?? null;
      if (btChar) break;
    }
    if (!btChar) throw new Error("Không tìm thấy kênh ghi của máy in Bluetooth");
  }
  // BLE writes are small; 180 bytes works for most printers (MTU 185)
  for (let i = 0; i < bytes.length; i += 180) {
    const chunk = bytes.slice(i, i + 180);
    if (btChar.properties.writeWithoutResponse && btChar.writeValueWithoutResponse)
      await btChar.writeValueWithoutResponse(chunk);
    else await btChar.writeValue(chunk);
  }
}

export async function sendToPrinter(bytes: Uint8Array, s: PrinterSettings) {
  if (s.kind === "usb") return sendUsb(bytes, s);
  if (s.kind === "bluetooth") return sendBluetooth(bytes);
  throw new Error("Máy in trình duyệt dùng window.print()");
}

/**
 * Print a receipt with the configured printer. Returns false when the caller should fall back to
 * the browser receipt (kind "browser"); throws when a USB/Bluetooth print fails.
 */
export async function printReceipt(data: ReceiptData, s = loadPrinterSettings()): Promise<boolean> {
  if (s.kind === "browser") return false;
  await sendToPrinter(encodeReceipt(data, { paper: s.paper, openDrawer: s.openDrawer }), s);
  return true;
}

export async function printTestPage(s: PrinterSettings) {
  await sendToPrinter(encodeTestPage(s.paper), s);
}
