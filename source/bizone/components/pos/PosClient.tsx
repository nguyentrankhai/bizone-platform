"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarClock,
  HelpCircle,
  Lock,
  Monitor,
  MonitorSmartphone,
  Printer,
  Scissors,
  Settings2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { usePosWebSocket } from "@/hooks/usePosWebSocket";
import { useBarcodeScan } from "@/hooks/useBarcodeScan";
import type { PaymentMethod } from "@/lib/validators/pos";
import type { PayhubIntentView } from "@/lib/pos/protocol";
import { loadPrinterSettings, printReceipt, type PrinterSettings } from "@/lib/printing/printer";
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
import { ReturnForm } from "./ReturnForm";
import { SplitInvoiceModal } from "./SplitInvoiceModal";
import { PreOrderForm } from "./PreOrderForm";
import { PairDisplayModal } from "./PairDisplayModal";
import { PrinterSettingsModal } from "./PrinterSettingsModal";

type Session = NonNullable<RouterOutputs["pos"]["currentSession"]>;
type StoreInfo = RouterOutputs["pos"]["storeInfo"];
type PrintData = RouterOutputs["pos"]["print"];

export const SHORTCUTS: [string, string][] = [
  ["F1", "Trợ giúp phím tắt"],
  ["F2", "Tìm / quét sản phẩm"],
  ["F3", "Chọn khách hàng"],
  ["F4", "Nhập mã giảm giá"],
  ["F6", "Đổi / trả hàng"],
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
  const [returnOpen, setReturnOpen] = useState(false);
  const [split, setSplit] = useState<"split" | "held" | null>(null);
  const [preorder, setPreorder] = useState<"create" | "list" | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairedAt, setPairedAt] = useState<number | null>(null);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [printer, setPrinter] = useState<PrinterSettings | null>(null);
  const [payhubEvent, setPayhubEvent] = useState<PayhubIntentView | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrinter(loadPrinterSettings());
  }, []);

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
    onPayhub: setPayhubEvent,
    onDisplayPaired: () => {
      setPairedAt(Date.now());
      toast.success("Màn hình khách đã kết nối");
    },
  });
  const anyModal =
    payMethod !== null || returnOpen || split !== null || preorder !== null || pairOpen;

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
  useBarcodeScan((code) => void scan(code), { enabled: !!session && !anyModal });

  function openPayment(method: PaymentMethod) {
    if (!pos.cart?.lines.length) return;
    idemKey.current = crypto.randomUUID();
    setPayMethod(method);
  }

  /** USB / Bluetooth printer when configured (ESC/POS), else the browser receipt + window.print */
  const print = useCallback(
    async (invoiceId: number) => {
      let data: PrintData;
      try {
        data = await trpc.pos.print.query({ id: invoiceId }, apiContext(auth));
      } catch (e) {
        return toast.error(errorMessage(e));
      }
      try {
        if (await printReceipt(data, printer ?? undefined)) return toast.success("Đã gửi máy in");
      } catch (e) {
        toast.error(`Máy in lỗi: ${errorMessage(e)} — in qua trình duyệt`);
      }
      setPrintData(data);
    },
    [auth, toast, printer],
  );

  const done = useCallback(
    (message: string, invoiceId?: number) => {
      toast.success(message);
      if (invoiceId) setLastInvoiceId(invoiceId);
    },
    [toast],
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
      if (anyModal) return; // open dialogs handle their own keys
      const actions: Record<string, () => void> = {
        F1: () => setHelp(true),
        F2: () => gridRef.current?.focusSearch(),
        F3: () => cartRef.current?.focusCustomer(),
        F4: () => cartRef.current?.focusCoupon(),
        F6: () => setReturnOpen(true),
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
          <h1 className="text-lg font-bold whitespace-nowrap text-gray-900">POS Bán hàng</h1>
          <span className="ml-2 flex min-w-0 items-center gap-2 truncate rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Ca #{session.id} · {session.branch.name} · từ {fmtDate(session.openedAt, true)}
          </span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs whitespace-nowrap",
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
          <div className="ml-auto flex shrink-0 items-center gap-1.5 xl:gap-2">
            <TopButton
              onClick={() => setReturnOpen(true)}
              icon={ArrowLeftRight}
              label="Đổi/Trả"
              kbd="F6"
            />
            <TopButton
              onClick={() =>
                setSplit(!pos.cart?.lines.length && pos.held.length ? "held" : "split")
              }
              icon={Scissors}
              label="Tách/Gộp"
              badge={pos.held.length || undefined}
            />
            <TopButton
              onClick={() => setPreorder("create")}
              icon={CalendarClock}
              label="Đặt trước"
            />
            <TopButton onClick={openDisplay} icon={Monitor} label="Màn hình khách" kbd="F7" />
            <TopButton
              onClick={() => setPairOpen(true)}
              icon={MonitorSmartphone}
              label="Ghép màn hình"
            />
            <TopButton
              onClick={() => lastInvoiceId && void print(lastInvoiceId)}
              icon={Printer}
              label="In lại"
              kbd="F10"
              disabled={!lastInvoiceId}
            />
            <TopButton onClick={() => setPrinterOpen(true)} icon={Settings2} label="Máy in" />
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
        sessionId={session.id}
        auth={auth}
        payhubEvent={payhubEvent}
        onShowQr={pos.showQr}
        onClose={() => {
          setPayMethod(null);
          void pos.showQr(null);
          gridRef.current?.focusSearch();
          if (pos.held.length && !pos.cart?.lines.length)
            toast.info(`Còn ${pos.held.length} đơn chờ — mở “Tách/Gộp” để thanh toán tiếp`);
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

      <ReturnForm
        open={returnOpen}
        auth={auth}
        sessionId={session.id}
        branchId={session.branch.id}
        store={store}
        payhubEvent={payhubEvent}
        onShowQr={pos.showQr}
        onClose={() => {
          setReturnOpen(false);
          gridRef.current?.focusSearch();
        }}
        onDone={done}
        onPrint={(id) => void print(id)}
      />

      <SplitInvoiceModal
        open={split !== null}
        initialTab={split ?? "split"}
        cart={pos.cart}
        held={pos.held}
        online={pos.mode === "ws"}
        onClose={() => {
          setSplit(null);
          gridRef.current?.focusSearch();
        }}
        onSplit={async (items, label) => {
          await pos.split(items, label);
          toast.success("Đã tách — hoá đơn mới nằm trong Đơn chờ");
        }}
        onHold={async (label) => {
          await pos.hold(label);
          toast.success("Đã lưu tạm đơn");
        }}
        onResume={pos.resume}
        onMerge={async (ids) => {
          await pos.merge(ids);
          toast.success(`Đã gộp ${ids.length} đơn vào đơn hiện tại`);
        }}
        onDiscard={pos.discardHeld}
      />

      <PreOrderForm
        open={preorder !== null}
        initialTab={preorder ?? "create"}
        auth={auth}
        sessionId={session.id}
        cart={pos.cart}
        store={store}
        payhubEvent={payhubEvent}
        onShowQr={pos.showQr}
        onClose={() => {
          setPreorder(null);
          gridRef.current?.focusSearch();
        }}
        onDone={done}
        onPrint={(id) => void print(id)}
      />

      <PairDisplayModal
        open={pairOpen}
        auth={auth}
        sessionId={session.id}
        pairedAt={pairedAt}
        onClose={() => setPairOpen(false)}
      />

      <PrinterSettingsModal
        open={printerOpen}
        onClose={() => setPrinterOpen(false)}
        onSaved={(s) => {
          setPrinter(s);
          toast.success("Đã lưu cài đặt máy in");
        }}
      />

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
  badge,
}: {
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  kbd?: string;
  disabled?: boolean;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={kbd ? `${label} (${kbd})` : label}
      className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 xl:px-3"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden 2xl:inline">{label}</span>
      {kbd && <kbd className="hidden text-xs text-gray-400 xl:inline">{kbd}</kbd>}
      {badge !== undefined && (
        <span className="rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
