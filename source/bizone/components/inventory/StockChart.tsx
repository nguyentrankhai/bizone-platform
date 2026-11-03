import { fmtNumber, type RouterOutputs } from "./shared";

type StockRow = RouterOutputs["inventory"]["stockByWarehouse"][number];

/** Biểu đồ cột ngang: tổng tồn theo kho */
export function StockChart({ data }: { data: StockRow[] }) {
  const max = Math.max(1, ...data.map((d) => d.totalQuantity));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">Tồn kho theo kho</h3>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Chưa có dữ liệu</p>
      ) : (
        <ul className="flex flex-col gap-3" role="list" aria-label="Tồn kho theo kho">
          {data.map((d) => (
            <li key={d.id}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-gray-700">{d.name}</span>
                <span className="text-gray-500">
                  {fmtNumber(d.totalQuantity)} · {d.itemCount} mặt hàng
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${(d.totalQuantity / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
