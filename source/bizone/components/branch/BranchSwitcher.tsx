"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Store } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { getSelectedBranch, setSelectedBranch } from "@/lib/branch-client";
import { apiContext, type ApiAuth, type RouterOutputs } from "@/components/inventory/shared";

type Mine = RouterOutputs["branch"]["mine"];

/**
 * Chọn chi nhánh làm việc (P4.6). Danh sách = chi nhánh người dùng được phân công (quản trị: tất
 * cả + "Tất cả chi nhánh"). Đổi chi nhánh → tải lại trang để mọi dữ liệu theo chi nhánh mới.
 */
export function BranchSwitcher({ auth }: { auth: ApiAuth }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getSelectedBranch();
    if (stored === null) setSelectedBranch(null); // keep the cookie in sync with localStorage
    trpc.branch.mine
      .query(undefined, apiContext(auth))
      .then((m) => {
        const valid =
          stored === null ||
          (stored === "all" ? m.canAll : m.branches.some((b) => String(b.id) === stored));
        if (!valid) {
          // Branch removed from the user / deactivated → back to the server default
          setSelectedBranch(null);
          window.location.reload();
          return;
        }
        setMine(m);
        setSelected(stored ?? (m.current === null ? "all" : String(m.current)));
      })
      .catch(() => setMine(null));
  }, [auth]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!mine || mine.branches.length === 0) return null;

  const options = [
    ...(mine.canAll ? [{ value: "all", label: "Tất cả chi nhánh" }] : []),
    ...mine.branches.map((b) => ({
      value: String(b.id),
      label: b.name + (b.isDefault ? " (mặc định)" : ""),
    })),
  ];
  const current = options.find((o) => o.value === selected) ?? options[0];
  const single = options.length === 1;

  function pick(value: string) {
    setOpen(false);
    if (value === selected) return;
    setSelectedBranch(value);
    window.location.reload();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !single && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Chi nhánh: ${current.label}`}
        data-testid="branch-switcher"
        className={cn(
          "flex max-w-[14rem] items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700",
          single ? "cursor-default" : "hover:bg-gray-50",
        )}
      >
        <Store className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="truncate">{current.label}</span>
        {!single && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Chọn chi nhánh"
          className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((o) => (
            <li key={o.value}>
              <button
                role="option"
                aria-selected={o.value === current.value}
                onClick={() => pick(o.value)}
                className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-gray-50"
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    o.value === current.value ? "text-blue-600" : "invisible",
                  )}
                />
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
