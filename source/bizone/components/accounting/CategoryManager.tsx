"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { trpc } from "@/lib/trpc";
import { apiContext, errorMessage, type ApiAuth } from "@/components/inventory/shared";
import { ErrorBox, Field, btnPrimary, btnSecondary, inputCls } from "@/components/staff/shared";
import { cn } from "@/lib/utils";
import { AccountingHeader, flattenCategories, useCategories, type CategoryNode } from "./shared";

const TYPE_LABEL = { revenue: "Thu", expense: "Chi", both: "Thu & chi" } as const;
const TYPE_CLS = {
  revenue: "bg-emerald-50 text-emerald-700",
  expense: "bg-red-50 text-red-700",
  both: "bg-slate-100 text-slate-600",
} as const;

/** Danh mục thu chi dạng cây (tuỳ chỉnh theo cửa hàng) */
export function CategoryManager({ auth }: { auth: ApiAuth }) {
  const toast = useToast();
  const cats = useCategories(auth);
  const [editing, setEditing] = useState<CategoryNode | { parentId: number | null } | null>(null);

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      cats.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const render = (nodes: CategoryNode[], depth: number): React.ReactNode =>
    nodes.map((n) => (
      <div key={n.id}>
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5",
            !n.isActive && "opacity-50",
          )}
          style={{ paddingLeft: 16 + depth * 24 }}
        >
          <span className="font-medium text-slate-800">{n.name}</span>
          <span className={cn("rounded px-1.5 py-0.5 text-xs", TYPE_CLS[n.type])}>
            {TYPE_LABEL[n.type]}
          </span>
          {n.isSystem && <span className="text-xs text-slate-400">hệ thống</span>}
          {!n.isActive && <span className="text-xs text-slate-500">ngừng sử dụng</span>}
          <span className="text-xs text-slate-400">
            {n.code} · {n.recordCount} phiếu
          </span>
          <span className="ml-auto flex gap-3 text-sm">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setEditing({ parentId: n.id })}
            >
              + Con
            </button>
            <button
              type="button"
              className="text-slate-600 hover:underline"
              onClick={() => setEditing(n)}
            >
              Sửa
            </button>
            <button
              type="button"
              className="text-slate-600 hover:underline"
              onClick={() =>
                act(
                  () =>
                    trpc.accounting.updateCategory.mutate(
                      { id: n.id, isActive: !n.isActive },
                      apiContext(auth),
                    ),
                  n.isActive ? "Đã ngừng sử dụng" : "Đã dùng lại",
                )
              }
            >
              {n.isActive ? "Ngừng" : "Dùng lại"}
            </button>
            {!n.isSystem && n.recordCount === 0 && n.children.length === 0 && (
              <button
                type="button"
                className="text-red-600 hover:underline"
                onClick={() => {
                  if (confirm(`Xoá danh mục "${n.name}"?`))
                    void act(
                      () => trpc.accounting.deleteCategory.mutate({ id: n.id }, apiContext(auth)),
                      "Đã xoá danh mục",
                    );
                }}
              >
                Xoá
              </button>
            )}
          </span>
        </div>
        {render(n.children as CategoryNode[], depth + 1)}
      </div>
    ));

  return (
    <div className="space-y-5">
      <AccountingHeader
        title="Kế toán & Tài chính"
        subtitle="Danh mục thu chi dạng cây — dùng khi lập phiếu, lọc sổ quỹ và báo cáo lời lỗ"
        actions={
          <button
            type="button"
            className={btnPrimary}
            onClick={() => setEditing({ parentId: null })}
          >
            <Plus className="h-4 w-4" /> Thêm danh mục
          </button>
        }
      />
      <ErrorBox message={cats.error} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
        {render(cats.data ?? [], 0)}
        {cats.data && cats.data.length === 0 && (
          <p className="p-8 text-center text-slate-400">Chưa có danh mục — chạy db:seed</p>
        )}
      </div>
      <p className="text-xs text-slate-500">
        “Thu nợ khách hàng”, “Doanh thu bán hàng” và “Tiền nhập hàng” (cùng danh mục con) không tính
        vào lời lỗ — doanh thu bán hàng lấy theo hoá đơn, tiền hàng tính vào giá vốn khi bán.
      </p>
      {editing && (
        <CategoryForm
          auth={auth}
          all={cats.data ?? []}
          editing={"id" in editing ? editing : null}
          parentId={"id" in editing ? editing.parentId : editing.parentId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            cats.reload();
          }}
        />
      )}
    </div>
  );
}

function CategoryForm({
  auth,
  all,
  editing,
  parentId: initialParent,
  onClose,
  onSaved,
}: {
  auth: ApiAuth;
  all: CategoryNode[];
  editing: CategoryNode | null;
  parentId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const flat = flattenCategories(all);
  const parent = flat.find((c) => c.id === initialParent);
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<"revenue" | "expense" | "both">(
    editing?.type ?? (parent && parent.type !== "both" ? parent.type : "expense"),
  );
  const [parentId, setParentId] = useState<number | null>(initialParent);
  const [sortOrder, setSortOrder] = useState(String(editing?.sortOrder ?? ""));
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const ctx = apiContext(auth);
      const order = sortOrder.trim() ? Number(sortOrder) : undefined;
      if (editing) {
        await trpc.accounting.updateCategory.mutate(
          {
            id: editing.id,
            name,
            type,
            parentId,
            ...(order !== undefined ? { sortOrder: order } : {}),
          },
          ctx,
        );
      } else {
        await trpc.accounting.createCategory.mutate(
          { name, type, parentId, ...(order !== undefined ? { sortOrder: order } : {}) },
          ctx,
        );
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Sửa danh mục "${editing.name}"` : "Thêm danh mục thu chi"}
      size="sm"
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Tên danh mục *" htmlFor="cat-name">
          <input
            id="cat-name"
            className={inputCls}
            value={name}
            required
            maxLength={255}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Loại" htmlFor="cat-type">
          <select
            id="cat-type"
            className={inputCls}
            value={type}
            disabled={editing?.isSystem}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="revenue">Thu</option>
            <option value="expense">Chi</option>
            <option value="both">Thu &amp; chi</option>
          </select>
        </Field>
        <Field label="Danh mục cha" htmlFor="cat-parent">
          <select
            id="cat-parent"
            className={inputCls}
            value={parentId ?? ""}
            onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Danh mục gốc —</option>
            {flat
              .filter((c) => c.id !== editing?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Thứ tự" htmlFor="cat-order">
          <input
            id="cat-order"
            className={inputCls}
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className={btnPrimary}>
            Lưu
          </button>
        </div>
      </form>
    </Modal>
  );
}
