"use client";

import { NumericKeypad as BaseKeypad } from "@/components/forms/NumericKeypad";
import { fmtMoney } from "@/components/inventory/shared";

/** Suggested cash amounts: exact, then the next round notes above it */
export function cashSuggestions(amount: number): number[] {
  const out = new Set<number>([amount]);
  for (const step of [10_000, 50_000, 100_000, 200_000, 500_000]) {
    const up = Math.ceil(amount / step) * step;
    if (up > amount) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

interface PosKeypadProps {
  value: string;
  onChange: (value: string) => void;
  /** Amount still owed — drives the quick-amount buttons */
  due: number;
}

/** Bàn phím số POS: phím lớn (≥ 44px) + nút mệnh giá gợi ý */
export function NumericKeypad({ value, onChange, due }: PosKeypadProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {cashSuggestions(due).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onChange(String(a))}
            className="h-12 rounded-lg border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            {fmtMoney(a)}
          </button>
        ))}
      </div>
      <BaseKeypad value={value || "0"} onChange={onChange} maxLength={11} />
    </div>
  );
}
