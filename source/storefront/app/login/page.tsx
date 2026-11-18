import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "@/components/AuthForms";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/account";
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <PageTitle>Đăng nhập</PageTitle>
      <LoginForm next={next} />
      <p className="text-center text-sm text-slate-500">
        Chưa có tài khoản?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Đăng ký
        </Link>
      </p>
    </div>
  );
}
