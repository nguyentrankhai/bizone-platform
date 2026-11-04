import { SessionClient } from "@/components/pos/SessionClient";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "Ca bán hàng | BizOne" };

export default function PosSessionPage() {
  return <SessionClient auth={getDevAuth()} />;
}
