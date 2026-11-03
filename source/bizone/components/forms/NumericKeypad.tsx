"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  className?: string;
}

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "000", "0", "⌫"];

export function NumericKeypad({ value, onChange, maxLength = 12, className }: NumericKeypadProps) {
  function handleKey(key: string) {
    if (key === "⌫") {
      onChange(value.slice(0, -1) || "0");
      return;
    }
    const next = value === "0" ? key : value + key;
    if (next.length > maxLength) return;
    onChange(next);
  }

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => handleKey(key)}
          className={cn(
            "flex h-14 w-full items-center justify-center rounded-xl border border-gray-200",
            "text-lg font-semibold text-gray-800",
            "bg-white transition hover:bg-gray-50 active:bg-gray-100",
            // POS spec: min 44×44px buttons; we use h-14 = 56px
          )}
        >
          {key === "⌫" ? <Delete className="h-5 w-5 text-gray-500" /> : key}
        </button>
      ))}
    </div>
  );
}
