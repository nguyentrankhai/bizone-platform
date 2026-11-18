import { SessionClient } from "@/components/pos/SessionClient";
import { RequireAuth } from "@/components/auth/AuthProvider";

export const metadata = { title: "Ca bán hàng | BizOne" };

export default function PosSessionPage() {
  return (
    <RequireAuth>
      <SessionClient />
    </RequireAuth>
  );
}
