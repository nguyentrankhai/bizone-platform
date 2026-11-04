import { PHLayout } from "@/components/ph/PHLayout";

const MERCHANTS = [
  {
    id: "BZNE-HCM",
    name: "BizOne POS - HCM",
    code: "BZNE-HCM",
    txns: 483,
    revenue: "₫72.3M",
    rate: "98.3%",
  },
  {
    id: "BZNE-HN",
    name: "BizOne POS - HN",
    code: "BZNE-HN",
    txns: 362,
    revenue: "₫54.1M",
    rate: "94.2%",
  },
  {
    id: "BZNE-ONL",
    name: "BizOne Online",
    code: "BZNE-ONL",
    txns: 215,
    revenue: "₫42.8M",
    rate: "97.5%",
  },
];

export default function MerchantsPage() {
  return (
    <PHLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Đối tác (Merchant)</h1>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Thêm đối tác
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                {["TÊN ĐỐI TÁC", "MÃ", "SỐ GD", "DOANH THU", "TỶ LỆ THÀNH CÔNG", "THAO TÁC"].map(
                  (h) => (
                    <th key={h} className="px-5 py-3 text-xs font-medium text-gray-500">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MERCHANTS.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{m.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{m.code}</td>
                  <td className="px-5 py-3 text-gray-700">{m.txns}</td>
                  <td className="px-5 py-3 font-semibold text-gray-800">{m.revenue}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      {m.rate}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button className="text-xs text-blue-600 hover:underline">Chi tiết</button>
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
