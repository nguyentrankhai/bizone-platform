import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="text-slate-500">Trang hoặc cửa hàng bạn tìm không tồn tại.</p>
      <Link href="/" className="text-primary hover:underline">
        Về trang chủ
      </Link>
    </div>
  );
}
