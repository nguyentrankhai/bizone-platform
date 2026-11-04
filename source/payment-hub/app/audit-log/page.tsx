import { PHLayout } from "@/components/ph/PHLayout";

const LOG_ENTRIES = [
  {
    id: "AL-001",
    time: "14:32:01",
    actor: "system",
    action: "transaction.created",
    resource: "TXN-20260801-001",
    ip: "10.0.0.1",
  },
  {
    id: "AL-002",
    time: "14:32:05",
    actor: "system",
    action: "transaction.status_changed",
    resource: "TXN-20260801-001 → Success",
    ip: "10.0.0.1",
  },
  {
    id: "AL-003",
    time: "14:32:06",
    actor: "system",
    action: "webhook.delivered",
    resource: "WH-001",
    ip: "10.0.0.1",
  },
  {
    id: "AL-004",
    time: "14:18:22",
    actor: "admin@bizone",
    action: "merchant.updated",
    resource: "BZNE-HN",
    ip: "172.16.0.5",
  },
  {
    id: "AL-005",
    time: "14:05:00",
    actor: "system",
    action: "reconciliation.started",
    resource: "2026-07-31",
    ip: "10.0.0.1",
  },
];

export default function AuditLogPage() {
  return (
    <PHLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Audit Log</h1>
            <p className="text-xs text-gray-400">
              Append-only · Lưu trữ 90 ngày · Không thể xoá/sửa
            </p>
          </div>
          <button className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Xuất CSV
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                {["ID", "THỜI GIAN", "TÁC NHÂN", "HÀNH ĐỘNG", "TÀI NGUYÊN", "IP"].map((h) => (
                  <th key={h} className="px-5 py-3 text-xs font-medium text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {LOG_ENTRIES.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{e.id}</td>
                  <td className="px-5 py-3 text-gray-500">{e.time}</td>
                  <td className="px-5 py-3 text-gray-700">{e.actor}</td>
                  <td className="px-5 py-3 font-mono text-xs text-blue-600">{e.action}</td>
                  <td className="px-5 py-3 text-gray-600">{e.resource}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{e.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PHLayout>
  );
}
