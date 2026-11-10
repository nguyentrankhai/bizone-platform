import { connection, type NextRequest } from "next/server";
import { handleMomoIpn } from "@/server/routes/momo-webhook";

export async function POST(req: NextRequest): Promise<Response> {
  await connection();
  return handleMomoIpn(req);
}
