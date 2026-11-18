import Link from "next/link";
import { bizone } from "@/lib/bizone-sync";
import { currentStore } from "@/lib/store";
import { Alert, Price, ProductImage } from "@/components/ui";
import { fmtVnd } from "@/lib/format";

const SORTS = [
  { value: "newest", label: "Mới nhất" },
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "price_desc", label: "Giá cao → thấp" },
  { value: "name", label: "Tên A–Z" },
];

function href(q: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined && v !== "" && v !== 1) p.set(k, String(v));
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

/** Danh mục sản phẩm + tìm kiếm (P6.1) */
export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const q = one("q")?.slice(0, 100);
  const category = one("category");
  const sort = SORTS.some((s) => s.value === one("sort")) ? one("sort")! : "newest";
  const page = Math.max(1, Math.min(10_000, Number(one("page")) || 1));

  const store = await currentStore();
  const [info, categories, list] = await Promise.all([
    bizone.store(store),
    bizone.categories(store),
    bizone.products(store, { search: q, category, sort, page, limit: 24 }).catch((e: Error) => e),
  ]);
  const roots = categories.filter((c) => c.parentId === null);
  const current = categories.find((c) => c.slug === category);

  return (
    <div className="space-y-5">
      {info.freeShippingFrom !== null && (
        <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary">
          Miễn phí giao hàng cho đơn từ {fmtVnd(info.freeShippingFrom)}
        </div>
      )}
      <nav aria-label="Danh mục" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link
          href={href({ q, sort })}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${!category ? "border-primary bg-primary text-white" : "border-slate-300 bg-white"}`}
        >
          Tất cả
        </Link>
        {roots.map((c) => (
          <Link
            key={c.id}
            href={href({ q, sort, category: c.slug })}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${category === c.slug ? "border-primary bg-primary text-white" : "border-slate-300 bg-white"}`}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {q ? `Kết quả cho “${q}”` : (current?.name ?? "Tất cả sản phẩm")}
          </h1>
          {!(list instanceof Error) && (
            <p className="text-sm text-slate-500">{list.total} sản phẩm</p>
          )}
        </div>
        <form action="/" className="flex items-center gap-2 text-sm">
          {q && <input type="hidden" name="q" value={q} />}
          {category && <input type="hidden" name="category" value={category} />}
          <label htmlFor="sort" className="text-slate-500">
            Sắp xếp
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={sort}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="h-9 rounded-lg border border-slate-300 bg-white px-3">Lọc</button>
        </form>
      </div>

      {list instanceof Error ? (
        <Alert>{list.message}</Alert>
      ) : list.items.length === 0 ? (
        <div className="rounded-lg bg-white p-10 text-center text-slate-500">
          Không tìm thấy sản phẩm phù hợp
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/products/${p.slug}`}
                className="group block h-full overflow-hidden rounded-xl border border-slate-200 bg-white hover:shadow-md"
              >
                <div className="relative">
                  <ProductImage src={p.image} alt={p.name} className="aspect-square w-full" />
                  {p.saleLabel && (
                    <span className="absolute top-2 left-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                      Flash sale
                    </span>
                  )}
                  {p.stock === 0 && (
                    <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-1 text-center text-xs text-white">
                      Hết hàng
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <div className="line-clamp-2 text-sm group-hover:text-primary">{p.name}</div>
                  <Price price={p.price} sale={p.salePrice} className="text-sm" />
                  {p.hasVariants && p.maxPrice > p.price && (
                    <div className="text-xs text-slate-500">đến {fmtVnd(p.maxPrice)}</div>
                  )}
                  {p.stock !== null && p.stock > 0 && p.stock <= 5 && (
                    <div className="text-xs text-amber-600">Chỉ còn {p.stock}</div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!(list instanceof Error) && list.totalPages > 1 && (
        <nav aria-label="Phân trang" className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              className="rounded-lg border bg-white px-3 py-1.5"
              href={href({ q, category, sort, page: page - 1 })}
            >
              Trước
            </Link>
          )}
          <span>
            Trang {page} / {list.totalPages}
          </span>
          {page < list.totalPages && (
            <Link
              className="rounded-lg border bg-white px-3 py-1.5"
              href={href({ q, category, sort, page: page + 1 })}
            >
              Sau
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
