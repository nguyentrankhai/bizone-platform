import { PHLayout } from "@/components/ph/PHLayout";

const WEBHOOKS = [
  { id: "WH-001", merchant: "BizOne POS - HCM", url: "https://bzne-hcm.example.com/webhook", status: "active", lastDelivery: "14:32:01", success: 1243, failed: 2 },
  { id: "WH-002", merchant: "BizOne Online", url: "https://online.example.com/payment-cb", status: "active", lastDelivery: "14:18:45", success: 865, failed: 0 },
  { id: "WH-003", merchant: "BizOne POS - HN", url: "https://bzne-hn.example.com/webhook", status: "inactive", lastDelivery: "09:05:12", success: 432, failed: 5 },
];

export default function WebhooksPage() {
  return (
    <PHLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Webhook Engine</h1>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Thêm endpoint
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                {["ID", "ĐỐI TÁC", "URL", "TRẠNG THÁI", "GỬI CUỐI", "THÀNH CÔNG", "LỖI"].map((h) => (
                  <th key={h} className="px-5 py-3 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {WEBHOOKS.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{w.id}</td>
                  <td className="px-5 py-3 font-medium text-gray-800">{w.merchant}</td>
                  <td className="max-w-48 truncate px-5 py-3 font-mono text-xs text-gray-400">{w.url}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${w.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {w.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{w.lastDelivery}</td>
                  <td className="px-5 py-3 text-emerald-600 font-semibold">{w.success}</td>
                  <td className="px-5 py-3">
                    <span className={w.failed > 0 ? "font-semibold text-red-500" : "text-gray-400"}>{w.failed}</span>
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
