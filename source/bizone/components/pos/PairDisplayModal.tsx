"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Modal } from "@/components/ui/Modal";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";

/**
 * Thu ngân tạo mã PIN để một thiết bị khác (tablet / màn hình quầy) làm màn hình khách của ca
 * (P4.5). Trên thiết bị đó mở `/pos/display` và nhập PIN.
 */
export function PairDisplayModal({
  open,
  auth,
  sessionId,
  pairedAt,
  onClose,
}: {
  open: boolean;
  auth: ApiAuth;
  sessionId: number;
  /** Set when a display paired while this dialog was open */
  pairedAt: number | null;
  onClose: () => void;
}) {
  const [pin, setPin] = useState<{ pin: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [openedAt, setOpenedAt] = useState(0);

  async function create() {
    setError(null);
    try {
      setPin(await trpc.pos.createPairingPin.mutate({ sessionId }, apiContext(auth)));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenedAt(Date.now());
    void create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!pin) return;
    const tick = () =>
      setLeft(Math.max(0, Math.round((new Date(pin.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pin]);

  const paired = pairedAt !== null && pairedAt >= openedAt;
  const url = typeof location !== "undefined" ? `${location.origin}/pos/display` : "/pos/display";

  return (
    <Modal open={open} onClose={onClose} title="Ghép màn hình khách" size="sm">
      {paired ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="paired">
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
          <p className="text-lg font-semibold">Màn hình khách đã kết nối</p>
          <button onClick={onClose} className="h-11 rounded-lg bg-blue-600 px-6 text-white">
            Đóng
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-gray-600">
            Trên thiết bị hiển thị cho khách, mở <br />
            <code className="rounded bg-gray-100 px-2 py-1 text-sm">{url}</code>
            <br />
            rồi nhập mã:
          </p>
          <p
            className="font-mono text-5xl font-black tracking-[0.3em] text-blue-700"
            data-testid="pairing-pin"
          >
            {pin?.pin ?? "······"}
          </p>
          <p className="text-sm text-gray-500">
            {left > 0
              ? `Hết hạn sau ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} · dùng một lần`
              : "Mã đã hết hạn"}
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={() => void create()}
            className="flex h-11 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Tạo mã mới
          </button>
        </div>
      )}
    </Modal>
  );
}
