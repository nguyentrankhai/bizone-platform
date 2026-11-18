import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import { ShoppingCart, User, Search, Phone } from "lucide-react";
import { currentStore } from "@/lib/store";
import { bizone } from "@/lib/bizone-sync";
import { customerToken, readCart } from "@/lib/session";
import { cartCount } from "@/lib/cart";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "vietnamese"] });

export async function generateMetadata(): Promise<Metadata> {
  try {
    const info = await bizone.store(await currentStore());
    return {
      title: { default: info.name, template: `%s | ${info.name}` },
      description: `Mua sắm online tại ${info.name}`,
    };
  } catch {
    return { title: "Cửa hàng" };
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const store = await currentStore();
  const [info, cart, token] = await Promise.all([
    bizone.store(store).catch(() => null),
    readCart(store),
    customerToken(store),
  ]);
  const count = cartCount(cart);
  return (
    <html lang="vi" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Link href="/" className="shrink-0 text-lg font-bold text-primary">
              {info?.name ?? "Cửa hàng"}
            </Link>
            <form action="/" className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                placeholder="Tìm sản phẩm…"
                aria-label="Tìm sản phẩm"
                className="h-10 w-full rounded-full border border-slate-300 bg-slate-50 pr-3 pl-9 text-sm focus:border-primary focus:bg-white focus:outline-none"
              />
            </form>
            <Link
              href={token ? "/account" : "/login"}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
              aria-label={token ? "Tài khoản" : "Đăng nhập"}
            >
              <User className="h-5 w-5" />
            </Link>
            <Link
              href="/cart"
              className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
              aria-label={`Giỏ hàng (${count})`}
            >
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span
                  data-testid="cart-count"
                  className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs leading-5 font-semibold text-white"
                >
                  {count}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">
          {info ? (
            children
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
              Cửa hàng đang tạm ngừng bán online. Vui lòng quay lại sau.
            </div>
          )}
        </main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-slate-500">
            <span>
              © {info?.name ?? "Cửa hàng"} {info?.address ? `· ${info.address}` : ""}
            </span>
            <span className="flex items-center gap-3">
              <Link href="/orders" className="hover:text-primary">
                Tra cứu đơn hàng
              </Link>
              {info?.hotline && (
                <a
                  href={`tel:${info.hotline}`}
                  className="flex items-center gap-1 hover:text-primary"
                >
                  <Phone className="h-4 w-4" /> {info.hotline}
                </a>
              )}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
