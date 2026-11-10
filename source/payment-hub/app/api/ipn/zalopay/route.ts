import { connection, type NextRequest } from "next/server";
import { handleZalopayCallback } from "@/server/routes/zalopay-callback";

export async function POST(req: NextRequest): Promise<Response> {
  await connection();
  return handleZalopayCallback(req);
}
