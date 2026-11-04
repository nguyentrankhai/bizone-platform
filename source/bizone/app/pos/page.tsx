import { PosClient } from "@/components/pos/PosClient";
import { getDevAuth } from "@/lib/dev-auth";

export const metadata = { title: "POS Bán hàng | BizOne" };

export default function PosPage() {
  return <PosClient auth={getDevAuth()} />;
}
