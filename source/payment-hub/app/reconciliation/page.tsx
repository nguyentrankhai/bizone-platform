import { PHLayout } from "@/components/ph/PHLayout";

const RECON_ROWS = [
  {
    date: "2026-07-31",
    total: 2847,
    matched: 2831,
    unmatched: 12,
    mismatch: 4,
    status: "Hoàn thành",
  },
  {
    date: "2026-07-30",
    total: 3012,
    matched: 3000,
    unmatched: 8,
    mismatch: 4,
    status: "Hoàn thành",
  },
  {
    date: "2026-07-29",
    total: 2654,
    matched: 2649,
    unmatched: 5,
    mismatch: 0,
    status: "Hoàn thành",
  },
];

export default function ReconciliationPage() {
  return (
    <PHLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Đối soát (Reconciliation)</h1>
          <button className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Chạy đối soát thủ công
          </button>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          Đối soát tự động chạy hàng ngày lúc 00:00 UTC+7. Lần chạy tiếp theo:{" "}
          <strong>2026-08-02 00:00</strong>.
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                {["NGÀY", "TỔNG GD", "KHỚP", "KHÔNG KHỚP", "SAI SỐ TIỀN", "TRẠNG THÁI"].map((h) => (
                  <th key={h} className="px-5 py-3 text-xs font-medium text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {RECON_ROWS.map((r) => (
                <tr key={r.date} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{r.date}</td>
                  <td className="px-5 py-3 text-gray-700">{r.total.toLocaleString()}</td>
                  <td className="px-5 py-3 font-semibold text-emerald-600">
                    {r.matched.toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={r.unmatched > 0 ? "font-semibold text-amber-600" : "text-gray-400"}
                    >
                      {r.unmatched}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={r.mismatch > 0 ? "font-semibold text-red-500" : "text-gray-400"}
                    >
                      {r.mismatch}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PHLayout>
  );
}
