import { PHLayout } from "@/components/ph/PHLayout";

export default function ReportsPage() {
  return (
    <PHLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Báo cáo</h1>
          <div className="flex gap-2">
            <button className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Xuất PDF
            </button>
            <button className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Xuất Excel
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            {
              title: "Báo cáo giao dịch",
              desc: "Tổng hợp giao dịch theo ngày/tuần/tháng",
              icon: "📊",
            },
            {
              title: "Báo cáo doanh thu",
              desc: "Doanh thu theo phương thức thanh toán",
              icon: "💰",
            },
            { title: "Báo cáo đối soát", desc: "Kết quả đối soát tự động hàng ngày", icon: "✅" },
            { title: "Báo cáo hoàn tiền", desc: "Giao dịch hoàn tiền (full/partial)", icon: "↩️" },
            {
              title: "Báo cáo lỗi",
              desc: "Phân tích giao dịch thất bại theo nguyên nhân",
              icon: "⚠️",
            },
            { title: "Báo cáo hiệu suất", desc: "Latency, uptime của từng connector", icon: "⚡" },
          ].map((r) => (
            <button
              key={r.title}
              className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
            >
              <span className="text-2xl">{r.icon}</span>
              <span className="text-sm font-semibold text-gray-800">{r.title}</span>
              <span className="text-xs text-gray-500">{r.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </PHLayout>
  );
}
