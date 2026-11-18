import { PosClient } from "@/components/pos/PosClient";
import { RequireAuth } from "@/components/auth/AuthProvider";

export const metadata = { title: "POS Bán hàng | BizOne" };

export default function PosPage() {
  return (
    <RequireAuth>
      <PosClient />
    </RequireAuth>
  );
}
