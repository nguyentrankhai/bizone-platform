import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">BizOne</h1>
      <p className="max-w-md text-base text-muted-foreground">
        Nền tảng quản lý bán hàng All-in-One đa kênh cho SME Việt Nam
      </p>
      <Button size="lg">Bắt đầu</Button>
    </main>
  );
}
