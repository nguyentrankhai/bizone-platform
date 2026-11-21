import { connection } from "next/server";
import { handleLiveness } from "@/server/routes/health";

export async function GET(): Promise<Response> {
  await connection();
  return handleLiveness();
}
