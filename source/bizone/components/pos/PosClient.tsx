"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, HelpCircle, Lock, Monitor, Printer, Wifi, WifiOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { usePosWebSocket } from "@/hooks/usePosWebSocket";
import { useBarcodeScan } from "@/hooks/useBarcodeScan";
import type { PaymentMethod } from "@/lib/validators/pos";
import {
  apiContext,
  errorMessage,
  fmtDate,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { ProductGrid, type ProductGridHandle } from "./ProductGrid";
import { CartPanel, type CartPanelHandle } from "./CartPanel";
import { PaymentModal } from "./PaymentModal";
import { Receipt } from "./Receipt";

type Session = NonNullable<RouterOutputs["pos"]["currentSession"]>;
type StoreInfo = RouterOutputs["pos"]["storeInfo"];
type PrintData = RouterOutputs["pos"]["print"];

export const SHORTCUTS: [string, string][] = [
  ["F1", "Trợ giúp phím tắt"],
  ["F2", "Tìm / quét sản phẩm"],
  ["F3", "Chọn khách hàng"],
  ["F4", "Nhập mã giảm giá"],
  ["F7", "Mở màn hình khách hàng"],
  ["F8", "Xóa giỏ hàng"],
  ["F9", "Thanh toán (trong modal: xác nhận)"],
  ["F10", "In lại hóa đơn gần nhất"],
  ["F12", "Khóa ca"],
  ["Esc", "Đóng hộp thoại"],
];

/** Màn hình nhân viên bán hàng (mockup 02-pos §03) */
export function PosClient({ auth }: { auth: ApiAuth }) {
  const router = useRouter();
  const toast = useToast();
  const gridRef = useRef<ProductGridHandle>(null);
  const cartRef = useRef<CartPanelHandle>(null);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod | null>(null);
  const idemKey = useRef("");
  const [lastInvoiceId, setLastInvoiceId] = useState<number | null>(null);
  const [printData, setPrintData] = useState<PrintData | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    Promise.all([
      trpc.pos.currentSession.query(undefined, apiContext(auth)),
      trpc.pos.storeInfo.query(undefined, apiContext(auth)),
    ])
      .then(([s, st]) => {
        setSession(s);
        setStore(st);
      })
      .catch((e) => {
        toast.error(errorMessage(e));
        setSession(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  const pos = usePosWebSocket({
    sessionId: session?.id ?? 0,
    auth,
    role: "cashier",
    onScanned: (p) => toast.success(`Đã thêm ${p.name}`),
    onError: (m) => toast.error(m),
  });

  const scan = useCallback(
    async (code: string) => {
      try {
        await pos.scan(code);
        return true;
      } catch {
        return false;
      }
    },
    [pos],
  );
  useBarcodeScan((code) => void scan(code), { enabled: !!session && payMethod === null });

  function openPayment(method: PaymentMethod) {
    if (!pos.cart?.lines.length) return;
    idemKey.current = crypto.randomUUID();
    setPayMethod(method);
  }

  const print = useCallback(
    async (invoiceId: number) => {
      try {
        setPrintData(await trpc.pos.print.query({ id: invoiceId }, apiContext(auth)));
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [auth, toast],
  );

  // Print once the receipt is in the DOM
  useEffect(() => {
    if (!printData) return;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [printData]);

  const openDisplay = useCallback(() => {
    if (!session) return;
    window.open(
      `/pos/display?session=${session.id}`,
      "bizone-customer-display",
      "popup,width=1280,height=800",
    );
  }, [session]);

  // Function-key shortcuts (F5/F11 stay with the browser: reload / full screen)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (payMethod !== null) return; // the payment modal handles its own keys
      const actions: Record<string, () => void> = {
        F1: () => setHelp(true),
        F2: () => gridRef.current?.focusSearch(),
        F3: () => cartRef.current?.focusCustomer(),
        F4: () => cartRef.current?.focusCoupon(),
        F7: openDisplay,
        F8: () => {
          if (pos.cart?.lines.length && confirm("Xóa toàn bộ giỏ hàng?"))
            void pos.clear().catch(() => {});
        },
        F9: () => openPayment("cash"),
        F10: () =>
          lastInvoiceId ? void print(lastInvoiceId) : toast.info("Chưa có hóa đơn nào trong phiên"),
        F12: () => router.push("/pos/session"),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (session === undefined) {
    return <p className="p-10 text-center text-gray-400">Đang tải...</p>;
  }
  if (session === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50">
        <p className="text-lg text-gray-700">Bạn chưa mở ca bán hàng.</p>
        <Link
          href="/pos/session"
          className="flex h-12 items-center rounded-xl bg-blue-600 px-6 font-semibold text-white"
        >
          Mở ca
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen flex-col bg-gray-100 print:hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
          <Link
            href="/dashboard"
            aria-label="Về trang quản lý"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900">POS Bán hàng</h1>
          <span className="ml-2 flex min-w-0 items-center gap-2 truncate rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Ca #{session.id} · {session.branch.name} · từ {fmtDate(session.openedAt, true)}
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs",
              pos.mode === "ws" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700",
            )}
            title={
              pos.mode === "ws"
                ? "Đồng bộ qua máy chủ"
                : "Mất kết nối WebSocket — đồng bộ cục bộ (BroadcastChannel)"
            }
            data-testid="sync-mode"
          >
            {pos.mode === "ws" ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            {pos.mode === "ws"
              ? "Trực tuyến"
              : pos.mode === "connecting"
                ? "Đang kết nối"
                : "Cục bộ"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <TopButton onClick={openDisplay} icon={Monitor} label="Màn hình khách" kbd="F7" />
            <TopButton
              onClick={() => lastInvoiceId && void print(lastInvoiceId)}
              icon={Printer}
              label="In lại"
              kbd="F10"
              disabled={!lastInvoiceId}
            />
            <TopButton
              onClick={() => router.push("/pos/session")}
              icon={Lock}
              label="Khóa ca"
              kbd="F12"
            />
            <TopButton onClick={() => setHelp(true)} icon={HelpCircle} label="Phím tắt" kbd="F1" />
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <ProductGrid
            ref={gridRef}
            auth={auth}
            branchId={session.branch.id}
            onScan={scan}
            onPick={(productId, variantId, name) =>
              pos
                .add(productId, variantId)
                .then(() => toast.success(`Đã thêm ${name}`))
                .catch(() => {})
            }
          />
          <CartPanel
            ref={cartRef}
            auth={auth}
            cart={pos.cart}
            onQuantity={(id, q) => void pos.setQuantity(id, q).catch(() => {})}
            onRemove={(id) => void pos.remove(id).catch(() => {})}
            onCustomer={pos.setCustomer}
            onCoupon={pos.applyCoupon}
            onPay={openPayment}
          />
        </div>
      </div>

      <PaymentModal
        open={payMethod !== null}
        initialMethod={payMethod ?? "cash"}
        total={pos.cart?.total ?? 0}
        reference={`BizOne ca ${session.id}`}
        store={store}
        onShowQr={pos.showQr}
        onClose={() => {
          setPayMethod(null);
          void pos.showQr(null);
          gridRef.current?.focusSearch();
        }}
        onConfirm={async (payments) => {
          const result = await pos.pay(payments, idemKey.current);
          setLastInvoiceId(result.invoiceId);
          return result;
        }}
        onPrint={(id) => void print(id)}
      />

      <Modal open={help} onClose={() => setHelp(false)} title="Phím tắt POS">
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map(([k, d]) => (
              <tr key={k} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  <kbd className="rounded border border-gray-300 bg-gray-50 px-2 py-0.5 font-mono">
                    {k}
                  </kbd>
                </td>
                <td className="py-2">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-gray-500">
          F5 (tải lại) và F11 (toàn màn hình) giữ chức năng của trình duyệt.
        </p>
      </Modal>

      <Receipt data={printData} />
    </>
  );
}

function TopButton({
  onClick,
  icon: Icon,
  label,
  kbd,
  disabled,
}: {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  kbd: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={`${label} (${kbd})`}
      className="flex h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden xl:inline">{label}</span>
      <kbd className="text-xs text-gray-400">{kbd}</kbd>
    </button>
  );
}
