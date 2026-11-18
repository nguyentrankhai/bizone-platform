import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { bizone } from "@/lib/bizone-sync";
import { currentStore } from "@/lib/store";
import { customerToken } from "@/lib/session";
import { logoutAction } from "@/app/actions";
import { Alert, PageTitle, btnOutline } from "@/components/ui";
import { RANKING_LABEL } from "@/lib/types";
import { fmtDateTime, fmtVnd } from "@/lib/format";

export const metadata: Metadata = { title: "Tài khoản" };

/** Tài khoản: hạng thành viên, điểm tích luỹ (dùng chung với mua tại cửa hàng), lịch sử điểm */
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams;
  const store = await currentStore();
  const token = await customerToken(store);
  if (!token) redirect("/login");
  const me = await bizone.me(store, token).catch(() => null);
  // Expired / revoked session: log in again (the stale cookie is replaced on login)
  if (!me) redirect("/login");
  const points = await bizone.points(store, token).catch(() => null);
  return (
    <div className="space-y-5">
      <PageTitle>Xin chào, {me.fullName}</PageTitle>
      {sp.welcome && (
        <Alert kind="ok">Đăng ký thành công! Mỗi đơn hàng hoàn thành sẽ được tích điểm.</Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Hạng thành viên</div>
          <div className="text-xl font-bold" data-testid="ranking">
            {RANKING_LABEL[me.ranking]}
          </div>
          <div className="text-xs text-slate-500">
            {me.memberDiscountPercent ? `Giảm ${me.memberDiscountPercent}% mỗi đơn · ` : ""}x
            {me.pointMultiplier} điểm
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Điểm tích luỹ</div>
          <div className="text-xl font-bold text-primary" data-testid="points">
            {me.totalPoints.toLocaleString("vi-VN")}
          </div>
          <div className="text-xs text-slate-500">1.000₫ = 1 điểm (theo hạng)</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Tổng chi tiêu</div>
          <div className="text-xl font-bold">{fmtVnd(me.totalSpent)}</div>
          <div className="text-xs text-slate-500">{me.phone}</div>
        </div>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Lịch sử điểm</h2>
          <Link href="/orders" className="text-sm text-primary hover:underline">
            Đơn hàng của tôi →
          </Link>
        </div>
        {points && points.items.length > 0 ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {points.items.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-2">
                <span>
                  {p.notes ?? p.type}
                  <span className="block text-xs text-slate-400">{fmtDateTime(p.createdAt)}</span>
                </span>
                <span
                  className={
                    p.points >= 0 ? "font-semibold text-green-700" : "font-semibold text-red-600"
                  }
                >
                  {p.points >= 0 ? "+" : ""}
                  {p.points}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">
            Chưa có điểm — điểm được cộng khi đơn hàng hoàn thành.
          </p>
        )}
      </section>
      <form action={logoutAction}>
        <button className={btnOutline}>Đăng xuất</button>
      </form>
    </div>
  );
}
