import { PHLayout } from "@/components/ph/PHLayout";

export default function SettingsPage() {
  return (
    <PHLayout>
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-gray-800">Cài đặt hệ thống</h1>

        <div className="grid grid-cols-2 gap-5">
          {/* General */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Cài đặt chung</h2>
            <div className="space-y-4">
              {[
                { label: "Múi giờ", value: "Asia/Ho_Chi_Minh (UTC+7)" },
                { label: "Tiền tệ mặc định", value: "VND" },
                { label: "Ngưỡng cảnh báo thất bại", value: "5%" },
                { label: "Timeout giao dịch", value: "900 giây (15 phút)" },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-gray-500">{s.label}</span>
                  <span className="text-sm font-medium text-gray-800">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Bảo mật</h2>
            <div className="space-y-4">
              {[
                { label: "Rate limit (chung)", value: "100 req/min" },
                { label: "Rate limit (POS)", value: "300 req/min" },
                { label: "Rate limit (auth)", value: "10 req/min" },
                { label: "Idempotency key TTL", value: "24 giờ" },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-gray-500">{s.label}</span>
                  <span className="text-sm font-medium text-gray-800">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Webhook */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Webhook</h2>
            <div className="space-y-4">
              {[
                { label: "Số lần retry tối đa", value: "5 lần" },
                { label: "Backoff strategy", value: "Exponential (1s, 2s, 4s, 8s, 16s)" },
                { label: "Signature algorithm", value: "HMAC-SHA256" },
                { label: "Timeout mỗi request", value: "30 giây" },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <span className="text-sm text-gray-500">{s.label}</span>
                  <span className="text-sm font-medium text-gray-800">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PHLayout>
  );
}
