import { redirect } from "next/navigation";

/** Cài đặt: chỉ có trang Chi nhánh (P4.6) — các mục cấu hình khác làm sau */
export default function SettingsPage() {
  redirect("/settings/branches");
}
