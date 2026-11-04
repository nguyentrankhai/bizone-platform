export const ORDER_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Chờ xác nhận", className: "bg-amber-50 text-amber-700" },
  confirmed: { label: "Đã xác nhận", className: "bg-blue-50 text-blue-700" },
  preparing: { label: "Đang chuẩn bị", className: "bg-indigo-50 text-indigo-700" },
  shipping: { label: "Đang giao", className: "bg-violet-50 text-violet-700" },
  delivered: { label: "Đã giao", className: "bg-teal-50 text-teal-700" },
  completed: { label: "Hoàn thành", className: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Đã huỷ", className: "bg-red-50 text-red-600" },
  returned: { label: "Hoàn trả", className: "bg-orange-50 text-orange-700" },
};

export const PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
  unpaid: { label: "Chưa TT", className: "bg-red-50 text-red-600" },
  partial: { label: "TT một phần", className: "bg-amber-50 text-amber-700" },
  paid: { label: "Đã TT", className: "bg-emerald-50 text-emerald-700" },
};

export const CHANNEL_LABEL: Record<string, string> = {
  pos: "Tại quầy",
  website: "Website",
  shopee: "Shopee",
  lazada: "Lazada",
  tiktok: "TikTok Shop",
  facebook: "Facebook",
  zalo: "Zalo",
};

export const NEXT_STATUS: Record<string, string | null> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "shipping",
  shipping: "delivered",
  delivered: "completed",
  completed: null,
  cancelled: null,
  returned: null,
};

export const NEXT_STATUS_LABEL: Record<string, string> = {
  confirmed: "Xác nhận đơn",
  preparing: "Bắt đầu chuẩn bị",
  shipping: "Bàn giao vận chuyển",
  delivered: "Đã giao hàng",
  completed: "Hoàn thành",
};
