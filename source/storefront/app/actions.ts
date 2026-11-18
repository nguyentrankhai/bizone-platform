"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { bizone, StoreApiError } from "@/lib/bizone-sync";
import { currentStore } from "@/lib/store";
import { addToCart, setQuantity } from "@/lib/cart";
import { normalizePhone } from "@/lib/format";
import {
  customerToken,
  guestOrders,
  orderSource,
  readCart,
  rememberGuestOrder,
  setCustomerToken,
  writeCart,
} from "@/lib/session";
import { paymentReturnUrl, startOrderPayment } from "@/lib/paymentHubClient";

export interface FormState {
  error?: string;
  ok?: string;
  step?: "code";
  phone?: string;
  devCode?: string;
  /** What the customer typed (no passwords) — React resets the form after an action */
  values?: Record<string, string>;
}

const keep = (fd: FormData, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));
const CHECKOUT_FIELDS = ["name", "phone", "address", "email", "note", "paymentMethod"];

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string) => {
  const n = Number(fd.get(k));
  return Number.isSafeInteger(n) ? n : NaN;
};
const msg = (e: unknown) =>
  e instanceof StoreApiError ? e.message : "Có lỗi xảy ra, vui lòng thử lại";

/** Who may see an order: the logged-in customer, or the guest who placed it on this browser */
async function orderAccess(code: string) {
  const store = await currentStore();
  const token = await customerToken(store);
  const phone = (await guestOrders(store)).get(code) ?? null;
  return { store, who: { token, phone } };
}

// ─── Cart ────────────────────────────────────────────────────────────────────

export async function addToCartAction(_: FormState, fd: FormData): Promise<FormState> {
  const store = await currentStore();
  const productId = int(fd, "productId");
  const variantId = fd.get("variantId") ? int(fd, "variantId") : null;
  const quantity = int(fd, "quantity");
  if (!(productId > 0) || (variantId !== null && !(variantId > 0)))
    return { error: "Sản phẩm không hợp lệ" };
  if (!(quantity >= 1 && quantity <= 999)) return { error: "Số lượng từ 1 đến 999" };
  const product = await bizone.product(store, String(productId)).catch(() => null);
  if (!product) return { error: "Sản phẩm không còn bán" };
  if (product.variants.length && !variantId) return { error: "Chọn phân loại trước" };
  const stock = variantId
    ? (product.variants.find((v) => v.id === variantId)?.stock ?? 0)
    : product.stock;
  const inCart =
    (await readCart(store)).find((i) => i.productId === productId && i.variantId === variantId)
      ?.quantity ?? 0;
  if (stock !== null && inCart + quantity > stock)
    return { error: stock > 0 ? `Chỉ còn ${stock} ${product.unit}` : "Sản phẩm đã hết hàng" };
  await writeCart(store, addToCart(await readCart(store), { productId, variantId, quantity }));
  refresh();
  return { ok: `Đã thêm ${quantity} ${product.unit} vào giỏ hàng` };
}

export async function updateCartAction(fd: FormData) {
  const store = await currentStore();
  const productId = int(fd, "productId");
  const variantId = fd.get("variantId") ? int(fd, "variantId") : null;
  const quantity = Math.max(0, Math.min(999, int(fd, "quantity") || 0));
  await writeCart(store, setQuantity(await readCart(store), productId, variantId, quantity));
  refresh();
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export async function placeOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const store = await currentStore();
  const items = await readCart(store);
  const values = keep(fd, CHECKOUT_FIELDS);
  if (items.length === 0) return { error: "Giỏ hàng trống", values };
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return { error: "Số điện thoại không hợp lệ", values };
  const paymentMethod = str(fd, "paymentMethod") === "payhub" ? "payhub" : "cod";
  const key = str(fd, "idempotencyKey");
  const token = await customerToken(store);
  let target: string;
  try {
    const r = await bizone.createOrder(
      store,
      {
        items,
        couponCode: str(fd, "couponCode") || null,
        contact: {
          name: str(fd, "name"),
          phone,
          address: str(fd, "address"),
          email: str(fd, "email") || null,
        },
        note: str(fd, "note") || null,
        paymentMethod,
        ...(paymentMethod === "payhub" ? { returnUrl: paymentReturnUrl() } : {}),
        source: await orderSource(),
      },
      { token, idempotencyKey: key },
    );
    await writeCart(store, []);
    await rememberGuestOrder(store, r.order.code, phone);
    target = r.payment?.paymentUrl
      ? r.payment.paymentUrl
      : `/orders/${r.order.code}?placed=1${r.paymentError ? "&payError=1" : ""}`;
  } catch (e) {
    return { error: msg(e), values };
  }
  redirect(target);
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function payOrderAction(fd: FormData) {
  const code = str(fd, "code");
  const { store, who } = await orderAccess(code);
  let url: string;
  try {
    url = await startOrderPayment(store, code, who);
  } catch (e) {
    redirect(`/orders/${code}?error=${encodeURIComponent(msg(e))}`);
  }
  redirect(url);
}

export async function cancelOrderAction(fd: FormData) {
  const code = str(fd, "code");
  const { store, who } = await orderAccess(code);
  let error = "";
  try {
    await bizone.cancelOrder(store, code, str(fd, "reason") || null, who);
  } catch (e) {
    error = msg(e);
  }
  redirect(`/orders/${code}${error ? `?error=${encodeURIComponent(error)}` : "?cancelled=1"}`);
}

export async function lookupOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const store = await currentStore();
  const code = str(fd, "code").toUpperCase();
  const phone = normalizePhone(str(fd, "phone"));
  const values = keep(fd, ["code", "phone"]);
  if (!/^[A-Z0-9-]{6,50}$/.test(code) || !phone)
    return { error: "Nhập mã đơn và số điện thoại", values };
  try {
    await bizone.order(store, code, { phone });
  } catch (e) {
    return { error: msg(e), values };
  }
  await rememberGuestOrder(store, code, phone);
  redirect(`/orders/${code}`);
}

// ─── Account ─────────────────────────────────────────────────────────────────

const safeNext = (v: string) => (v.startsWith("/") && !v.startsWith("//") ? v : "/account");

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const store = await currentStore();
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return { error: "Số điện thoại không hợp lệ" };
  try {
    const r = await bizone.login(store, phone, String(fd.get("password") ?? ""));
    await setCustomerToken(store, r.token);
  } catch (e) {
    return { error: msg(e), phone };
  }
  redirect(safeNext(str(fd, "next")));
}

export async function registerAction(state: FormState, fd: FormData): Promise<FormState> {
  const store = await currentStore();
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) return { error: "Số điện thoại không hợp lệ" };
  if (str(fd, "step") !== "code") {
    try {
      const r = await bizone.registerStart(store, phone);
      return { step: "code", phone, ok: "Đã gửi mã xác nhận qua SMS", devCode: r.devCode };
    } catch (e) {
      return { error: msg(e) };
    }
  }
  const password = String(fd.get("password") ?? "");
  const values = keep(fd, ["code", "fullName", "email"]);
  if (password !== String(fd.get("password2") ?? ""))
    return { ...state, step: "code", phone, values, error: "Mật khẩu nhập lại không khớp" };
  try {
    const r = await bizone.registerVerify(store, {
      phone,
      code: str(fd, "code"),
      fullName: str(fd, "fullName"),
      email: str(fd, "email") || undefined,
      password,
    });
    await setCustomerToken(store, r.token);
  } catch (e) {
    return { ...state, step: "code", phone, values, error: msg(e) };
  }
  redirect("/account?welcome=1");
}

export async function logoutAction() {
  const store = await currentStore();
  const token = await customerToken(store);
  if (token) await bizone.logout(store, token).catch(() => undefined);
  await setCustomerToken(store, null);
  redirect("/");
}
