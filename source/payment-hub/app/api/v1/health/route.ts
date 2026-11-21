import { connection } from "next/server";
import { handleHealthV1 } from "@/server/routes/health";

export async function GET(req: Request): Promise<Response> {
  await connection();
  return handleHealthV1(req);
}
