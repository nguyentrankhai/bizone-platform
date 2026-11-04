"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, Package, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  apiContext,
  errorMessage,
  fmtMoney,
  type ApiAuth,
  type RouterOutputs,
} from "@/components/inventory/shared";

type CatalogItem = RouterOutputs["pos"]["catalog"]["items"][number];
interface Category {
  id: number;
  name: string;
  icon: string | null;
  children?: Category[];
}

export interface ProductGridHandle {
  focusSearch: () => void;
}

interface ProductGridProps {
  auth: ApiAuth;
  branchId: number;
  onPick: (productId: number, variantId: number | null, name: string) => void;
  /** Enter in the search box: try it as a barcode/SKU first */
  onScan: (code: string) => Promise<boolean>;
}

/** Lưới sản phẩm (mockup 02-pos §03, trái): tìm/quét, lọc danh mục, chạm để thêm */
export const ProductGrid = forwardRef<ProductGridHandle, ProductGridProps>(function ProductGrid(
  { auth, branchId, onPick, onScan },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variantPick, setVariantPick] = useState<CatalogItem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  useEffect(() => {
    // category.tree has no input; cast like ProductsClient (P2.2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trpc.category.tree as any)
      .query(undefined, apiContext(auth))
      .then((tree: Category[]) => setCategories(tree))
      .catch(() => setCategories([]));
  }, [auth]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    trpc.pos.catalog
      .query(
        {
          branchId,
          categoryId: categoryId ?? undefined,
          search: q || undefined,
          page: 1,
          pageSize: 60,
        },
        apiContext(auth),
      )
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [auth, branchId, categoryId, q]);

  function pick(p: CatalogItem, variantId: number | null = null) {
    if (variantId === null && p.variants.length > 0) {
      setVariantPick(p);
      return;
    }
    setVariantPick(null);
    onPick(p.id, variantId, p.name);
    inputRef.current?.focus();
  }

  async function onEnter() {
    const code = search.trim();
    if (!code) return;
    clearTimeout(debounceRef.current);
    if (await onScan(code)) {
      setSearch("");
      setQ("");
    } else {
      setQ(code);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative mb-3">
        <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          autoFocus
          value={search}
          onChange={(e) => {
            const v = e.target.value;
            setSearch(v);
            clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => setQ(v.trim()), 250);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void onEnter();
            }
          }}
          placeholder="Tìm kiếm sản phẩm (quét mã vạch, tên, SKU...)"
          aria-label="Tìm hoặc quét sản phẩm"
          className="h-12 w-full rounded-xl border border-gray-300 bg-white pr-14 pl-11 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <kbd className="absolute top-1/2 right-3 -translate-y-1/2 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-500">
          F2
        </kbd>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {[
          { id: null as number | null, name: "Tất cả", icon: null as string | null },
          ...categories,
        ].map((c) => (
          <button
            key={c.id ?? "all"}
            onClick={() => setCategoryId(c.id)}
            className={cn(
              "h-10 shrink-0 rounded-full px-4 text-sm font-medium whitespace-nowrap",
              categoryId === c.id
                ? "bg-blue-600 text-white"
                : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {c.icon ? `${c.icon} ` : ""}
            {c.name}
          </button>
        ))}
      </div>

      {variantPick && (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-gray-900">Chọn biến thể — {variantPick.name}</span>
            <button
              onClick={() => setVariantPick(null)}
              className="text-gray-500 hover:text-gray-800"
            >
              Đóng
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {variantPick.variants.map((v) => (
              <button
                key={v.id}
                onClick={() => pick(variantPick, v.id)}
                disabled={v.stock !== null && v.stock <= 0}
                className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-400 disabled:opacity-40"
              >
                <span className="block font-medium">{v.sku}</span>
                <span className="text-xs text-gray-500">
                  {fmtMoney(v.price)}
                  {v.stock !== null ? ` · còn ${v.stock}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="py-10 text-center text-sm text-red-600">{error}</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "Không có sản phẩm"}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {items.map((p) => {
              const out = p.stock !== null && p.stock <= 0 && p.variants.length === 0;
              return (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  disabled={out}
                  className="flex min-h-36 flex-col rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-blue-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="mb-2 flex h-14 items-center justify-center rounded-lg bg-gray-50 text-gray-300">
                    <Package className="h-7 w-7" />
                  </span>
                  <span className="line-clamp-2 text-sm font-medium text-gray-900">{p.name}</span>
                  <span className="mt-auto pt-1 text-base font-bold text-blue-600">
                    {fmtMoney(p.price)}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      p.stock === null
                        ? "text-gray-400"
                        : p.stock <= 0
                          ? "text-red-600"
                          : p.stock <= 5
                            ? "text-amber-600"
                            : "text-gray-500",
                    )}
                  >
                    {p.stock === null
                      ? p.variants.length
                        ? `${p.variants.length} biến thể`
                        : "Không quản lý tồn"
                      : p.stock <= 0
                        ? "Hết hàng"
                        : `Còn ${p.stock}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
