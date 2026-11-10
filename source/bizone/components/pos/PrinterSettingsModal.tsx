"use client";

import { useEffect, useState } from "react";
import { Bluetooth, Printer, Usb } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  loadPrinterSettings,
  pairBluetoothPrinter,
  pairUsbPrinter,
  printerSupport,
  printTestPage,
  savePrinterSettings,
  type PrinterKind,
  type PrinterSettings,
} from "@/lib/printing/printer";
import { errorMessage } from "@/components/inventory/shared";

const KINDS: { kind: PrinterKind; label: string; icon: React.ElementType; hint: string }[] = [
  {
    kind: "browser",
    label: "Hộp thoại in",
    icon: Printer,
    hint: "In qua trình duyệt (window.print) — mọi máy in, có dấu tiếng Việt",
  },
  { kind: "usb", label: "USB (WebUSB)", icon: Usb, hint: "In thẳng ESC/POS qua cổng USB" },
  {
    kind: "bluetooth",
    label: "Bluetooth",
    icon: Bluetooth,
    hint: "Máy in nhiệt BLE — ghép lại sau mỗi lần tải trang",
  },
];

/** Cài đặt máy in hoá đơn của máy POS này (lưu trên trình duyệt) */
export function PrinterSettingsModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (s: PrinterSettings) => void;
}) {
  const [s, setS] = useState<PrinterSettings>(loadPrinterSettings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [support, setSupport] = useState({ usb: false, bluetooth: false });

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setS(loadPrinterSettings());
    setMsg(null);
    setSupport(printerSupport());
  }, [open]);

  async function pair() {
    setMsg(null);
    try {
      if (s.kind === "usb") {
        const d = await pairUsbPrinter();
        setS((x) => ({ ...x, deviceName: d.name, usb: d }));
      } else if (s.kind === "bluetooth") {
        const d = await pairBluetoothPrinter();
        setS((x) => ({ ...x, deviceName: d.name }));
      }
      setMsg({ ok: true, text: "Đã chọn máy in — bấm In thử" });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  }

  async function test() {
    setMsg(null);
    try {
      await printTestPage(s);
      setMsg({ ok: true, text: "Đã gửi trang in thử" });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  }

  function save() {
    savePrinterSettings(s);
    onSaved(s);
    onClose();
  }

  const supported = s.kind === "browser" || support[s.kind];

  return (
    <Modal open={open} onClose={onClose} title="Máy in hoá đơn" size="md">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kiểu máy in">
          {KINDS.map(({ kind, label, icon: Icon }) => (
            <button
              key={kind}
              role="radio"
              aria-checked={s.kind === kind}
              onClick={() => setS((x) => ({ ...x, kind }))}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-sm",
                s.kind === kind ? "border-blue-600 bg-blue-50 font-semibold" : "border-gray-200",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-gray-600">{KINDS.find((k) => k.kind === s.kind)?.hint}</p>
        {!supported && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Trình duyệt này không hỗ trợ {s.kind === "usb" ? "WebUSB" : "Web Bluetooth"} — dùng
            Chrome / Edge trên máy tính (https hoặc localhost).
          </p>
        )}
        {s.kind !== "browser" && (
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void pair()}
                disabled={!supported}
                className="h-11 rounded-lg border border-gray-300 px-4 text-sm disabled:opacity-40"
              >
                Ghép máy in
              </button>
              <span className="text-sm text-gray-600">{s.deviceName ?? "Chưa chọn thiết bị"}</span>
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                Khổ giấy
                <select
                  value={s.paper}
                  onChange={(e) =>
                    setS((x) => ({ ...x, paper: Number(e.target.value) as 58 | 80 }))
                  }
                  className="h-10 rounded border border-gray-300 bg-white px-2"
                >
                  <option value={80}>80 mm</option>
                  <option value={58}>58 mm</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.openDrawer}
                  onChange={(e) => setS((x) => ({ ...x, openDrawer: e.target.checked }))}
                  className="h-5 w-5"
                />
                Mở két tiền khi in
              </label>
            </div>
            <p className="text-xs text-gray-500">
              In ESC/POS bỏ dấu tiếng Việt (bảng mã tiếng Việt khác nhau theo máy in).
            </p>
          </>
        )}
        {msg && (
          <p className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</p>
        )}
        <div className="flex justify-end gap-2">
          {s.kind !== "browser" && (
            <button
              onClick={() => void test()}
              disabled={!supported}
              className="h-11 rounded-lg border border-gray-300 px-4 text-sm disabled:opacity-40"
            >
              In thử
            </button>
          )}
          <button
            onClick={save}
            className="h-11 rounded-lg bg-blue-600 px-5 font-semibold text-white"
          >
            Lưu
          </button>
        </div>
      </div>
    </Modal>
  );
}
