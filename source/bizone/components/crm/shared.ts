export const RANKING: Record<string, { label: string; className: string }> = {
  silver: { label: "Silver", className: "bg-slate-100 text-slate-600" },
  gold: { label: "Gold", className: "bg-amber-50 text-amber-700" },
  vip: { label: "VIP", className: "bg-indigo-50 text-indigo-700" },
  diamond: { label: "Diamond", className: "bg-purple-50 text-purple-700" },
};

export const DEBT_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Chờ thanh toán", className: "bg-amber-50 text-amber-700" },
  partial: { label: "Thanh toán 1 phần", className: "bg-blue-50 text-blue-700" },
  paid: { label: "Đã thanh toán", className: "bg-emerald-50 text-emerald-700" },
  overdue: { label: "Quá hạn", className: "bg-red-50 text-red-700" },
};

export const LOYALTY_TYPE: Record<string, { label: string; sign: string }> = {
  earn: { label: "Tích điểm", sign: "+" },
  redeem: { label: "Đổi điểm", sign: "-" },
  expire: { label: "Hết hạn", sign: "-" },
  adjust: { label: "Điều chỉnh", sign: "±" },
};

export const GENDER_LABEL: Record<string, string> = {
  male: "Nam",
  female: "Nữ",
  other: "Khác",
};
