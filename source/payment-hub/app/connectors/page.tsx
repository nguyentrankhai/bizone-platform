import { PHLayout } from "@/components/ph/PHLayout";

const CONNECTORS = [
  { name: "VNPay", type: "QR + ATM", status: "active", latency: "120ms", uptime: "99.9%" },
  { name: "MoMo", type: "E-wallet", status: "active", latency: "95ms", uptime: "99.7%" },
  { name: "ZaloPay", type: "E-wallet", status: "active", latency: "88ms", uptime: "98.5%" },
  { name: "VietQR", type: "QR", status: "active", latency: "65ms", uptime: "99.8%" },
];

export default function ConnectorsPage() {
  return (
    <PHLayout>
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-gray-800">Connector Engine</h1>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CONNECTORS.map((c) => (
            <div key={c.name} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-gray-800">{c.name}</span>
                <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Active
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{c.type}</p>
              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Latency</span>
                  <span className="font-medium text-gray-700">{c.latency}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Uptime</span>
                  <span className="font-medium text-emerald-600">{c.uptime}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PHLayout>
  );
}
