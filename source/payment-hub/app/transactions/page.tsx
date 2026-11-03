import { PHLayout } from "@/components/ph/PHLayout";
import { StatusBadge, type TxnStatus } from "@/components/ph/StatusBadge";

const STATUSES: TxnStatus[] = ["Success", "Failed", "Pending", "Expired", "Created", "Refunded"];

const MOCK_TRANSACTIONS = Array.from({ length: 20 }, (_, i) => ({
  id: `TXN-20260801-${String(i + 1).padStart(3, "0")}`,
  time: `${String(14 + Math.floor(i / 4)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}`,
  amount: `₫${((i + 1) * 125000).toLocaleString("vi-VN")}`,
  status: STATUSES[i % STATUSES.length],
  method: ["VNPay", "MoMo", "ZaloPay", "VietQR"][i % 4],
  merchant: `BizOne POS ${i % 3 === 0 ? "HCM" : i % 3 === 1 ? "HN" : "DN"}`,
}));

export default function TransactionsPage() {
  return (
    <PHLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Giao dịch</h1>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Xuất Excel
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <option>Tất cả trạng thái</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <option>Tất cả phương thức</option>
            <option>VNPay</option>
            <option>MoMo</option>
            <option>ZaloPay</option>
            <option>VietQR</option>
          </select>
          <input
            type="date"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
            defaultValue="2026-08-01"
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                {["MÃ GD", "THỜI GIAN", "SỐ TIỀN", "TRẠNG THÁI", "PHƯƠNG THỨC", "ĐỐI TÁC"].map((h) => (
                  <th key={h} className="px-5 py-3 text-xs font-medium text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_TRANSACTIONS.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs text-blue-600">{t.id}</td>
                  <td className="px-5 py-3 text-gray-500">{t.time}</td>
                  <td className="px-5 py-3 font-semibold text-gray-800">{t.amount}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-5 py-3 text-gray-600">{t.method}</td>
                  <td className="px-5 py-3 text-gray-600">{t.merchant}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PHLayout>
  );
}
