"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, FolderOpen, Folder, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  children?: CategoryNode[];
  _count?: { products?: number };
}

interface CategoryTreeProps {
  categories: CategoryNode[];
  selectedId?: number | null;
  onSelect: (id: number | null) => void;
  loading?: boolean;
}

function CategoryItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: CategoryNode;
  depth: number;
  selectedId?: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
          isSelected ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-100",
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(isSelected ? null : node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            className="shrink-0 text-gray-400 hover:text-gray-600"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        {hasChildren ? (
          open ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-amber-500" />
          )
        ) : (
          <Tag className="h-4 w-4 shrink-0 text-gray-400" />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        {node._count?.products != null && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
            {node._count.products}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {node.children!.map((child) => (
            <CategoryItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryTree({ categories, selectedId, onSelect, loading }: CategoryTreeProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Danh mục
      </div>
      <div className="p-2">
        <div
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            selectedId == null ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-100",
          )}
          onClick={() => onSelect(null)}
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
          <span>Tất cả sản phẩm</span>
        </div>
        {loading ? (
          <div className="py-4 text-center text-xs text-gray-400">Đang tải...</div>
        ) : (
          categories.map((node) => (
            <CategoryItem
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
