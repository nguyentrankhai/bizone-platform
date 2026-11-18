import Link from "next/link";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/AuthForms";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Đăng ký" };

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <PageTitle>Đăng ký thành viên</PageTitle>
      <p className="text-sm text-slate-600">
        Tích điểm mỗi đơn hàng, ưu đãi theo hạng thành viên — dùng chung với mua tại cửa hàng.
      </p>
      <RegisterForm />
      <p className="text-center text-sm text-slate-500">
        Đã có tài khoản?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
