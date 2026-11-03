"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Loader2, ScanBarcode } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { apiContext, errorMessage, type ApiAuth, type RouterOutputs } from "./shared";

type SearchResult = RouterOutputs["productSearch"]["search"][number];

export interface ScannedProduct {
  productId: number;
  variantId: number | null;
  name: string;
  sku: string;
  unit: string;
}

export interface BarcodeScanInputHandle {
  focus: () => void;
}

interface BarcodeScanInputProps {
  auth: ApiAuth;
  onPick: (product: ScannedProduct) => void;
  placeholder?: string;
  className?: string;
}

function toScanned(p: SearchResult, variantId: number | null = null): ScannedProduct {
  const variant = variantId ? p.productVariants.find((v) => v.id === variantId) : undefined;
  return { productId: p.id, variantId, name: p.name, sku: variant?.sku ?? p.sku, unit: p.unit };
}

/** Exact barcode/SKU match (product or variant) — what a USB scanner sends */
function exactMatch(results: SearchResult[], code: string): ScannedProduct | null {
  const c = code.toLowerCase();
  for (const p of results) {
    if (p.barcode?.toLowerCase() === c || p.sku.toLowerCase() === c) return toScanned(p);
    const v = p.productVariants.find((x) => x.sku.toLowerCase() === c);
    if (v) return toScanned(p, v.id);
  }
  return null;
}

/**
 * Ô quét mã vạch: máy quét USB gõ mã rồi gửi Enter. Luôn auto-focus và lấy lại
 * focus sau mỗi lần thêm để quét liên tục. Gõ tay ≥ 2 ký tự sẽ hiện gợi ý.
 */
export const BarcodeScanInput = forwardRef<BarcodeScanInputHandle, BarcodeScanInputProps>(
  function BarcodeScanInput(
    { auth, onPick, placeholder = "Quét mã vạch hoặc tìm sản phẩm...", className },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const seqRef = useRef(0);

    useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

    async function search(q: string) {
      const seq = ++seqRef.current;
      setLoading(true);
      try {
        const data = await trpc.productSearch.search.query({ q, limit: 10 }, apiContext(auth));
        if (seq === seqRef.current) setResults(data);
        return data;
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }

    function pick(p: ScannedProduct) {
      onPick(p);
      setValue("");
      setResults([]);
      setOpen(false);
      setError(null);
      inputRef.current?.focus();
    }

    function handleChange(v: string) {
      setValue(v);
      setError(null);
      clearTimeout(debounceRef.current);
      if (v.trim().length < 2) {
        setOpen(false);
        return;
      }
      debounceRef.current = setTimeout(() => {
        search(v.trim())
          .then(() => setOpen(true))
          .catch(() => {});
      }, 300);
    }

    async function handleEnter() {
      const code = value.trim();
      if (!code) return;
      clearTimeout(debounceRef.current);
      try {
        const data = await search(code);
        const match = exactMatch(data, code) ?? (data.length === 1 ? toScanned(data[0]) : null);
        if (match) return pick(match);
        if (data.length === 0) {
          setError(`Không tìm thấy sản phẩm "${code}"`);
          setValue("");
        } else {
          setOpen(true);
        }
      } catch (e) {
        setError(errorMessage(e));
      }
    }

    return (
      <div className={cn("relative", className)}>
        <div className="relative">
          <ScanBarcode className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleEnter();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder}
            aria-label="Quét mã vạch"
            className={cn(
              "h-11 w-full rounded-lg border bg-white pr-10 pl-10 text-base outline-none focus:ring-2 focus:ring-blue-100",
              error ? "border-red-400" : "border-gray-300 focus:border-blue-400",
            )}
          />
          {loading && (
            <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
          )}
        </div>
        {error ? (
          <p className="mt-1 text-xs text-red-600">{error}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">
            Kết nối máy quét USB/Bluetooth — ô nhập tự động focus
          </p>
        )}

        {open && results.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {results.flatMap((p) => [
              <li key={`p-${p.id}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(toScanned(p))}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                >
                  <span className="font-medium text-gray-900">{p.name}</span>
                  <span className="text-xs text-gray-500">
                    {p.sku}
                    {p.barcode ? ` · ${p.barcode}` : ""}
                  </span>
                </button>
              </li>,
              ...p.productVariants.map((v) => (
                <li key={`v-${v.id}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(toScanned(p, v.id))}
                    className="flex w-full items-center justify-between py-1.5 pr-3 pl-7 text-left text-sm text-gray-600 hover:bg-blue-50"
                  >
                    <span>↳ Biến thể</span>
                    <span className="text-xs text-gray-500">{v.sku}</span>
                  </button>
                </li>
              )),
            ])}
          </ul>
        )}
      </div>
    );
  },
);
