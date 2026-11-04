import Link from "next/link";
import { PHLayout } from "@/components/ph/PHLayout";
import { StatusBadge } from "@/components/ph/StatusBadge";

const RECENT_TXN = [
  {
    id: "TXN-20260801-001",
    time: "14:32:22",
    amount: "₫1,990,000",
    status: "Success" as const,
    method: "VNPay",
  },
  {
    id: "TXN-20260801-002",
    time: "14:18:15",
    amount: "₫350,000",
    status: "Failed" as const,
    method: "MoMo",
  },
  {
    id: "TXN-20260801-003",
    time: "14:22:33",
    amount: "₫890,000",
    status: "Pending" as const,
    method: "ZaloPay",
  },
  {
    id: "TXN-20260801-004",
    time: "14:22:59",
    amount: "₫5,900,000",
    status: "Success" as const,
    method: "VietQR",
  },
  {
    id: "TXN-20260801-005",
    time: "14:19:50",
    amount: "₫320,000",
    status: "Success" as const,
    method: "MoMo",
  },
];

export default function DashboardPage() {
  return (
    <PHLayout>
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Tổng số giao dịch", value: "2,847", sub: "↑ 12.5% so với hôm qua", up: true },
            { label: "Tổng số tiền", value: "₫186.5M", sub: "↑ 8.3% so với hôm qua", up: true },
            { label: "Gần thành công", value: "1,198", sub: "Tỷ lệ 84.1%", up: true },
            { label: "Số thất bại", value: "86", sub: "↓ 3.5% so với hôm qua", up: false },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{s.value}</p>
              <p
                className={`mt-1 text-xs font-medium ${s.up ? "text-emerald-600" : "text-red-500"}`}
              >
                {s.sub}
              </p>
            </div>
          ))}
        </div>

        {/* Recent transactions */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-700">Giao dịch gần đây</h2>
            <Link href="/transactions" className="text-xs text-blue-600 hover:underline">
              Xem tất cả →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">MÃ GD</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">THỜI GIAN</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">SỐ TIỀN</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">TRẠNG THÁI</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">ĐỐI TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {RECENT_TXN.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-blue-600">{t.id}</td>
                    <td className="px-5 py-3 text-gray-500">{t.time}</td>
                    <td className="px-5 py-3 font-semibold text-gray-800">{t.amount}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-600">{t.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PHLayout>
  );
}
