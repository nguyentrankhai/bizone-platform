"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Minus, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import type { DisplayQr, PayhubIntentView } from "@/lib/pos/protocol";
import type { PaymentMethod } from "@/lib/validators/pos";
import {
  apiContext,
  errorMessage,
  fmtDate,
  fmtMoney,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";
import { METHOD_LABEL, PaymentModal, type PaymentResult } from "./PaymentModal";

type InvoiceRow = RouterOutputs["pos"]["invoices"]["items"][number];
type Invoice = RouterOutputs["pos"]["invoice"];
type Quote = RouterOutputs["pos"]["exchangeQuote"];
type CatalogItem = RouterOutputs["pos"]["catalog"]["items"][number];
type StoreInfo = RouterOutputs["pos"]["storeInfo"];

interface NewItem {
  key: string;
  productId: number;
  variantId: number | null;
  name: string;
  price: number;
  quantity: number;
}

interface Props {
  open: boolean;
  auth: ApiAuth;
  sessionId: number;
  branchId: number;
  store: StoreInfo | null;
  payhubEvent: PayhubIntentView | null;
  onShowQr: (qr: DisplayQr | null) => void;
  onClose: () => void;
  onDone: (message: string, invoiceId?: number) => void;
  onPrint: (invoiceId: number) => void;
}

/**
 * Đổi / trả hàng tại POS (SRS-POS-06, P4.5): tìm hoá đơn gốc (mã / SĐT), chọn SP + số lượng trả,
 * tuỳ chọn chọn SP đổi → hệ thống tính chênh lệch: khách trả thêm (thanh toán như bán hàng) hoặc
 * được hoàn (chọn hình thức hoàn). Trả không đổi → hoàn tiền ngay.
 */
export function ReturnForm({
  open,
  auth,
  sessionId,
  branchId,
  store,
  payhubEvent,
  onShowQr,
  onClose,
  onDone,
  onPrint,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InvoiceRow[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [returnQty, setReturnQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("cash");
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [productQ, setProductQ] = useState("");
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const finished = useRef(false);
  const idemKey = useRef("");

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery("");
    setResults([]);
    setInvoice(null);
    setReturnQty({});
    setReason("");
    setNewItems([]);
    setProductQ("");
    setProducts([]);
    setQuote(null);
    setError(null);
    idemKey.current = crypto.randomUUID();
    finished.current = false;
  }, [open]);

  async function search() {
    setError(null);
    try {
      const r = await trpc.pos.invoices.query(
        { search: query.trim() || undefined, pageSize: 10 },
        apiContext(auth),
      );
      setResults(r.items.filter((i) => i.status !== "cancelled"));
      if (r.items.length === 0) setError("Không tìm thấy hoá đơn");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function pick(id: number) {
    try {
      setInvoice(await trpc.pos.invoice.query({ id }, apiContext(auth)));
      setReturnQty({});
      setQuote(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const returnable = useMemo(
    () =>
      (invoice?.invoiceItems ?? []).map((it) => {
        const done = it.invoiceRefundItems.reduce((s, r) => s + Number(r.quantity), 0);
        return { it, left: Number(it.quantity) - done };
      }),
    [invoice],
  );
  const returnItems = useMemo(
    () =>
      Object.entries(returnQty)
        .filter(([, q]) => q > 0)
        .map(([id, quantity]) => ({ invoiceItemId: Number(id), quantity })),
    [returnQty],
  );

  // Product search for exchange items
  useEffect(() => {
    if (!open || productQ.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProducts([]);
      return;
    }
    const t = setTimeout(() => {
      trpc.pos.catalog
        .query({ branchId, search: productQ.trim(), pageSize: 8 }, apiContext(auth))
        .then((r) => setProducts(r.items))
        .catch(() => setProducts([]));
    }, 250);
    return () => clearTimeout(t);
  }, [open, productQ, branchId, auth]);

  // Server-side quote (refund value split like the invoice, new goods priced with promotions)
  useEffect(() => {
    if (!invoice || returnItems.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuote(null);
      return;
    }
    const t = setTimeout(() => {
      trpc.pos.exchangeQuote
        .query(
          {
            invoiceId: invoice.id,
            returnItems,
            newItems: newItems.map((n) => ({
              productId: n.productId,
              variantId: n.variantId,
              quantity: n.quantity,
              discountPercent: 0,
            })),
          },
          apiContext(auth),
        )
        .then((q) => {
          setQuote(q);
          setError(null);
        })
        .catch((e) => setError(errorMessage(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [invoice, returnItems, newItems, auth]);

  function addProduct(p: CatalogItem, variantId: number | null) {
    const v = p.variants.find((x) => x.id === variantId);
    const key = `${p.id}:${variantId ?? 0}`;
    setNewItems((list) => {
      const same = list.find((n) => n.key === key);
      if (same) return list.map((n) => (n === same ? { ...n, quantity: n.quantity + 1 } : n));
      return [
        ...list,
        {
          key,
          productId: p.id,
          variantId,
          name: v ? `${p.name} (${v.sku})` : p.name,
          price: v?.price ?? p.price,
          quantity: 1,
        },
      ];
    });
    setProductQ("");
    setProducts([]);
  }

  const exchanging = newItems.length > 0;
  const diff = quote?.difference ?? 0;

  async function submitRefund() {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    try {
      const r = await trpc.pos.refundInvoice.mutate(
        { id: invoice.id, items: returnItems, reason: reason || null, refundMethod },
        apiContext(auth),
      );
      onDone(
        `Đã trả hàng ${r.refundCode} — hoàn ${fmtMoney(r.totalRefundAmount)} (${METHOD_LABEL[refundMethod]})`,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function exchange(payments: Parameters<typeof trpc.pos.exchange.mutate>[0]["payments"]) {
    const r = await trpc.pos.exchange.mutate(
      {
        invoiceId: invoice!.id,
        returnItems,
        newItems: newItems.map((n) => ({
          productId: n.productId,
          variantId: n.variantId,
          quantity: n.quantity,
          discountPercent: 0,
        })),
        payments,
        refundMethod,
        reason: reason || null,
        idempotencyKey: idemKey.current,
      },
      apiContext(auth),
    );
    return r;
  }

  async function submitExchange() {
    if (!invoice || !quote) return;
    if (diff > 0) return setPaying(true);
    setBusy(true);
    setError(null);
    try {
      const r = await exchange([]);
      onDone(
        `Đổi hàng xong: ${r.invoiceCode} (trả ${r.refundCode})` +
          (r.refunded > 0 ? ` — hoàn khách ${fmtMoney(r.refunded)}` : ""),
        r.invoiceId,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={open && !paying} onClose={onClose} title="Đổi / trả hàng" size="xl">
        {!invoice ? (
          <div className="flex flex-col gap-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Mã hoá đơn hoặc SĐT khách"
                aria-label="Tìm hoá đơn gốc"
                className="h-12 flex-1 rounded-lg border border-gray-300 px-3 text-base"
              />
              <button className="flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-4 font-semibold text-white">
                <Search className="h-4 w-4" /> Tìm
              </button>
            </form>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="rounded-lg border border-gray-200">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => void pick(r.id)}
                  className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-3 text-left last:border-0 hover:bg-gray-50"
                >
                  <span className="font-mono font-semibold">{r.invoiceCode}</span>
                  <span className="text-sm text-gray-500">{fmtDate(r.createdAt, true)}</span>
                  <span className="flex-1 truncate text-sm">
                    {r.customer ? `${r.customer.fullName} · ${r.customer.phone}` : "Khách lẻ"}
                  </span>
                  {r.status === "refunded" && (
                    <span className="rounded bg-gray-100 px-2 text-xs">Đã trả hết</span>
                  )}
                  <span className="font-semibold">{fmtMoney(r.totalAmount)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex items-center justify-between">
                <p>
                  Hoá đơn <strong className="font-mono">{invoice.invoiceCode}</strong> ·{" "}
                  {fmtDate(invoice.createdAt, true)} · {invoice.customer?.fullName ?? "Khách lẻ"}
                </p>
                <button onClick={() => setInvoice(null)} className="text-sm text-blue-600">
                  Chọn hoá đơn khác
                </button>
              </div>

              <section>
                <h3 className="mb-2 font-semibold">1. Sản phẩm trả lại</h3>
                <div className="rounded-lg border border-gray-200">
                  {returnable.map(({ it, left }) => {
                    const q = returnQty[it.id] ?? 0;
                    const set = (n: number) =>
                      setReturnQty((m) => ({ ...m, [it.id]: Math.max(0, Math.min(left, n)) }));
                    return (
                      <div
                        key={it.id}
                        className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{it.product.name}</p>
                          <p className="text-xs text-gray-500">
                            Đã mua {Number(it.quantity)} · còn trả được {left} ·{" "}
                            {fmtMoney(Number(it.totalAmount) / Number(it.quantity))}/sp
                          </p>
                        </div>
                        <Stepper
                          label={it.product.name}
                          value={q}
                          disabled={left <= 0}
                          onChange={set}
                        />
                      </div>
                    );
                  })}
                </div>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Lý do (lỗi, đổi size…)"
                  aria-label="Lý do đổi trả"
                  className="mt-2 h-11 w-full rounded-lg border border-gray-300 px-3 text-sm"
                />
              </section>

              <section>
                <h3 className="mb-2 font-semibold">2. Sản phẩm đổi (bỏ trống nếu chỉ trả hàng)</h3>
                <div>
                  <input
                    value={productQ}
                    onChange={(e) => setProductQ(e.target.value)}
                    placeholder="Tìm sản phẩm đổi (tên / SKU / mã vạch)"
                    aria-label="Tìm sản phẩm đổi"
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  />
                  {products.length > 0 && (
                    <div className="mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                      {products.flatMap((p) =>
                        (p.variants.length ? p.variants : [null]).map((v) => (
                          <button
                            key={`${p.id}-${v?.id ?? 0}`}
                            onClick={() => addProduct(p, v?.id ?? null)}
                            className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                          >
                            <span>
                              {p.name}
                              {v ? ` (${v.sku})` : ""}
                            </span>
                            <span className="font-medium">{fmtMoney(v?.price ?? p.price)}</span>
                          </button>
                        )),
                      )}
                    </div>
                  )}
                </div>
                {newItems.length > 0 && (
                  <div className="mt-2 rounded-lg border border-gray-200">
                    {newItems.map((n) => (
                      <div
                        key={n.key}
                        className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-0"
                      >
                        <p className="min-w-0 flex-1 truncate">{n.name}</p>
                        <span className="text-sm text-gray-500">{fmtMoney(n.price)}</span>
                        <Stepper
                          label={n.name}
                          value={n.quantity}
                          onChange={(q) =>
                            setNewItems((l) =>
                              q <= 0
                                ? l.filter((x) => x !== n)
                                : l.map((x) => (x === n ? { ...x, quantity: q } : x)),
                            )
                          }
                        />
                        <button
                          aria-label={`Bỏ ${n.name}`}
                          onClick={() => setNewItems((l) => l.filter((x) => x !== n))}
                          className="p-2 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside
              className="flex flex-col gap-3 rounded-xl bg-gray-50 p-4"
              data-testid="return-summary"
            >
              <Row label="Giá trị hàng trả" value={fmtMoney(quote?.returnTotal ?? 0)} />
              {exchanging && <Row label="Hàng đổi mới" value={fmtMoney(quote?.newTotal ?? 0)} />}
              <div className="border-t border-gray-200 pt-3">
                {!exchanging || diff < 0 ? (
                  <Row
                    label="Hoàn cho khách"
                    value={fmtMoney(exchanging ? -diff : (quote?.returnTotal ?? 0))}
                    strong
                    className="text-emerald-700"
                  />
                ) : (
                  <Row
                    label="Khách trả thêm"
                    value={fmtMoney(diff)}
                    strong
                    className="text-blue-700"
                  />
                )}
              </div>
              {(!exchanging || diff < 0) && (
                <label className="text-sm text-gray-700">
                  Hình thức hoàn
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                    className="mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-2"
                  >
                    {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {quote && quote.pointsBack > 0 && (
                <p className="text-xs text-gray-500">Thu hồi {quote.pointsBack} điểm tích luỹ</p>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                disabled={busy || returnItems.length === 0 || !quote}
                onClick={() => void (exchanging ? submitExchange() : submitRefund())}
                className={cn(
                  "mt-auto flex h-14 items-center justify-center gap-2 rounded-xl text-lg font-bold text-white disabled:opacity-40",
                  exchanging ? "bg-blue-600" : "bg-emerald-600",
                )}
              >
                {exchanging ? (
                  <>
                    <ArrowLeftRight className="h-5 w-5" />
                    {diff > 0 ? "Thu chênh lệch" : "Xác nhận đổi"}
                  </>
                ) : (
                  <>
                    <Undo2 className="h-5 w-5" /> Xác nhận trả hàng
                  </>
                )}
              </button>
            </aside>
          </div>
        )}
      </Modal>

      <PaymentModal
        open={paying}
        title="Thu chênh lệch đổi hàng"
        initialMethod="cash"
        total={Math.max(0, diff)}
        reference={`BizOne doi ${invoice?.invoiceCode ?? ""}`}
        store={store}
        sessionId={sessionId}
        auth={auth}
        payhubEvent={payhubEvent}
        onShowQr={onShowQr}
        onClose={() => {
          setPaying(false);
          void onShowQr(null);
          if (finished.current) onClose();
        }}
        onConfirm={async (payments): Promise<PaymentResult> => {
          const r = await exchange(payments);
          finished.current = true;
          onDone(`Đổi hàng xong: ${r.invoiceCode} (trả ${r.refundCode})`, r.invoiceId);
          return {
            ...r,
            headline: "Đổi hàng thành công",
            notes: [
              `Hàng trả ${fmtMoney(r.returnTotal)} cấn trừ vào hoá đơn mới`,
              `Phiếu trả ${r.refundCode}`,
            ],
          };
        }}
        onPrint={onPrint}
      />
    </>
  );
}

function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        aria-label={`Giảm ${label}`}
        disabled={disabled}
        onClick={() => onChange(value - 1)}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-8 text-center text-base font-semibold">{value}</span>
      <button
        aria-label={`Tăng ${label}`}
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between", className)}>
      <span className="text-sm text-gray-600">{label}</span>
      <span className={strong ? "text-xl font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
