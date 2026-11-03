import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TransactionForm } from "@/components/inventory/TransactionForm";
import { getDevAuth } from "@/lib/dev-auth";

type Props = { searchParams: Promise<{ direction?: string | string[] }> };

export const metadata = { title: "Phiếu kho | BizOne" };

export default function NewTransactionPage({ searchParams }: Props) {
  return (
    <AppLayout>
      <Suspense fallback={<p className="text-sm text-gray-400">Đang tải...</p>}>
        <NewTransaction searchParams={searchParams} />
      </Suspense>
    </AppLayout>
  );
}

async function NewTransaction({ searchParams }: Props) {
  const direction = (await searchParams).direction === "out" ? "out" : "in";
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {direction === "in" ? "Nhập kho" : "Xuất kho"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Tạo phiếu {direction === "in" ? "nhập" : "xuất"} kho, quét mã vạch để thêm sản phẩm
        </p>
      </div>
      <TransactionForm key={direction} auth={getDevAuth()} direction={direction} />
    </>
  );
}
