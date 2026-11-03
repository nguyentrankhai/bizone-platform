"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Upload, Download, Plus, Trash2, Tag } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CategoryTree, type CategoryNode } from "./CategoryTree";
import { ProductTable, type ProductRow } from "./ProductTable";
import { ImportDialog } from "./ImportDialog";

const PAGE_SIZE = 20;

interface ProductsClientProps {
  tenantId: string;
  authToken: string;
}

export function ProductsClient({ tenantId, authToken }: ProductsClientProps) {
  const router = useRouter();

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Selection & dialog
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  // Data
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [catLoading, setCatLoading] = useState(false);

  const headers = { Authorization: `Bearer ${authToken}`, "X-Tenant-ID": tenantId };

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function handleSearchChange(v: string) {
    setSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(1);
    }, 300);
  }

  // Load categories
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCatLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (trpc.category.tree as any)
      .query(undefined, { context: { headers } })
      .then((data: unknown) => setCategories(data as CategoryNode[]))
      .catch(console.error)
      .finally(() => setCatLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Load products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await trpc.product.list.query(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          categoryId: categoryId ?? undefined,
          status: (status || undefined) as "active" | "inactive" | "discontinued" | undefined,
          sortBy: sortBy as "name" | "sku" | "sellingPrice" | "costPrice" | "createdAt" | "updatedAt",
          sortDir,
        },
        { context: { headers } },
      );
      setProducts(
        result.items.map((p: Record<string, unknown>) => ({
          id: p.id as number,
          name: p.name as string,
          sku: p.sku as string,
          image: (p.images as Array<{ url: string }> | null)?.[0]?.url ?? null,
          categoryName: (p.category as { name: string } | null)?.name ?? null,
          sellingPrice: Number(p.sellingPrice),
          costPrice: Number(p.costPrice),
          currentStock: (p.currentStock as number) ?? 0,
          minStock: (p.minStock as number) ?? 0,
          status: p.status as "active" | "inactive" | "discontinued",
        })),
      );
      setTotal(result.meta.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, categoryId, status, sortBy, sortDir, tenantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProducts();
  }, [loadProducts]);

  function handleSort(key: string, dir: "asc" | "desc") {
    setSortBy(key);
    setSortDir(dir);
    setPage(1);
  }

  async function handleExport() {
    try {
      const result = await trpc.product.exportExcel.query(
        { search: debouncedSearch || undefined, categoryId: categoryId ?? undefined, status: (status || undefined) as "active" | "inactive" | "discontinued" | undefined },
        { context: { headers } },
      );
      const a = document.createElement("a");
      a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.fileBase64}`;
      a.download = `san-pham-${Date.now()}.xlsx`;
      a.click();
    } catch (e) {
      alert("Lỗi xuất Excel: " + String(e));
    }
  }

  async function handleDownloadTemplate() {
    try {
      const result = await trpc.product.exportTemplate.query(undefined, { context: { headers } });
      const a = document.createElement("a");
      a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.fileBase64}`;
      a.download = "template-san-pham.xlsx";
      a.click();
    } catch (e) {
      alert("Lỗi tải template: " + String(e));
    }
  }

  async function handleImport(file: File) {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const result = await trpc.product.importExcel.mutate(
      { fileBase64: base64 },
      { context: { headers } },
    );
    await loadProducts();
    return result;
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Xóa ${selectedIds.length} sản phẩm đã chọn?`)) return;
    for (const id of selectedIds) {
      try {
        await trpc.product.delete.mutate({ id }, { context: { headers } });
      } catch {
        // skip individual errors
      }
    }
    setSelectedIds([]);
    await loadProducts();
  }

  return (
    <div className="flex gap-5">
      {/* Sidebar: Category tree */}
      <div className="w-56 shrink-0">
        <CategoryTree
          categories={categories}
          selectedId={categoryId}
          onSelect={(id) => { setCategoryId(id); setPage(1); }}
          loading={catLoading}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Tìm theo tên, SKU, mã vạch..."
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Status filter */}
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 py-2 pl-3 pr-8 text-sm outline-none focus:border-blue-400"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang bán</option>
            <option value="inactive">Ngừng bán</option>
            <option value="discontinued">Hết hàng</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Xóa ({selectedIds.length})
              </button>
            )}
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              onClick={() => router.push("/products/new")}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Thêm sản phẩm
            </button>
          </div>
        </div>

        {/* Category breadcrumb */}
        {categoryId != null && (
          <div className="mb-3 flex items-center gap-1.5 text-sm text-gray-500">
            <Tag className="h-4 w-4" />
            <button onClick={() => setCategoryId(null)} className="hover:text-blue-600">
              Tất cả
            </button>
            <span>/</span>
            <span className="text-gray-700 font-medium">
              {findCategoryName(categories, categoryId) ?? `Danh mục #${categoryId}`}
            </span>
          </div>
        )}

        <ProductTable
          data={products}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          sortBy={sortBy}
          sortDir={sortDir}
          loading={loading}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onPageChange={setPage}
          onSort={handleSort}
        />
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDownloadTemplate={handleDownloadTemplate}
        onImport={handleImport}
      />
    </div>
  );
}

function findCategoryName(nodes: CategoryNode[], id: number): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.name;
    if (node.children) {
      const found = findCategoryName(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
