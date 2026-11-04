import { connection, type NextRequest } from "next/server";
import { handleVnpayIpn } from "@/server/routes/vnpay-ipn";

export async function GET(req: NextRequest): Promise<Response> {
  await connection();
  return handleVnpayIpn(req);
}
